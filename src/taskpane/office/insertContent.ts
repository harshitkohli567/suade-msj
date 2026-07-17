/* global Word */

import { DocumentSection } from "@/types";

/**
 * Inserts text into the document as a Word tracked change (FR-7.4),
 * appended after the last paragraph of the given section (FR-7.2,
 * "section_end" anchor -- matches every Skill's insertionRule in the
 * registry today). Splits on blank lines into separate paragraphs so
 * multi-paragraph output doesn't land as one giant paragraph with
 * embedded line breaks.
 *
 * UNTESTED against live Word -- I do not have Word running in this
 * environment. Most likely failure points if something goes wrong:
 * (a) Word.ChangeTrackingMode.trackAll casing/availability (requires
 * WordApi 1.4, which the manifest now declares), (b) paragraph.
 * insertParagraph() formatting/list-numbering inheritance behaving
 * differently than expected. If insertion fails or looks wrong, tell me
 * the exact error or exact visual result and I'll fix it against real
 * feedback rather than guessing twice.
 */
function splitIntoParagraphBlocks(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

const MD_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/;
// Any markdown construct whose literal characters must NOT reach the
// pleading: links, bold/italic asterisks, backticks, # headings, bullets.
const MD_ARTIFACT_RE = /\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|^#{1,6}\s|^\s*[-*]\s+/m;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Inline markdown -> HTML; anything Word can't show becomes clean text, never literal symbols. */
function inlineMarkdownToHtml(value: string): string {
  return escapeHtml(value)
    .replace(new RegExp(MD_LINK_RE.source, "g"), (_match, label, url) => `<a href="${url}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "$1");
}

/**
 * Draft markdown -> HTML for Word insertion. Prose paragraphs collapse
 * internal newlines; "#" headings become bold paragraphs (real Word
 * Heading styles would collide with the document's own section
 * numbering); "-" bullets become a proper list. Literally-numbered
 * clauses ("12. The Claimant...") stay literal text -- converting them
 * to a Word auto-numbered list would silently renumber a pleading.
 */
function blocksToHtml(text: string): string {
  return splitIntoParagraphBlocks(text)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

      const headingMatch = lines.length === 1 ? lines[0].match(/^#{1,6}\s+(.*)$/) : null;
      if (headingMatch) {
        return `<p><strong>${inlineMarkdownToHtml(headingMatch[1])}</strong></p>`;
      }

      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines.map((l) => `<li>${inlineMarkdownToHtml(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("");
        return `<ul>${items}</ul>`;
      }

      // Numbered clauses on separate lines stay separate paragraphs with
      // their literal numbers; ordinary prose collapses to one paragraph.
      if (lines.length > 1 && lines.every((l) => /^\d+[.)]\s+/.test(l))) {
        return lines.map((l) => `<p>${inlineMarkdownToHtml(l)}</p>`).join("");
      }

      return `<p>${inlineMarkdownToHtml(lines.join(" "))}</p>`;
    })
    .join("");
}

/** Content controls wrapping inserted drafts carry this tag prefix + the editPairId. */
export const EDIT_PAIR_TAG_PREFIX = "suade-ep-";

/**
 * Drafts containing any markdown construct go in as HTML, so formatting
 * renders as intended (hyperlinks, bold, lists) and no literal markdown
 * symbols land in the pleading. Fully plain drafts keep the original
 * insertParagraph path, which inherits surrounding formatting more
 * faithfully than HTML insertion does.
 *
 * The inserted content is wrapped in an invisible (appearance: Hidden)
 * content control tagged with the run's editPairId, so the task pane can
 * find this exact text later -- however much the document around it has
 * changed -- and capture the lawyer's post-insert edits.
 */
function insertBlocksAfterParagraph(paragraph: Word.Paragraph, text: string, editPairId: string | null): void {
  let insertedRange: Word.Range;

  if (MD_ARTIFACT_RE.test(text)) {
    insertedRange = paragraph
      .getRange(Word.RangeLocation.whole)
      .insertHtml(blocksToHtml(text), Word.InsertLocation.after);
  } else {
    let firstInserted: Word.Paragraph | null = null;
    let insertAfter = paragraph;
    for (const block of splitIntoParagraphBlocks(text)) {
      insertAfter = insertAfter.insertParagraph(block.replace(/\s*\n\s*/g, " "), Word.InsertLocation.after);
      if (!firstInserted) firstInserted = insertAfter;
    }
    if (!firstInserted) return;
    insertedRange = firstInserted
      .getRange(Word.RangeLocation.whole)
      .expandTo(insertAfter.getRange(Word.RangeLocation.whole));
  }

  if (editPairId) {
    const control = insertedRange.insertContentControl();
    control.tag = `${EDIT_PAIR_TAG_PREFIX}${editPairId}`;
    control.title = "Suade draft";
    control.appearance = Word.ContentControlAppearance.hidden;
    control.cannotDelete = false;
    control.cannotEdit = false;
  }
}

export async function insertTextAtSectionEnd(
  section: DocumentSection,
  text: string,
  editPairId: string | null = null
): Promise<void> {
  return Word.run(async (context) => {
    context.document.load("changeTrackingMode");
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("items");
    await context.sync();

    const endIndex = section.endParagraphIndex ?? paragraphs.items.length - 1;
    if (endIndex < 0 || endIndex >= paragraphs.items.length) {
      throw new Error(`Cannot insert: section end index ${endIndex} is out of range.`);
    }

    const previousMode = context.document.changeTrackingMode;
    context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
    await context.sync();

    insertBlocksAfterParagraph(paragraphs.items[endIndex], text, editPairId);

    await context.sync();

    context.document.changeTrackingMode = previousMode;
    await context.sync();
  });
}

/**
 * Cursor-anchored insertion ("cursor" anchor) -- the fallback when no
 * section is detected, e.g. a blank document during matter intake.
 * Paragraphs land after the paragraph the cursor sits in, as tracked
 * changes, using the same paragraph-splitting as section insertion.
 */
export async function insertTextAtCursor(text: string, editPairId: string | null = null): Promise<void> {
  return Word.run(async (context) => {
    context.document.load("changeTrackingMode");
    const selectionParagraphs = context.document.getSelection().paragraphs;
    selectionParagraphs.load("items");
    await context.sync();

    if (selectionParagraphs.items.length === 0) {
      throw new Error("Cannot insert: no cursor position found in the document.");
    }

    const previousMode = context.document.changeTrackingMode;
    context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
    await context.sync();

    insertBlocksAfterParagraph(selectionParagraphs.items[selectionParagraphs.items.length - 1], text, editPairId);

    await context.sync();

    context.document.changeTrackingMode = previousMode;
    await context.sync();
  });
}
