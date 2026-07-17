import { useState } from "react";
import { DocumentSection } from "@/types";
import { ParagraphSignal, classifySections } from "../office/sectionDetection";
import { readAllParagraphSignals } from "../office/paragraphSignals";

interface DebugState {
  signals: ParagraphSignal[];
  sections: DocumentSection[];
  loading: boolean;
  error: string | null;
}

export function useSectionDebug() {
  const [state, setState] = useState<DebugState>({
    signals: [],
    sections: [],
    loading: false,
    error: null,
  });

  const run = () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    readAllParagraphSignals()
      .then((signals) => {
        setState({ signals, sections: classifySections(signals), loading: false, error: null });
      })
      .catch((err: unknown) => {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "Unknown error running diagnostics.",
        }));
      });
  };

  return { ...state, run };
}
