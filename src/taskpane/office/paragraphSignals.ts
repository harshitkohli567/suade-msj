import { ParagraphSignal } from "./sectionDetection";

/* global Word */

/**
 * Reads text/bold/fontSize/isListItem for every paragraph in the document
 * body (FR-1.2).
 *
 * IMPORTANT gotcha this works around: `Paragraph.font` reflects the
 * formatting of the paragraph's *entire* underlying range, including the
 * invisible trailing paragraph-mark character. Because that mark is
 * essentially never explicitly bolded by document authors — even when
 * 100% of the visible text is — Word reports the paragraph as having
 * "mixed" bold formatting (font.bold comes back null) for almost any
 * heading. Reading from `paragraph.getRange(Word.RangeLocation.content)`
 * instead excludes the paragraph mark and reflects only the visible text.
 */
export async function readAllParagraphSignals(): Promise<ParagraphSignal[]> {
  return Word.run(async (context) => {
    const allParagraphs = context.document.body.paragraphs;
    allParagraphs.load("items");
    await context.sync();

    const contentRanges = allParagraphs.items.map((paragraph) =>
      paragraph.getRange(Word.RangeLocation.content)
    );

    allParagraphs.items.forEach((paragraph) => paragraph.load("text,isListItem"));
    contentRanges.forEach((range) => range.font.load("bold,size"));

    await context.sync();

    return allParagraphs.items.map((paragraph, i) => ({
      index: i,
      text: paragraph.text ?? "",
      bold: contentRanges[i].font.bold === true,
      fontSize: typeof contentRanges[i].font.size === "number" ? contentRanges[i].font.size : null,
      isListItem: paragraph.isListItem === true,
    }));
  });
}
