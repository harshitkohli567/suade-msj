import { BACKEND_URL, LAWYER_ID } from "./config";

/**
 * Logs (model draft -> what the lawyer actually inserted) at Insert time.
 * Fire-and-forget: this is corpus collection for future style learning,
 * so a failure here must never surface to the lawyer or interfere with
 * the insert -- it just logs to the console and moves on.
 */
export interface EditPairArgs {
  /** Client-generated; doubles as the content-control tag suffix in the document. */
  editPairId: string;
  skillId: string | null;
  skillName: string | null;
  matterId: string | null;
  sectionId: string | null;
  insertTarget: "section_end" | "cursor";
  modelDraft: string;
  finalText: string;
}

export function newEditPairId(): string {
  return `ep-${crypto.randomUUID()}`;
}

export function logEditPair(args: EditPairArgs): void {
  void fetch(`${BACKEND_URL}/api/edit-pairs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lawyerId: LAWYER_ID, ...args }),
  })
    .then((response) => {
      if (!response.ok) {
        console.warn(`Edit-pair logging failed (HTTP ${response.status}) -- insert unaffected.`);
      }
    })
    .catch((err) => {
      console.warn("Edit-pair logging failed -- insert unaffected:", err);
    });
}

/** Post-insert snapshot: the draft's current text in the document, after Word edits. */
export function logEditPairUpdate(editPairId: string, finalText: string): void {
  void fetch(`${BACKEND_URL}/api/edit-pairs/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ editPairId, finalText }),
  })
    .then((response) => {
      if (!response.ok) {
        console.warn(`Edit-pair update failed (HTTP ${response.status}).`);
      }
    })
    .catch((err) => {
      console.warn("Edit-pair update failed:", err);
    });
}
