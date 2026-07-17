/**
 * Markdown/section utilities for Skill Coach (classify -> commit -> undo).
 * Kept out of server.js so the guardrail + edit-application logic can be
 * exercised directly with node, without booting the HTTPS server.
 *
 * Heading matching is deliberately fuzzy: the skill files number their
 * headings ("## 3. Non-Negotiable Rules", "## 5. Guardrails") but Claude's
 * proposed edits name sections in plain words ("Non-Negotiable Rules"),
 * so matching is normalized-substring in either direction.
 */

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const PROTECTED_HEADING_RE = /non[\s-]*negotiable|guardrail/i;

function sanitizeLawyerId(lawyerId) {
  const cleaned = String(lawyerId || "default-lawyer")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return cleaned || "default-lawyer";
}

function normalizeHeading(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function headingsMatch(a, b) {
  const na = normalizeHeading(a);
  const nb = normalizeHeading(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Finds the section whose heading matches targetSection. Returns
 * { headingLine, endLine, depth, headingText, ancestors } or null.
 * endLine is exclusive: the line index of the next heading at the same
 * or shallower depth (or lines.length).
 */
function findSectionBounds(markdown, targetSection) {
  const lines = markdown.split("\n");
  const stack = []; // { depth, text }
  let found = null;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADING_RE);
    if (!match) continue;
    const depth = match[1].length;
    const text = match[2].trim();

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    if (found) {
      if (depth <= found.depth) {
        found.endLine = i;
        return found;
      }
      continue;
    }

    if (headingsMatch(text, targetSection)) {
      found = {
        headingLine: i,
        endLine: lines.length,
        depth,
        headingText: text,
        ancestors: stack.map((s) => s.text),
      };
    }

    stack.push({ depth, text });
  }

  return found;
}

/**
 * True when the proposed target section is (or sits under) a
 * "Non-Negotiable Rules" / "Guardrails" heading -- these must never be
 * auto-edited by Skill Coach.
 */
function isProtectedSection(markdown, targetSection) {
  if (!targetSection) return false;
  if (PROTECTED_HEADING_RE.test(targetSection)) return true;

  const bounds = findSectionBounds(markdown, targetSection);
  if (!bounds) return false;

  return (
    PROTECTED_HEADING_RE.test(bounds.headingText) ||
    bounds.ancestors.some((t) => PROTECTED_HEADING_RE.test(t))
  );
}

/**
 * Inserts insertText at the end of the target section (before the next
 * same-or-shallower heading). If the section doesn't exist, appends a new
 * "## targetSection" at the end of the file. Returns the new markdown.
 */
function applyEditToMarkdown(markdown, targetSection, insertText) {
  const trimmedInsert = String(insertText || "").replace(/\s+$/, "");
  const bounds = findSectionBounds(markdown, targetSection);
  const lines = markdown.split("\n");

  if (!bounds) {
    const base = markdown.replace(/\s+$/, "");
    return `${base}\n\n## ${targetSection}\n\n${trimmedInsert}\n`;
  }

  let insertAt = bounds.endLine;
  while (insertAt > bounds.headingLine + 1 && lines[insertAt - 1].trim() === "") {
    insertAt--;
  }

  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  return [...before, "", trimmedInsert, ...after].join("\n");
}

/** Plain-insertion diff ("+ line" per inserted line) plus a short human summary. */
function buildInsertionDiff(markdown, targetSection, insertText) {
  const bounds = findSectionBounds(markdown, targetSection);
  const sectionLabel = bounds ? bounds.headingText : targetSection;
  const insertedLines = String(insertText || "")
    .replace(/\s+$/, "")
    .split("\n");
  return {
    diff: insertedLines.map((l) => `+ ${l}`).join("\n"),
    diffSummary: `Added ${insertedLines.length} line${insertedLines.length === 1 ? "" : "s"} under "${sectionLabel}"`,
  };
}

module.exports = {
  sanitizeLawyerId,
  normalizeHeading,
  findSectionBounds,
  isProtectedSection,
  applyEditToMarkdown,
  buildInsertionDiff,
};
