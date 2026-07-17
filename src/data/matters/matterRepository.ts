import { MatterRecord, RepresentedSide } from "@/types";
import { parseCsv } from "./csvParser";
import { BACKEND_URL } from "@/taskpane/config";

/**
 * Loads the CSV-seeded dummy Matter Repository (FR-8.6, Decisions Log
 * item 3). The CSV is copied into the build output by webpack
 * (data/matters.csv) and fetched at runtime -- same pattern Step 4 used
 * for the Skill source files, for consistency.
 *
 * Matters created by the blank-document intake flow live server-side in
 * a supplementary store (matters-extra.json) and are merged in here, so
 * Detect Matter also finds them. If the backend is down, the CSV matters
 * still load -- extras are best-effort.
 */

const EXPECTED_COLUMN_COUNT = 8;

function rowToMatterRecord(row: string[]): MatterRecord {
  const [
    matterId,
    client,
    representedSideRaw,
    counterparty,
    matterType,
    governingLaw,
    institutionSeat,
    responsibleLawyerTeam,
  ] = row;

  return {
    matterId: matterId.trim(),
    client: client.trim(),
    representedSide: representedSideRaw.trim() as RepresentedSide,
    counterparty: counterparty.trim(),
    matterType: matterType.trim(),
    governingLaw: governingLaw.trim(),
    institutionSeat: institutionSeat.trim(),
    responsibleLawyerTeam: responsibleLawyerTeam.trim(),
  };
}

let cachedMatters: MatterRecord[] | null = null;

export async function loadMatterRepository(forceReload = false): Promise<MatterRecord[]> {
  if (cachedMatters && !forceReload) {
    return cachedMatters;
  }

  const response = await fetch("/data/matters.csv");
  if (!response.ok) {
    throw new Error(`Failed to load matter repository (HTTP ${response.status}).`);
  }

  const text = await response.text();
  const rows = parseCsv(text);
  const [, ...dataRows] = rows; // drop header row

  const csvMatters = dataRows
    .filter((r) => r.length >= EXPECTED_COLUMN_COUNT && r[0].trim().length > 0)
    .map(rowToMatterRecord);

  let extraMatters: MatterRecord[] = [];
  try {
    const extraResponse = await fetch(`${BACKEND_URL}/api/matters-extra`);
    if (extraResponse.ok) {
      extraMatters = ((await extraResponse.json()) as { matters: MatterRecord[] }).matters;
    }
  } catch {
    // Backend unreachable -- proceed with CSV matters only.
  }

  cachedMatters = [...csvMatters, ...extraMatters];
  return cachedMatters;
}
