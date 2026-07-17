import { useState } from "react";
import { MatterRecord, UploadedDocumentRecord } from "@/types";
import { BACKEND_URL } from "../config";

/**
 * Blank-document matter intake: an initial natural-language instruction
 * plus client materials (meeting transcript, client email) go to the
 * backend, which extracts the matter details -- reusing an existing
 * repository matter when the parties unambiguously match one, otherwise
 * creating (and persisting) a new matter.
 */

export interface IntakeResult {
  matter: MatterRecord;
  source: "repository" | "extracted";
  note: string;
  gaps: string[];
}

export function useMatterIntake() {
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (instruction: string, documents: UploadedDocumentRecord[]): Promise<IntakeResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/matter-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          uploadedDocuments: documents.map((d) => ({
            filename: d.filename,
            documentRole: d.documentRole,
            fileId: d.claudeFileReference,
          })),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error || `Matter intake failed (HTTP ${response.status}).`
        );
      }

      const data = (await response.json()) as IntakeResult;
      setResult(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error during matter intake.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { result, loading, error, run, reset };
}
