import { MatterRecord } from "@/types";

/**
 * Matter matching (FR-8.1, FR-8.4). Designed against the real CSV, which
 * surfaced a genuine problem the PRD didn't anticipate in the abstract:
 * the same company name can appear as a party in several unrelated
 * matters (e.g. "Helios E-Mobility GmbH" appears in 9 rows of the
 * supplied CSV -- 8 unrelated matters plus the actual pilot matter).
 * Matching on a single party name alone is NOT enough to safely
 * auto-resolve -- it would be a coin flip which matter is "the" match.
 *
 * Confidence tiers, in priority order:
 *   high   -- the matter_id itself appears verbatim in the document
 *             (e.g. "DIS-SV-2024-0417"). Unambiguous; safe to auto-resolve.
 *   medium -- BOTH the client's name and the counterparty's name appear
 *             in the document, but no matter_id match. Still meaningfully
 *             narrower than a single-name match, but not proof positive
 *             (a firm could plausibly face the same two parties in more
 *             than one matter over time) -- treat as a strong candidate,
 *             not an auto-resolve.
 *   low    -- only ONE party name matched. Per FR-8.4, this must never
 *             auto-resolve -- surfaced as an ambiguous candidate for the
 *             lawyer to confirm or reject, alongside any other low-
 *             confidence candidates sharing that same party name.
 */

export type MatchConfidence = "high" | "medium" | "low";

export interface MatterMatchResult {
  matter: MatterRecord;
  confidence: MatchConfidence;
  reason: string;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Strips a trailing "(Respondent)" / "(Claimant)" annotation, e.g. from the counterparty field. */
function stripPartySuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

const CONFIDENCE_ORDER: Record<MatchConfidence, number> = { high: 0, medium: 1, low: 2 };

/**
 * Which match, if any, is safe to auto-resolve into "the" matter:
 *   - a high (matter-ID) match always wins;
 *   - a medium (both party names) match auto-resolves only when it's the
 *     ONLY medium candidate -- if two matters share the same party pair,
 *     neither is safe to pick automatically;
 *   - low (single name) matches never auto-resolve, per FR-8.4.
 */
export function resolveAutoMatch(results: MatterMatchResult[]): MatterMatchResult | null {
  const high = results.find((r) => r.confidence === "high");
  if (high) return high;

  const mediums = results.filter((r) => r.confidence === "medium");
  if (mediums.length === 1) return mediums[0];

  return null;
}

export function findMatterMatches(documentText: string, matters: MatterRecord[]): MatterMatchResult[] {
  const normalizedDoc = normalize(documentText);
  const results: MatterMatchResult[] = [];

  for (const matter of matters) {
    const matterIdMatch = matter.matterId.length > 0 && documentText.includes(matter.matterId);

    const clientName = matter.client;
    const counterpartyName = stripPartySuffix(matter.counterparty);
    const clientMatch = normalizedDoc.includes(normalize(clientName));
    const counterpartyMatch = normalizedDoc.includes(normalize(counterpartyName));

    if (matterIdMatch) {
      results.push({
        matter,
        confidence: "high",
        reason: `Matter ID "${matter.matterId}" found verbatim in the document.`,
      });
    } else if (clientMatch && counterpartyMatch) {
      results.push({
        matter,
        confidence: "medium",
        reason: `Both party names ("${clientName}" and "${counterpartyName}") found in the document; no matter ID match.`,
      });
    } else if (clientMatch || counterpartyMatch) {
      const matchedName = clientMatch ? clientName : counterpartyName;
      results.push({
        matter,
        confidence: "low",
        reason: `Only "${matchedName}" matched -- this name appears in more than one matter in the repository, so this candidate is ambiguous on its own.`,
      });
    }
  }

  results.sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]);
  return results;
}
