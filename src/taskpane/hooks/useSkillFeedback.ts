import { useState } from "react";
import { SkillFeedbackVote } from "@/types";
import { BACKEND_URL } from "../config";

interface SubmitVoteArgs {
  vote: SkillFeedbackVote;
  skillId: string;
  skillName: string;
  matterId: string | null;
  sectionId: string | null;
  documentIds: string[];
}

export function useSkillFeedback() {
  const [vote, setVote] = useState<SkillFeedbackVote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitVote = async (args: SubmitVoteArgs) => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/skill-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error || `Feedback failed (HTTP ${response.status}).`
        );
      }

      setVote(args.vote);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error submitting feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setVote(null);
    setError(null);
  };

  return { vote, submitting, error, submitVote, reset };
}
