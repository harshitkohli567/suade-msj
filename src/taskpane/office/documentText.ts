/* global Word */

import { DocumentSection } from "@/types";
import { readAllParagraphSignals } from "./paragraphSignals";

/**
 * Reads the full plain text of the document body -- used for matter
 * matching (FR-8.1), which needs to search the whole document for a
 * matter ID or party name, not just the current section.
 */
export async function readFullDocumentText(): Promise<string> {
  return Word.run(async (context) => {
    const body = context.document.body;
    body.load("text");
    await context.sync();
    return body.text ?? "";
  });
}

/**
 * Reads the full text of a single detected section (all paragraphs from
 * its start to end index), for feeding to the Skill Runner (Step 7) --
 * a Skill needs the whole section's drafted-so-far content, not just the
 * one paragraph the cursor happens to sit in. Reuses the same paragraph
 * signals section detection already computes, rather than a separate
 * Word.run call.
 */
export async function readSectionText(section: DocumentSection): Promise<string> {
  const signals = await readAllParagraphSignals();
  const endIndex = section.endParagraphIndex ?? signals.length - 1;
  return signals
    .slice(section.startParagraphIndex, endIndex + 1)
    .map((s) => s.text)
    .join("\n");
}
