import { useState } from "react";
import { MatterRecord, DocumentSection, SkillRecord, UploadedDocumentRecord } from "@/types";
import { readSectionText } from "../office/documentText";
import { BACKEND_URL, LAWYER_ID } from "../config";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // give up after 10 minutes of polling

interface RunArgs {
  skill: SkillRecord | null;
  matter: MatterRecord | null;
  activeSection: DocumentSection | null;
  uploadedDocuments: UploadedDocumentRecord[];
  message: string;
  sectionType: string | null;
}

export interface TraceEntry {
  at: string; // ISO 8601
  message: string;
}

/** Channel-2 output: a rendered .docx normally, or raw text if rendering failed. */
export type WorkingNotes = { kind: "docx"; base64: string; filename: string } | { kind: "inline"; text: string };

type RunStatus =
  | { status: "pending"; trace?: TraceEntry[] }
  | {
      status: "done";
      output: string;
      trace?: TraceEntry[];
      workingNotesDocxBase64?: string | null;
      workingNotesFilename?: string | null;
      workingNotesInline?: string | null;
    }
  | { status: "error"; error: string; trace?: TraceEntry[] };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A Skill run can take well over a minute (extended thinking on longer
 * Skills), and Word's task pane webview aborts a single request that runs
 * past ~60s. So the backend returns a runId almost immediately and does
 * the actual Claude call in the background; this polls a small status
 * endpoint every few seconds instead of holding one long request open.
 */
export function useSkillRunner() {
  const [output, setOutput] = useState<string | null>(null);
  const [workingNotes, setWorkingNotes] = useState<WorkingNotes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceEntry[]>([]);

  const run = async (args: RunArgs) => {
    setLoading(true);
    setError(null);
    setOutput(null);
    setWorkingNotes(null);
    setTrace([]);

    try {
      const sectionText = args.activeSection ? await readSectionText(args.activeSection) : "";

      const startResponse = await fetch(`${BACKEND_URL}/api/run-skill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId: args.skill ? args.skill.skillId : null,
          sourceFile: args.skill ? args.skill.sourceFile : null,
          matter: args.matter,
          section: args.activeSection
            ? { sectionId: args.activeSection.sectionId, title: args.activeSection.title, text: sectionText }
            : null,
          uploadedDocuments: args.uploadedDocuments.map((d) => ({
            filename: d.filename,
            documentRole: d.documentRole,
            fileId: d.claudeFileReference,
            documentUrl: d.documentUrl,
          })),
          message: args.message,
          lawyerId: LAWYER_ID,
          sectionType: args.sectionType,
        }),
      });

      if (!startResponse.ok) {
        const body = await startResponse.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ||
            `Backend returned HTTP ${startResponse.status}. Is "npm run server" running?`
        );
      }

      const { runId } = (await startResponse.json()) as { runId: string };

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);

        const pollResponse = await fetch(`${BACKEND_URL}/api/run-skill/${runId}`);
        if (!pollResponse.ok) {
          const body = await pollResponse.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error || `Backend returned HTTP ${pollResponse.status}.`);
        }

        const result = (await pollResponse.json()) as RunStatus;
        if (result.trace) {
          setTrace(result.trace);
        }
        if (result.status === "done") {
          if (result.workingNotesDocxBase64 && result.workingNotesFilename) {
            setWorkingNotes({ kind: "docx", base64: result.workingNotesDocxBase64, filename: result.workingNotesFilename });
          } else if (result.workingNotesInline) {
            setWorkingNotes({ kind: "inline", text: result.workingNotesInline });
          }
          setOutput(result.output);
          return;
        }
        if (result.status === "error") {
          throw new Error(result.error);
        }
        // status === "pending" -- keep polling
      }

      throw new Error("Skill run timed out after 10 minutes without a result.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unknown error running Skill. Check that the backend (npm run server) is running."
      );
    } finally {
      setLoading(false);
    }
  };

  /** Clears the previous run's entire surface (output, notes, trace, error). */
  const reset = () => {
    setOutput(null);
    setWorkingNotes(null);
    setError(null);
    setTrace([]);
  };

  return { run, output, workingNotes, loading, error, trace, reset };
}
