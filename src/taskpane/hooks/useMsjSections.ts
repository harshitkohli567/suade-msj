import { useCallback, useEffect, useState } from "react";
import { BACKEND_URL } from "../config";
import { MsjSectionType } from "@/data/skills/registry";

/**
 * Per-matter MSJ section state (PRD §3): drives the six-step progress
 * rail, the upstream-undrafted warning, and stale-downstream flags.
 * Refreshed after every section run and insert.
 */

export type MsjSectionStatus = "not_started" | "drafted" | "inserted";

export interface MsjSectionInfo {
  sectionType: MsjSectionType;
  displayName: string;
  order: number;
  status: MsjSectionStatus;
  draftVersion: number;
  updatedAt: string | null;
  insertedAt: string | null;
  staleAgainst: MsjSectionType[];
}

export interface StyleProfileInfo {
  filename: string;
  uploadedAt: string;
  profile: string;
}

export function useMsjSections(matterId: string | null) {
  const [sections, setSections] = useState<MsjSectionInfo[]>([]);
  const [styleProfile, setStyleProfile] = useState<StyleProfileInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!matterId) {
      setSections([]);
      setStyleProfile(null);
      return;
    }
    try {
      const response = await fetch(`${BACKEND_URL}/api/msj-sections?matterId=${encodeURIComponent(matterId)}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
      }
      const data = (await response.json()) as { sections: MsjSectionInfo[]; styleProfile: StyleProfileInfo | null };
      setSections(data.sections);
      setStyleProfile(data.styleProfile);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error loading section state.");
    }
  }, [matterId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sections, styleProfile, error, refresh };
}
