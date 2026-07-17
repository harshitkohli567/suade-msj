import { DocumentContext } from "@/types";
import { classifySections, findActiveSection } from "./sectionDetection";
import { readAllParagraphSignals } from "./paragraphSignals";

/* global Word */

export async function readDocumentContext(): Promise<DocumentContext> {
  const cursorInfo = await Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.load("text");

    const selectedParagraph = selection.paragraphs.getFirstOrNullObject();
    selectedParagraph.load("text");

    const allParagraphs = context.document.body.paragraphs;
    allParagraphs.load("items");

    await context.sync();

    if (selectedParagraph.isNullObject) {
      return { paragraphIndex: -1, paragraphText: "", selectedText: selection.text ?? "" };
    }

    const targetRange = selectedParagraph.getRange();
    const comparisonResults = allParagraphs.items.map((paragraph) =>
      paragraph.getRange().compareLocationWith(targetRange)
    );

    await context.sync();

    let paragraphIndex = -1;
    for (let i = 0; i < comparisonResults.length; i++) {
      if (comparisonResults[i].value === Word.LocationRelation.equal) {
        paragraphIndex = i;
        break;
      }
    }

    return {
      paragraphIndex,
      paragraphText: selectedParagraph.text ?? "",
      selectedText: selection.text ?? "",
    };
  });

  if (cursorInfo.paragraphIndex < 0) {
    return { ...cursorInfo, activeSection: null };
  }

  const signals = await readAllParagraphSignals();
  const sections = classifySections(signals);
  const activeSection = findActiveSection(sections, cursorInfo.paragraphIndex);

  return { ...cursorInfo, activeSection };
}
