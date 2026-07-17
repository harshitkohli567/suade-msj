/* global Word */

import { EDIT_PAIR_TAG_PREFIX } from "./insertContent";

/**
 * Reads back every Suade-inserted draft from the document: the hidden
 * content controls tagged at insert time. Returns each control's CURRENT
 * text -- i.e. including the lawyer's post-insert edits -- preferring the
 * tracked-changes-accepted view (getReviewedText) so pending revisions
 * read as they will once accepted. Falls back to raw text in a separate
 * Word.run if getReviewedText is unavailable, since a failed sync leaves
 * its request context unusable.
 */

export interface EditPairSnapshot {
  editPairId: string;
  text: string;
}

async function readViaReviewedText(): Promise<EditPairSnapshot[]> {
  return Word.run(async (context) => {
    const controls = context.document.contentControls;
    controls.load("items/tag");
    await context.sync();

    const targets = controls.items.filter((c) => c.tag && c.tag.startsWith(EDIT_PAIR_TAG_PREFIX));
    if (targets.length === 0) return [];

    const queued = targets.map((c) => ({
      tag: c.tag,
      reviewed: c.getRange(Word.RangeLocation.whole).getReviewedText(Word.ChangeTrackingVersion.current),
    }));
    await context.sync();

    return queued.map((q) => ({
      editPairId: q.tag.slice(EDIT_PAIR_TAG_PREFIX.length),
      text: q.reviewed.value,
    }));
  });
}

async function readViaRawText(): Promise<EditPairSnapshot[]> {
  return Word.run(async (context) => {
    const controls = context.document.contentControls;
    controls.load("items/tag,items/text");
    await context.sync();

    return controls.items
      .filter((c) => c.tag && c.tag.startsWith(EDIT_PAIR_TAG_PREFIX))
      .map((c) => ({ editPairId: c.tag.slice(EDIT_PAIR_TAG_PREFIX.length), text: c.text }));
  });
}

export async function readEditPairSnapshots(): Promise<EditPairSnapshot[]> {
  try {
    return await readViaReviewedText();
  } catch (err) {
    console.warn("Edit-pair sweep: getReviewedText path failed, using raw text:", err);
    return readViaRawText();
  }
}
