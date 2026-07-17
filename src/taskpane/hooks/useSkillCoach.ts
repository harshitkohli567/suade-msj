import { useEffect, useRef, useState } from "react";
import { BACKEND_URL, LAWYER_ID } from "../config";

/**
 * Skill Coach: after a Skill run, the lawyer's next message is classified
 * (non-blocking, in parallel with whatever the message itself triggers)
 * to see whether it contains durable guidance that should update the
 * Skill for all future matters.
 *
 * Lifecycle: classify fires silently (no "thinking" indicator, per spec);
 * once a category resolves, the indicator + Stop button shows for a grace
 * window, after which commit fires automatically. Stop aborts/discards and
 * never commits. Edits into Non-Negotiable Rules / Guardrails sections
 * come back as requiresManualReview and are surfaced without ever
 * committing.
 */

const COMMIT_GRACE_MS = 10000;

export type CoachCategory = "new_step" | "new_checklist_item" | "domain_insight" | "best_practice";

export const CATEGORY_LABELS: Record<CoachCategory, string> = {
  new_step: "adding a new step",
  new_checklist_item: "adding a checklist item",
  domain_insight: "adding a domain insight",
  best_practice: "adding a best practice",
};

interface ProposedEdit {
  targetSection: string;
  insertText: string;
  category: CoachCategory;
}

interface CoachArgs {
  skillId: string;
  skillName: string;
  matterId: string | null;
  priorOutput: string;
  lawyerMessage: string;
}

export type CoachState =
  | { phase: "idle" }
  | { phase: "countdown"; skillId: string; skillName: string; category: CoachCategory }
  | { phase: "manual-review"; skillName: string; targetSection: string | null }
  | { phase: "committed"; skillId: string; skillName: string; versionId: string; diffSummary: string }
  | { phase: "reverted"; skillName: string }
  | { phase: "error"; message: string };

interface ClassifyResponse {
  category: CoachCategory | "none";
  skillName: string;
  proposedEdit: ProposedEdit | null;
  requiresManualReview: boolean;
  targetSection?: string;
}

export function useSkillCoach() {
  const [state, setState] = useState<CoachState>({ phase: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const graceTimerRef = useRef<number | null>(null);
  const pendingCommitRef = useRef<{ args: CoachArgs; proposedEdit: ProposedEdit; skillName: string } | null>(null);

  const clearGraceTimer = () => {
    if (graceTimerRef.current !== null) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      clearGraceTimer();
    };
  }, []);

  const commit = async () => {
    const pending = pendingCommitRef.current;
    pendingCommitRef.current = null;
    if (!pending) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/skill-coach/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lawyerId: LAWYER_ID,
          skillId: pending.args.skillId,
          proposedEdit: pending.proposedEdit,
          matterId: pending.args.matterId,
          sourceMessage: pending.args.lawyerMessage,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `Commit failed (HTTP ${response.status}).`);
      }

      const data = (await response.json()) as { newVersionId: string; diffSummary: string };
      setState({
        phase: "committed",
        skillId: pending.args.skillId,
        skillName: pending.skillName,
        versionId: data.newVersionId,
        diffSummary: data.diffSummary,
      });
    } catch (err) {
      console.error("Skill Coach commit failed:", err);
      setState({ phase: "error", message: err instanceof Error ? err.message : "Unknown Skill Coach error." });
    }
  };

  const coach = async (args: CoachArgs) => {
    // A new coaching cycle supersedes any in-flight or pending one.
    controllerRef.current?.abort();
    clearGraceTimer();
    pendingCommitRef.current = null;

    const controller = new AbortController();
    controllerRef.current = controller;

    // No visible state while classifying -- the indicator only appears
    // once a category resolves (and never for "none").
    try {
      const response = await fetch(`${BACKEND_URL}/api/skill-coach/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lawyerId: LAWYER_ID,
          matterId: args.matterId,
          skillId: args.skillId,
          skillName: args.skillName,
          priorOutput: args.priorOutput,
          lawyerMessage: args.lawyerMessage,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `Classify failed (HTTP ${response.status}).`);
      }

      const data = (await response.json()) as ClassifyResponse;

      if (data.category === "none") {
        // Nothing is shown for "none" by design -- log it so a tester can
        // tell "correctly suppressed" apart from "never fired".
        console.log(`Skill Coach: follow-up classified as "none" for ${args.skillId}; no update proposed.`);
        return;
      }

      if (data.requiresManualReview) {
        setState({ phase: "manual-review", skillName: data.skillName, targetSection: data.targetSection ?? null });
        return;
      }

      if (!data.proposedEdit) return;

      pendingCommitRef.current = { args, proposedEdit: data.proposedEdit, skillName: data.skillName };
      setState({ phase: "countdown", skillId: args.skillId, skillName: data.skillName, category: data.category });
      graceTimerRef.current = window.setTimeout(() => {
        graceTimerRef.current = null;
        void commit();
      }, COMMIT_GRACE_MS);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Coaching is a background nicety -- a failure here must never
      // interrupt the lawyer's actual work, so log and stay quiet.
      console.error("Skill Coach classify failed:", err);
    }
  };

  const stop = () => {
    controllerRef.current?.abort();
    clearGraceTimer();
    pendingCommitRef.current = null;
    // Analytics wiring can replace this later -- for now just log the stop.
    console.log("Skill Coach: stopped by lawyer during the indicator window; discarding proposed Skill update.");
    setState({ phase: "idle" });
  };

  const undo = async () => {
    if (state.phase !== "committed") return;
    const { skillId, skillName, versionId } = state;

    try {
      const response = await fetch(`${BACKEND_URL}/api/skill-coach/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lawyerId: LAWYER_ID, skillId, versionId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `Undo failed (HTTP ${response.status}).`);
      }

      setState({ phase: "reverted", skillName });
    } catch (err) {
      console.error("Skill Coach undo failed:", err);
      setState({ phase: "error", message: err instanceof Error ? err.message : "Unknown Skill Coach error." });
    }
  };

  const dismiss = () => setState({ phase: "idle" });

  return { state, coach, stop, undo, dismiss };
}
