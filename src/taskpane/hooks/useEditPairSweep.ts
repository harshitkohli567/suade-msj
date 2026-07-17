import { useEffect, useRef } from "react";
import { readEditPairSnapshots } from "../office/editPairSweep";
import { logEditPairUpdate } from "../editPairLog";

/**
 * Post-insert edit capture (FR-17b). The observed real workflow is
 * "insert first, edit in Word", so the insert-time log alone mostly
 * records unedited acceptances. This hook periodically re-reads every
 * Suade content control in the document and reports a snapshot whenever
 * a draft's text changed -- no "done editing" button; the last snapshot
 * wins downstream.
 *
 * Runs only while the task pane is open (Office.js constraint). After a
 * pane reload the last-reported memory is empty, so each control is
 * re-reported once even if unchanged -- consumers dedupe by taking the
 * last update per editPairId.
 */

const SWEEP_INTERVAL_MS = 60000;

export function useEditPairSweep() {
  const lastReported = useRef<Map<string, string>>(new Map());
  const sweeping = useRef(false);

  const sweepNow = async () => {
    if (sweeping.current) return;
    sweeping.current = true;
    try {
      const snapshots = await readEditPairSnapshots();
      for (const { editPairId, text } of snapshots) {
        const current = text.trim();
        // Emptied/rejected drafts are skipped rather than logged as an
        // empty "final" -- the backend rejects empty text anyway.
        if (!current) continue;
        if (lastReported.current.get(editPairId) === current) continue;
        lastReported.current.set(editPairId, current);
        logEditPairUpdate(editPairId, current);
      }
    } catch (err) {
      // Sweeping is corpus collection -- never surface failures to the lawyer.
      console.warn("Edit-pair sweep failed:", err);
    } finally {
      sweeping.current = false;
    }
  };

  /** Seed the just-inserted text so the next sweep doesn't re-report it unchanged. */
  const primeBaseline = (editPairId: string, text: string) => {
    lastReported.current.set(editPairId, text.trim());
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      void sweepNow();
    }, SWEEP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return { sweepNow, primeBaseline };
}
