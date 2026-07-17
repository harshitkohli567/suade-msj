/**
 * Renders a Skill run's working-notes channel (markdown-ish text:
 * headings, bullets, numbered lists, tables, bold/italic/code) into a
 * formatted .docx, returned as base64 for the task pane to open via
 * Office.js Application.createDocument. Pure JS (docx package) -- no
 * native deps, runs on Render as-is.
 *
 * Covers the structures Skills actually emit in their Output Packages;
 * unknown markdown falls through as plain paragraphs, so nothing is
 * dropped. Images are out of scope.
 */

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalAlign,
  ExternalHyperlink,
} = require("docx");

const NUMBERING_REF = "working-notes-numbered";

const MD_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/**
 * `[text](url)` -> real Word hyperlinks; `**bold**`, `*italic*`, and
 * `code` spans -> styled TextRuns. runOptions (size, bold) apply to every
 * run so table cells can reuse this at their smaller font.
 */
function parseInlineRuns(text, runOptions = {}) {
  const runs = [];

  const pushPlainSegment = (segment) => {
    const tokenRe = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let last = 0;
    let match;
    while ((match = tokenRe.exec(segment))) {
      if (match.index > last) {
        runs.push(new TextRun({ ...runOptions, text: segment.slice(last, match.index) }));
      }
      const token = match[0];
      if (token.startsWith("**")) {
        runs.push(new TextRun({ ...runOptions, text: token.slice(2, -2), bold: true }));
      } else if (token.startsWith("`")) {
        runs.push(new TextRun({ ...runOptions, text: token.slice(1, -1), font: "Consolas" }));
      } else {
        runs.push(new TextRun({ ...runOptions, text: token.slice(1, -1), italics: true }));
      }
      last = match.index + token.length;
    }
    if (last < segment.length) {
      runs.push(new TextRun({ ...runOptions, text: segment.slice(last) }));
    }
  };

  let last = 0;
  let match;
  const linkRe = new RegExp(MD_LINK_RE.source, "g");
  while ((match = linkRe.exec(text))) {
    if (match.index > last) {
      pushPlainSegment(text.slice(last, match.index));
    }
    runs.push(
      new ExternalHyperlink({
        link: match[2],
        children: [
          new TextRun({
            ...runOptions,
            text: match[1].replace(/\*\*/g, "").replace(/`/g, ""),
            style: "Hyperlink",
          }),
        ],
      })
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    pushPlainSegment(text.slice(last));
  }

  return runs.length > 0 ? runs : [new TextRun({ ...runOptions, text: "" })];
}

const HEADING_LEVELS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];

const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const SEPARATOR_CELL_RE = /^:?-{3,}:?$/;

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * Markdown pipe table -> Word table. A |---|---| separator as the second
 * row marks the first row as a shaded, bold header. Cells use a slightly
 * smaller font so the wide matrices Skills emit (10+ columns of Y/N)
 * stay on the page.
 */
function buildTable(tableLines) {
  const rawRows = tableLines.map(splitTableRow);

  let headerCells = null;
  let bodyRows = rawRows;
  if (rawRows.length >= 2 && rawRows[1].length > 0 && rawRows[1].every((c) => SEPARATOR_CELL_RE.test(c))) {
    headerCells = rawRows[0];
    bodyRows = rawRows.slice(2);
  }

  const columnCount = Math.max(...rawRows.map((r) => r.length));
  const pad = (cells) => [...cells, ...Array(Math.max(0, columnCount - cells.length)).fill("")];

  const makeCell = (text, isHeader) =>
    new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      shading: isHeader ? { fill: "EEF1F5" } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [
        new Paragraph({
          // 9pt keeps wide matrices readable; citation links inside cells stay live.
          children: parseInlineRuns(text, { size: 18, bold: isHeader }),
        }),
      ],
    });

  const rows = [];
  if (headerCells) {
    rows.push(new TableRow({ tableHeader: true, children: pad(headerCells).map((c) => makeCell(c, true)) }));
  }
  for (const cells of bodyRows) {
    rows.push(new TableRow({ children: pad(cells).map((c) => makeCell(c, false)) }));
  }

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function markdownToParagraphs(markdown) {
  const paragraphs = [];
  let buffer = [];
  // Each contiguous numbered list gets its own numbering instance so
  // numbering restarts at 1 instead of continuing across lists.
  let listInstance = 0;
  let inNumberedList = false;

  let tableLines = [];

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    paragraphs.push(new Paragraph({ children: parseInlineRuns(buffer.join(" ")), spacing: { after: 120 } }));
    buffer = [];
  };

  const flushTable = () => {
    if (tableLines.length === 0) return;
    paragraphs.push(buildTable(tableLines));
    paragraphs.push(new Paragraph({ children: [], spacing: { after: 60 } })); // breathing room after the table
    tableLines = [];
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd();

    if (TABLE_ROW_RE.test(line)) {
      flushBuffer();
      tableLines.push(line);
      continue;
    }
    flushTable();

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (!numberedMatch && line.trim() !== "") {
      inNumberedList = false;
    }

    if (headingMatch) {
      flushBuffer();
      const level = Math.min(headingMatch[1].length, HEADING_LEVELS.length) - 1;
      paragraphs.push(
        new Paragraph({
          heading: HEADING_LEVELS[level],
          children: parseInlineRuns(headingMatch[2].trim()),
          spacing: { before: 240, after: 120 },
        })
      );
    } else if (bulletMatch) {
      flushBuffer();
      paragraphs.push(
        new Paragraph({ children: parseInlineRuns(bulletMatch[1]), bullet: { level: 0 }, spacing: { after: 60 } })
      );
    } else if (numberedMatch) {
      flushBuffer();
      if (!inNumberedList) {
        listInstance++;
        inNumberedList = true;
      }
      paragraphs.push(
        new Paragraph({
          children: parseInlineRuns(numberedMatch[1]),
          numbering: { reference: NUMBERING_REF, level: 0, instance: listInstance },
          spacing: { after: 60 },
        })
      );
    } else if (/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      flushBuffer(); // horizontal rule -- treat as a paragraph break
    } else if (line.trim() === "") {
      flushBuffer();
    } else {
      buffer.push(line.trim());
    }
  }
  flushTable();
  flushBuffer();

  return paragraphs;
}

async function buildWorkingNotesDocx({ skillDisplayName, matterId, notesMarkdown }) {
  const generatedAt = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun(`${skillDisplayName} — Working Notes`)],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Matter: ${matterId || "(no matter resolved)"}  ·  Generated by Suade, ${generatedAt}`,
          italics: true,
          color: "5B6470",
        }),
      ],
      spacing: { after: 240 },
    }),
    ...markdownToParagraphs(notesMarkdown),
  ];

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: NUMBERING_REF,
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  });

  return Packer.toBase64String(doc);
}

module.exports = { buildWorkingNotesDocx };
