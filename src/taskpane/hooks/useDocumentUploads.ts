import { useState } from "react";
import { UploadedDocumentRecord, DocumentRole } from "@/types";
import { BACKEND_URL } from "../config";

/**
 * Document upload -- Step 6 (UI + data model) extended in Step 9 to
 * actually call the backend, which uploads to Anthropic's Files API
 * (client.beta.files.upload) and returns a real file_id. claudeFileReference
 * now holds that real ID, not a mock placeholder.
 *
 * Uploads a batch concurrently (bounded by CONCURRENCY_LIMIT) rather than
 * one at a time, so selecting a large volume of documents (e.g. a full
 * discovery bundle) doesn't serialize into one file at a time -- but also
 * doesn't fire hundreds of simultaneous HTTPS requests at the local backend.
 *
 * removeDocument calls the backend to actually delete the file from
 * Anthropic's Files API (not just drop it from local state) -- otherwise
 * "removed" documents would keep sitting in the shared workspace forever.
 */

const CONCURRENCY_LIMIT = 3;

export const DOCUMENT_ROLES: DocumentRole[] = [
  "governing_contract",
  "witness_statement",
  "expert_report",
  "exhibit",
  "corporate_registry",
  "client_communication",
  "other",
];

/**
 * Documents uploaded during matter intake, before any matter exists, are
 * parked under this pseudo-matter and reassigned to the real matter once
 * intake resolves one.
 */
export const UNASSIGNED_MATTER_ID = "unassigned";

export type UploadJobStatus = "queued" | "uploading" | "done" | "error";

export interface UploadJob {
  id: string;
  filename: string;
  status: UploadJobStatus;
  error?: string;
}

function inferFileType(filename: string): "pdf" | "docx" | "msg" {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".msg")) return "msg";
  return "pdf";
}

function inferMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".msg")) return "application/vnd.ms-outlook";
  return "application/pdf";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is a data URL like "data:application/pdf;base64,AAAA..." -- strip the prefix.
      const base64 = result.substring(result.indexOf(",") + 1);
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function runWithConcurrencyLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const current = nextIndex++;
    if (current >= items.length) return;
    await worker(items[current]);
    return runNext();
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()));
}

export function useDocumentUploads() {
  const [documents, setDocuments] = useState<UploadedDocumentRecord[]>([]);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [removingDocumentIds, setRemovingDocumentIds] = useState<string[]>([]);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const updateJob = (jobId: string, patch: Partial<UploadJob>) => {
    setUploadJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j)));
  };

  const uploadOne = async (file: File, matterId: string, documentRole: DocumentRole, jobId: string) => {
    updateJob(jobId, { status: "uploading" });
    try {
      const base64Content = await fileToBase64(file);
      const response = await fetch(`${BACKEND_URL}/api/upload-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: inferMimeType(file.name),
          base64Content,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ||
            `Upload failed (HTTP ${response.status}). Is "npm run server" running?`
        );
      }

      const data = (await response.json()) as {
        fileId: string;
        documentToken?: string;
        documentUrl?: string;
      };

      const record: UploadedDocumentRecord = {
        documentId: `doc-${crypto.randomUUID()}`,
        matterId,
        claudeFileReference: data.fileId,
        documentToken: data.documentToken ?? null,
        documentUrl: data.documentUrl ?? null,
        filename: file.name,
        fileType: inferFileType(file.name),
        documentRole,
        uploadedBy: "current lawyer (placeholder -- no auth built yet)",
        uploadedAt: new Date().toISOString(),
        linkedSkillRunIds: [],
      };
      setDocuments((prev) => [...prev, record]);
      updateJob(jobId, { status: "done" });
    } catch (err) {
      updateJob(jobId, {
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error uploading document.",
      });
    }
  };

  const uploadDocuments = async (files: File[], matterId: string, documentRole: DocumentRole) => {
    if (files.length === 0) return;

    setUploadError(null);
    setUploading(true);

    const jobs: UploadJob[] = files.map((file) => ({
      id: `job-${crypto.randomUUID()}`,
      filename: file.name,
      status: "queued",
    }));
    setUploadJobs(jobs);

    const work = files.map((file, i) => ({ file, jobId: jobs[i].id }));
    await runWithConcurrencyLimit(work, CONCURRENCY_LIMIT, ({ file, jobId }) =>
      uploadOne(file, matterId, documentRole, jobId)
    );

    setUploading(false);
  };

  const removeDocument = async (documentId: string) => {
    const doc = documents.find((d) => d.documentId === documentId);
    if (!doc) return;

    setRemoveError(null);
    setRemovingDocumentIds((prev) => [...prev, documentId]);

    try {
      const deleteUrl =
        `${BACKEND_URL}/api/upload-document/${doc.claudeFileReference}` +
        (doc.documentToken ? `?docToken=${encodeURIComponent(doc.documentToken)}` : "");
      const response = await fetch(deleteUrl, { method: "DELETE" });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `Remove failed (HTTP ${response.status}).`);
      }

      setDocuments((prev) => prev.filter((d) => d.documentId !== documentId));
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Unknown error removing document.");
    } finally {
      setRemovingDocumentIds((prev) => prev.filter((id) => id !== documentId));
    }
  };

  const documentsForMatter = (matterId: string): UploadedDocumentRecord[] =>
    documents.filter((d) => d.matterId === matterId);

  /** Moves docs parked under one matter id (e.g. "unassigned") to another once intake resolves the real matter. */
  const reassignDocuments = (fromMatterId: string, toMatterId: string) => {
    setDocuments((prev) => prev.map((d) => (d.matterId === fromMatterId ? { ...d, matterId: toMatterId } : d)));
  };

  return {
    uploadDocuments,
    removeDocument,
    documentsForMatter,
    reassignDocuments,
    uploading,
    uploadError,
    uploadJobs,
    removingDocumentIds,
    removeError,
  };
}
