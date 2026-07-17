import { useEffect, useRef, useState } from "react";
import { DocumentContext } from "@/types";
import { readDocumentContext } from "../office/documentContext";
import { debounce } from "../utils/debounce";

/* global Office */

const DEBOUNCE_MS = 150;

interface UseDocumentContextResult {
  context: DocumentContext | null;
  error: string | null;
}

/**
 * Subscribes to Word's DocumentSelectionChanged event and keeps a debounced,
 * live DocumentContext in React state (FR-1.1, FR-1.6). Registers on mount,
 * does one immediate read so the pane isn't blank before the first
 * selection change, and cleans up the handler on unmount.
 */
export function useDocumentContext(): UseDocumentContextResult {
  const [context, setContext] = useState<DocumentContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  // useRef so the debounced function's identity is stable across renders —
  // otherwise every render would create a new debounce timer and defeat
  // the point of debouncing. The setState calls inside are safe to close
  // over once: React guarantees setState function identity never changes.
  const debouncedRefresh = useRef(
    debounce(() => {
      readDocumentContext()
        .then((next) => {
          setContext(next);
          setError(null);
        })
        .catch((err: unknown) => {
          console.error("Suade: failed to read document context", err);
          setError(err instanceof Error ? err.message : "Unknown error reading document context.");
        });
    }, DEBOUNCE_MS)
  );

  useEffect(() => {
    debouncedRefresh.current();

    const handler = () => debouncedRefresh.current();

    Office.context.document.addHandlerAsync(
      Office.EventType.DocumentSelectionChanged,
      handler,
      (asyncResult) => {
        if (asyncResult.status === Office.AsyncResultStatus.Failed) {
          console.error("Suade: failed to register selection-change handler", asyncResult.error);
          setError(asyncResult.error.message);
        }
      }
    );

    return () => {
      Office.context.document.removeHandlerAsync(
        Office.EventType.DocumentSelectionChanged,
        { handler },
        (asyncResult) => {
          if (asyncResult.status === Office.AsyncResultStatus.Failed) {
            console.error("Suade: failed to unregister selection-change handler", asyncResult.error);
          }
        }
      );
    };
  }, []);

  return { context, error };
}
