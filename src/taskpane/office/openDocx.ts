/* global Word */

/**
 * Opens a base64-encoded .docx as a NEW Word document in its own window,
 * next to the document the lawyer is drafting in. Used for a Skill run's
 * working-notes channel: nothing is saved anywhere unless the lawyer
 * chooses to save the opened document.
 *
 * Uses Application.createDocument (WordApi 1.3; the manifest requires
 * 1.4). Same caveat as the other Office.js code here: written against
 * the documented API without live Word in this environment -- if the
 * open fails, report the exact error text.
 */
export async function openDocxInNewWindow(base64Docx: string): Promise<void> {
  return Word.run(async (context) => {
    const newDocument = context.application.createDocument(base64Docx);
    await context.sync();
    newDocument.open();
    await context.sync();
  });
}
