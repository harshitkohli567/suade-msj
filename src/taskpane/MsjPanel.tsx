import React, { useState } from "react";
import { BACKEND_URL } from "./config";
import { MsjSectionInfo, StyleProfileInfo } from "./hooks/useMsjSections";

/**
 * Suade.MSJ chrome: the six-step section progress rail (PRD 4.10) and
 * the precedent-document / style-profile controls (PRD 4.2). Clicking a
 * rail step selects that section's Skill in the runner below.
 */

interface MsjPanelProps {
  matterId: string;
  sections: MsjSectionInfo[];
  styleProfile: StyleProfileInfo | null;
  selectedSkillId: string;
  onSelectSkill: (skillId: string) => void;
  refresh: () => Promise<void>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.substring(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  drafted: "Drafted",
  inserted: "Inserted",
};

const MsjPanel: React.FC<MsjPanelProps> = ({
  matterId,
  sections,
  styleProfile,
  selectedSkillId,
  onSelectSkill,
  refresh,
}) => {
  const [precedentBusy, setPrecedentBusy] = useState(false);
  const [precedentError, setPrecedentError] = useState<string | null>(null);
  const [profileCollapsed, setProfileCollapsed] = useState(true);

  const recommendedNext = sections.find((s) => s.status === "not_started");

  const handlePrecedentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    e.target.value = "";
    setPrecedentBusy(true);
    setPrecedentError(null);
    try {
      const base64Content = await fileToBase64(file);
      const mimeType = file.name.toLowerCase().endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";
      const response = await fetch(`${BACKEND_URL}/api/precedent-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matterId, filename: file.name, mimeType, base64Content }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `Upload failed (HTTP ${response.status}).`);
      }
      await refresh();
    } catch (err) {
      setPrecedentError(err instanceof Error ? err.message : "Unknown error analyzing precedent document.");
    } finally {
      setPrecedentBusy(false);
    }
  };

  const handlePrecedentRemove = async () => {
    setPrecedentBusy(true);
    setPrecedentError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/api/precedent-doc?matterId=${encodeURIComponent(matterId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `Remove failed (HTTP ${response.status}).`);
      }
      await refresh();
    } catch (err) {
      setPrecedentError(err instanceof Error ? err.message : "Unknown error removing precedent document.");
    } finally {
      setPrecedentBusy(false);
    }
  };

  return (
    <div>
      <p style={styles.fieldLabel}>Motion Sections</p>
      <p style={styles.helperText}>
        The canonical order is recommended, not enforced -- each run automatically sees the latest
        drafts of the sections already completed.
      </p>

      <div style={styles.rail}>
        {sections.map((s) => {
          const skillId = `msj-${s.sectionType}`;
          const isSelected = skillId === selectedSkillId;
          return (
            <button
              key={s.sectionType}
              style={{ ...styles.railItem, ...(isSelected ? styles.railItemSelected : {}) }}
              onClick={() => onSelectSkill(skillId)}
            >
              <span style={styles.railOrder}>{s.order}</span>
              <span style={styles.railName}>
                {s.displayName}
                {recommendedNext && recommendedNext.sectionType === s.sectionType && (
                  <span style={styles.nextBadge}> next</span>
                )}
              </span>
              <span
                style={{
                  ...styles.statusChip,
                  ...(s.status === "drafted" ? styles.statusDrafted : {}),
                  ...(s.status === "inserted" ? styles.statusInserted : {}),
                }}
              >
                {s.status === "drafted" ? `Drafted v${s.draftVersion}` : STATUS_LABELS[s.status]}
              </span>
              {s.staleAgainst.length > 0 && (
                <span
                  style={styles.staleBadge}
                  title={`Drafted against a now-superseded version of: ${s.staleAgainst.join(", ")}. Re-run to refresh.`}
                >
                  stale
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p style={styles.fieldLabel}>Voice Calibration (optional)</p>
      <p style={styles.helperText}>
        Upload one precedent MSJ or brief (PDF/DOCX) that sounds like you. Suade.MSJ derives a
        style profile -- form only, never content -- and applies it to every section run for this
        matter. Replace it to re-calibrate; prior drafts are not re-styled.
      </p>

      {!styleProfile && (
        <input
          type="file"
          accept=".pdf,.docx"
          onChange={handlePrecedentUpload}
          disabled={precedentBusy}
          style={styles.fileInput}
        />
      )}
      {precedentBusy && <p style={styles.helperText}>Analyzing precedent document…</p>}

      {styleProfile && (
        <div style={styles.profileCard}>
          <div style={styles.profileHeader}>
            <span style={styles.profileTitle}>
              Style profile from <strong>{styleProfile.filename}</strong>
            </span>
            <button style={styles.smallButton} onClick={() => setProfileCollapsed((p) => !p)}>
              {profileCollapsed ? "Show" : "Hide"}
            </button>
            <button style={styles.smallButton} onClick={handlePrecedentRemove} disabled={precedentBusy}>
              Remove
            </button>
          </div>
          {!profileCollapsed && <pre style={styles.profileText}>{styleProfile.profile}</pre>}
          {!styleProfile ? null : (
            <div style={{ marginTop: "6px" }}>
              <label style={styles.replaceLabel}>
                Replace:{" "}
                <input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handlePrecedentUpload}
                  disabled={precedentBusy}
                  style={styles.fileInput}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {precedentError && (
        <div style={styles.errorBox}>
          <strong>Precedent error:</strong> {precedentError}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  fieldLabel: { fontWeight: 700, color: "#5B6470", marginTop: "12px", fontSize: "13px" },
  helperText: { fontSize: "11px", color: "#5B6470", margin: "4px 0 8px 0", lineHeight: 1.5 },
  rail: { display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" },
  railItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 8px",
    fontSize: "12px",
    background: "#fff",
    border: "1px solid #DDE3EA",
    borderRadius: "4px",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  },
  railItemSelected: { border: "1px solid #1F3A5F", background: "#EFF4FA" },
  railOrder: {
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "#1F3A5F",
    color: "#fff",
    fontSize: "10px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  railName: { flex: 1, color: "#1a1a1a", lineHeight: 1.3 },
  nextBadge: { fontSize: "10px", color: "#1F3A5F", fontWeight: 700, textTransform: "uppercase" },
  statusChip: {
    fontSize: "10px",
    padding: "2px 8px",
    borderRadius: "10px",
    background: "#F0F2F5",
    color: "#5B6470",
    flexShrink: 0,
  },
  statusDrafted: { background: "#EFF4FA", color: "#1F3A5F" },
  statusInserted: { background: "#EAF1E8", color: "#2C5530" },
  staleBadge: {
    fontSize: "10px",
    padding: "2px 8px",
    borderRadius: "10px",
    background: "#FFF8E6",
    border: "1px solid #E0C878",
    color: "#7A5C00",
    flexShrink: 0,
  },
  fileInput: { fontSize: "12px" },
  profileCard: {
    background: "#F5F7FA",
    border: "1px solid #DDE3EA",
    borderRadius: "4px",
    padding: "8px 10px",
    fontSize: "12px",
  },
  profileHeader: { display: "flex", alignItems: "center", gap: "8px" },
  profileTitle: { flex: 1, fontSize: "11.5px", color: "#1a1a1a" },
  smallButton: {
    fontSize: "11px",
    padding: "2px 8px",
    cursor: "pointer",
    border: "1px solid #DDE3EA",
    borderRadius: "3px",
    background: "#fff",
    color: "#5B6470",
    flexShrink: 0,
  },
  replaceLabel: { fontSize: "11px", color: "#5B6470" },
  profileText: {
    margin: "8px 0 0 0",
    whiteSpace: "pre-wrap",
    fontFamily: "Segoe UI, sans-serif",
    fontSize: "11px",
    lineHeight: 1.5,
    maxHeight: "220px",
    overflowY: "auto",
  },
  errorBox: {
    fontSize: "12px",
    background: "#FBEAEA",
    border: "1px solid #D98C8C",
    borderRadius: "4px",
    padding: "8px",
    marginTop: "8px",
  },
};

export default MsjPanel;
