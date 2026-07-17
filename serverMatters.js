/**
 * Server-side matter repository access for the intake flow.
 *
 * The CSV (matters-source/matters.csv) stays the read-only firm
 * repository; matters created via intake are appended to a supplementary
 * JSON store (matters-extra.json) that GET /api/matters-extra exposes so
 * the task pane can merge them into detection. The CSV parser is a port
 * of src/data/matters/csvParser.ts (RFC4180 quoting -- institution_seat
 * and responsible_lawyer_team contain commas).
 */

const fs = require("fs");
const path = require("path");

const MATTERS_CSV_PATH = path.join(__dirname, "matters-source", "matters.csv");
const EXTRA_MATTERS_PATH = path.join(__dirname, "matters-extra.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\r") {
      i++;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }

    field += char;
    i++;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function rowToMatterRecord(row) {
  return {
    matterId: row[0].trim(),
    client: row[1].trim(),
    representedSide: row[2].trim(),
    counterparty: row[3].trim(),
    matterType: row[4].trim(),
    governingLaw: row[5].trim(),
    institutionSeat: row[6].trim(),
    responsibleLawyerTeam: row[7].trim(),
  };
}

function loadRepositoryMatters() {
  const text = fs.readFileSync(MATTERS_CSV_PATH, "utf8");
  const [, ...dataRows] = parseCsv(text);
  return dataRows.filter((r) => r.length >= 8 && r[0].trim().length > 0).map(rowToMatterRecord);
}

function readExtraMatters() {
  if (!fs.existsSync(EXTRA_MATTERS_PATH)) return [];
  return JSON.parse(fs.readFileSync(EXTRA_MATTERS_PATH, "utf8")).matters;
}

function appendExtraMatter(matter) {
  const matters = readExtraMatters();
  matters.push(matter);
  fs.writeFileSync(EXTRA_MATTERS_PATH, JSON.stringify({ matters }, null, 2));
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stripPartySuffix(name) {
  return String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Both extracted party names match one existing matter (in either
 * client/counterparty orientation) -> that matter; ambiguous or partial
 * matches -> null, and the caller creates a new matter instead.
 */
function findRepoMatchByParties(extractedClient, extractedCounterparty, allMatters) {
  const matches = allMatters.filter((m) => {
    const client = m.client;
    const counterparty = stripPartySuffix(m.counterparty);
    const straight = namesMatch(client, extractedClient) && namesMatch(counterparty, extractedCounterparty);
    const flipped = namesMatch(client, extractedCounterparty) && namesMatch(counterparty, extractedClient);
    return straight || flipped;
  });
  return matches.length === 1 ? matches[0] : null;
}

function nextIntakeMatterId() {
  const year = new Date().getFullYear();
  const existing = readExtraMatters().filter((m) => m.matterId.startsWith(`INTAKE-${year}-`));
  return `INTAKE-${year}-${String(existing.length + 1).padStart(4, "0")}`;
}

module.exports = {
  loadRepositoryMatters,
  readExtraMatters,
  appendExtraMatter,
  findRepoMatchByParties,
  nextIntakeMatterId,
};
