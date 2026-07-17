/* global Word */

import { MSJ_SECTION_TITLE_PREFIX } from "./insertContent";

/**
 * Reads the CURRENT text of every previously inserted motion section from
 * the Word document itself -- however much the lawyer has edited it since
 * insertion. Inserted sections are wrapped in hidden content controls
 * whose title carries the section type; the tracked-changes-accepted view
 * is preferred (raw text fallback in a separate Word.run, since a failed
 * sync leaves its request context unusable).
 *
 * When the same section appears in multiple controls (e.g. re-inserted),
 * the LAST non-empty one in document order wins -- a motion has each
 * section once, and later document position reflects the operative copy.
 */
export async function readLiveSectionTexts(): Promise<Record<string, string>> {
  try {
    return await readVia(true);
  } catch (err) {
    console.warn("Live-section read: reviewed-text path failed, using raw text:", err);
    try {
      return await readVia(false);
    } catch (fallbackErr) {
      console.warn("Live-section read failed entirely -- run proceeds on stored drafts:", fallbackErr);
      return {};
    }
  }
}

async function readVia(useReviewedText: boolean): Promise<Record<string, string>> {
  return Word.run(async (context) => {
    const controls = context.document.contentControls;
    controls.load(useReviewedText ? "items/title" : "items/title,items/text");
    await context.sync();

    const targets = controls.items.filter((c) => c.title && c.title.startsWith(MSJ_SECTION_TITLE_PREFIX));
    if (targets.length === 0) return {};

    let texts: { sectionType: string; text: string }[];
    if (useReviewedText) {
      const queued = targets.map((c) => ({
        sectionType: c.title.slice(MSJ_SECTION_TITLE_PREFIX.length),
        reviewed: c.getRange(Word.RangeLocation.whole).getReviewedText(Word.ChangeTrackingVersion.current),
      }));
      await context.sync();
      texts = queued.map((q) => ({ sectionType: q.sectionType, text: q.reviewed.value }));
    } else {
      texts = targets.map((c) => ({
        sectionType: c.title.slice(MSJ_SECTION_TITLE_PREFIX.length),
        text: c.text,
      }));
    }

    const bySection: Record<string, string> = {};
    for (const { sectionType, text } of texts) {
      if (text && text.trim()) {
        bySection[sectionType] = text.trim(); // later occurrences overwrite -- last in document order wins
      }
    }
    return bySection;
  });
}
