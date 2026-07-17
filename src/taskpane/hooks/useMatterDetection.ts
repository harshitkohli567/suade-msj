import { useState } from "react";
import { MatterMatchResult, findMatterMatches } from "@/data/matters/matterMatching";
import { loadMatterRepository } from "@/data/matters/matterRepository";
import { readFullDocumentText } from "../office/documentText";

interface MatterDetectionState {
  results: MatterMatchResult[];
  loading: boolean;
  error: string | null;
  hasRun: boolean;
}

/**
 * Matter Detection (FR-8.1-8.2, FR-8.6). Manual "Detect Matter" trigger
 * for now, same pattern as useSectionDebug -- FR-8.1's "on document open,
 * and periodically thereafter" auto-triggering isn't wired up yet; this
 * step delivers the matching engine and its display, not the lifecycle
 * hooks. A future step should call this automatically on document open.
 */
export function useMatterDetection() {
  const [state, setState] = useState<MatterDetectionState>({
    results: [],
    loading: false,
    error: null,
    hasRun: false,
  });

  const run = () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    // Force-reload so matters created via intake during this session are
    // visible to detection immediately, not just after a pane reload.
    Promise.all([loadMatterRepository(true), readFullDocumentText()])
      .then(([matters, documentText]) => {
        const results = findMatterMatches(documentText, matters);
        setState({ results, loading: false, error: null, hasRun: true });
      })
      .catch((err: unknown) => {
        setState((prev) => ({
          ...prev,
          loading: false,
          hasRun: true,
          error: err instanceof Error ? err.message : "Unknown error detecting matter.",
        }));
      });
  };

  return { ...state, run };
}
