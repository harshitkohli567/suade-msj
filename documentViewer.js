/**
 * HTML for GET /api/documents/:token/view -- the citation-highlight
 * viewer. The supporting quote travels in the URL FRAGMENT (#q=...), so
 * quoted client text never reaches server logs; all quote matching runs
 * client-side.
 *
 * Two modes:
 *  - PDF: rendered in-browser with PDF.js (served from /vendor/pdfjs,
 *    bundled from node_modules -- no CDN). Pages get a transparent text
 *    layer; spans intersecting the quote are highlighted and scrolled to.
 *  - Text (DOCX/MSG/plain-text extractions): the stored extraction is
 *    rendered with the matched passage <mark>ed, plus a download link to
 *    the original file.
 *
 * Matching degrades in steps: exact (normalized whitespace/quotes/case)
 * -> first 8 words -> visible "not found" banner. Never a silent miss.
 */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Shared client-side quote matching, inlined into both templates.
// normalize() maps text and quote into the same space (lowercase,
// straightened quotes, collapsed whitespace) while buildNormalizedMap
// tracks original offsets so highlights land on the raw text.
const MATCH_JS = `
function normalizeChar(ch) {
  if (ch === "\\u2018" || ch === "\\u2019") return "'";
  if (ch === "\\u201C" || ch === "\\u201D") return '"';
  return ch.toLowerCase();
}
function buildNormalizedMap(raw) {
  let norm = "";
  const map = [];
  let pendingSpace = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (/\\s/.test(ch)) { pendingSpace = norm.length > 0; continue; }
    if (pendingSpace) { norm += " "; map.push(i); pendingSpace = false; }
    norm += normalizeChar(ch);
    map.push(i);
  }
  return { norm, map };
}
function normalizeQuote(q) {
  return q.split("").map(function (ch) { return /\\s/.test(ch) ? " " : normalizeChar(ch); })
    .join("").replace(/ +/g, " ").trim();
}
// Returns { start, end } in RAW offsets, or null.
function findQuoteRange(rawText, quote) {
  const { norm, map } = buildNormalizedMap(rawText);
  const attempts = [];
  const nq = normalizeQuote(quote);
  if (nq) attempts.push(nq);
  const words = nq.split(" ").filter(Boolean);
  if (words.length > 8) attempts.push(words.slice(0, 8).join(" "));
  for (const attempt of attempts) {
    const idx = norm.indexOf(attempt);
    if (idx !== -1) {
      return { start: map[idx], end: map[idx + attempt.length - 1] + 1 };
    }
  }
  return null;
}
function readQuoteFromFragment() {
  const hash = window.location.hash || "";
  const m = hash.match(/[#&]q=([^&]*)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
}
function showBanner(text, tone) {
  const el = document.getElementById("banner");
  el.textContent = text;
  el.className = "banner " + (tone || "warn");
  el.style.display = "block";
}
`;

const SHARED_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", -apple-system, sans-serif; background: #F0F2F5; color: #1a1a1a; }
  .topbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px;
            background: #1F3A5F; color: #fff; padding: 10px 16px; font-size: 13px; }
  .topbar .filename { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .topbar a { color: #C5D5E8; text-decoration: none; margin-left: auto; flex-shrink: 0; border: 1px solid #C5D5E8;
              border-radius: 4px; padding: 3px 10px; font-size: 12px; }
  .banner { display: none; position: sticky; top: 42px; z-index: 9; padding: 8px 16px; font-size: 12.5px; }
  .banner.warn { background: #FFF8E6; border-bottom: 1px solid #E0C878; color: #7A5C00; }
  .banner.ok { background: #EAF1E8; border-bottom: 1px solid #B9D3B4; color: #2C5530; }
  mark, .hl { background: #FFE58A !important; }
`;

function pdfViewerHtml({ token, filename }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(filename)} — Suade</title>
<style>
${SHARED_CSS}
  #pages { padding: 16px 0 40px 0; }
  .page-wrap { position: relative; margin: 0 auto 16px auto; box-shadow: 0 1px 4px rgba(0,0,0,0.25); background: #fff; }
  .page-wrap canvas { display: block; }
  .textLayer { position: absolute; inset: 0; overflow: hidden; line-height: 1; }
  .textLayer span { position: absolute; transform-origin: 0 0; white-space: pre; color: transparent; cursor: text; }
  .textLayer span.hl { background: rgba(255, 213, 79, 0.5); }
  #status { text-align: center; color: #5B6470; font-size: 13px; padding: 30px; }
</style>
</head>
<body>
<div class="topbar"><span class="filename">${escapeHtml(filename)}</span><a href="/api/documents/${token}" download>Download original</a></div>
<div id="banner"></div>
<div id="status">Loading document…</div>
<div id="pages"></div>
<script type="module">
${MATCH_JS}
import * as pdfjsLib from "/vendor/pdfjs/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";

const quote = readQuoteFromFragment();
let firstHighlightEl = null;

async function renderPage(pdf, pageNo, container) {
  const page = await pdf.getPage(pageNo);
  const viewport = page.getViewport({ scale: 1.3 });
  const wrap = document.createElement("div");
  wrap.className = "page-wrap";
  wrap.style.width = viewport.width + "px";
  wrap.style.height = viewport.height + "px";
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  wrap.appendChild(canvas);
  const textLayerDiv = document.createElement("div");
  textLayerDiv.className = "textLayer";
  wrap.appendChild(textLayerDiv);
  container.appendChild(wrap);

  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  const textLayer = new pdfjsLib.TextLayer({
    textContentSource: page.streamTextContent(),
    container: textLayerDiv,
    viewport,
  });
  await textLayer.render();

  if (!quote || firstHighlightEl) return;

  // Rebuild the page text FROM the rendered spans so offsets map 1:1 to
  // DOM elements, then mark every span intersecting the matched range.
  const spans = Array.from(textLayerDiv.querySelectorAll("span"));
  let pageText = "";
  const bounds = [];
  for (const span of spans) {
    const start = pageText.length;
    pageText += span.textContent + " ";
    bounds.push({ span, start, end: start + span.textContent.length });
  }
  const range = findQuoteRange(pageText, quote);
  if (!range) return;
  for (const b of bounds) {
    if (b.end > range.start && b.start < range.end) {
      b.span.classList.add("hl");
      if (!firstHighlightEl) firstHighlightEl = b.span;
    }
  }
}

(async () => {
  try {
    const pdf = await pdfjsLib.getDocument({ url: new URL("/api/documents/${token}", window.location.origin).href }).promise;
    document.getElementById("status").remove();
    const container = document.getElementById("pages");
    for (let p = 1; p <= pdf.numPages; p++) {
      await renderPage(pdf, p, container);
    }
    if (quote) {
      if (firstHighlightEl) {
        showBanner("Cited passage highlighted below.", "ok");
        firstHighlightEl.scrollIntoView({ block: "center" });
      } else {
        showBanner("Quoted passage not found in this document (it may be scanned/image-only, or the wording may differ) -- showing the document from the top.", "warn");
      }
    }
  } catch (err) {
    document.getElementById("status").textContent = "Could not render this PDF: " + err.message;
  }
})();
</script>
</body>
</html>`;
}

function textViewerHtml({ token, filename, text }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(filename)} — Suade</title>
<style>
${SHARED_CSS}
  #doc { max-width: 820px; margin: 24px auto 60px auto; background: #fff; padding: 36px 44px;
         box-shadow: 0 1px 4px rgba(0,0,0,0.25); font-size: 14px; line-height: 1.7; white-space: pre-wrap;
         word-wrap: break-word; }
  .note { max-width: 820px; margin: 12px auto 0 auto; color: #5B6470; font-size: 11.5px; }
</style>
</head>
<body>
<div class="topbar"><span class="filename">${escapeHtml(filename)}</span><a href="/api/documents/${token}" download>Download original</a></div>
<div id="banner"></div>
<p class="note">Text rendering for citation review -- formatting is simplified. Use "Download original" for the real file.</p>
<div id="doc"></div>
<script>
${MATCH_JS}
const rawText = ${JSON.stringify("__TEXT__")};
const quote = readQuoteFromFragment();
const docEl = document.getElementById("doc");

function renderWithHighlight() {
  if (!quote) { docEl.textContent = rawText; return; }
  const range = findQuoteRange(rawText, quote);
  if (!range) {
    docEl.textContent = rawText;
    showBanner("Quoted passage not found in this document (the wording may differ) -- showing the document from the top.", "warn");
    return;
  }
  docEl.textContent = "";
  docEl.appendChild(document.createTextNode(rawText.slice(0, range.start)));
  const mark = document.createElement("mark");
  mark.textContent = rawText.slice(range.start, range.end);
  docEl.appendChild(mark);
  docEl.appendChild(document.createTextNode(rawText.slice(range.end)));
  showBanner("Cited passage highlighted below.", "ok");
  mark.scrollIntoView({ block: "center" });
}
renderWithHighlight();
</script>
</body>
</html>`.replace(JSON.stringify("__TEXT__"), JSON.stringify(text));
}

function noPreviewHtml({ token, filename }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(filename)} — Suade</title><style>${SHARED_CSS}
  .box { max-width: 560px; margin: 80px auto; background: #fff; padding: 30px; border-radius: 6px; text-align: center; font-size: 14px; }
</style></head>
<body>
<div class="topbar"><span class="filename">${escapeHtml(filename)}</span><a href="/api/documents/${token}" download>Download original</a></div>
<div class="box">No in-browser preview is available for this file type. Use "Download original" above.</div>
</body>
</html>`;
}

module.exports = { pdfViewerHtml, textViewerHtml, noPreviewHtml };
