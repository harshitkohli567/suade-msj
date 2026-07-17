import React, { useState, useEffect } from "react";
import { MatterRecord, DocumentSection, DocumentRole, UploadedDocumentRecord } from "@/types";
import { SKILL_REGISTRY } from "@/data/skills/registry";
import { useSkillRunner } from "./hooks/useSkillRunner";
import { useSkillFeedback } from "./hooks/useSkillFeedback";
import { useSkillCoach, CATEGORY_LABELS } from "./hooks/useSkillCoach";
import { DOCUMENT_ROLES, UploadJob } from "./hooks/useDocumentUploads";
import { insertTextAtSectionEnd, insertTextAtCursor } from "./office/insertContent";
import { openDocxInNewWindow } from "./office/openDocx";
import { logEditPair, newEditPairId } from "./editPairLog";
import MsjPanel from "./MsjPanel";
import { useMsjSections } from "./hooks/useMsjSections";
import { sectionTypeForSkillId, MSJ_SECTION_NAMES } from "@/data/skills/registry";
import { BACKEND_URL } from "./config";
import { useEditPairSweep } from "./hooks/useEditPairSweep";
import UploadProgress from "./UploadProgress";

interface RunMeta {
  skillId: string;
  skillName: string;
  matterId: string | null;
  sectionId: string | null;
  sectionType: string | null;
  documentIds: string[];
}

function formatTraceTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}

/** The Skill run whose output is currently on screen -- what Skill Coach coaches against. */
interface ActiveSkillContext {
  skillId: string;
  skillName: string;
  matterId: string | null;
  output: string;
}

interface SkillRunnerSectionProps {
  matter: MatterRecord | null;
  activeSection: DocumentSection | null;
  uploadedDocuments: UploadedDocumentRecord[];
  uploadDocuments: (files: File[], matterId: string, documentRole: DocumentRole) => Promise<void>;
  uploading: boolean;
  uploadError: string | null;
  uploadJobs: UploadJob[];
  removeDocument: (documentId: string) => Promise<void>;
  removingDocumentIds: string[];
  removeError: string | null;
}

const SkillRunnerSection: React.FC<SkillRunnerSectionProps> = ({
  matter,
  activeSection,
  uploadedDocuments,
  uploadDocuments,
  uploading,
  uploadError,
  uploadJobs,
  removeDocument,
  removingDocumentIds,
  removeError,
}) => {
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [uploadRole, setUploadRole] = useState<DocumentRole>("exhibit");
  const [message, setMessage] = useState("");
  const { run, output, workingNotes, loading, error, trace, reset: resetRun } = useSkillRunner();
  const feedback = useSkillFeedback();
  const skillCoach = useSkillCoach();
  const editPairSweep = useEditPairSweep();
  const msj = useMsjSections(matter ? matter.matterId : null);

  const [editedOutput, setEditedOutput] = useState("");
  const [insertState, setInsertState] = useState<"idle" | "inserting" | "done" | "error">("idle");
  const [insertError, setInsertError] = useState<string | null>(null);
  const [insertTarget, setInsertTarget] = useState<string | null>(null);
  const [notesOpenState, setNotesOpenState] = useState<"idle" | "opening" | "error">("idle");
  const [notesOpenError, setNotesOpenError] = useState<string | null>(null);
  const [inlineNotesCollapsed, setInlineNotesCollapsed] = useState(true);
  const [lastRunMeta, setLastRunMeta] = useState<RunMeta | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [traceCollapsed, setTraceCollapsed] = useState(false);
  const [activeSkillContext, setActiveSkillContext] = useState<ActiveSkillContext | null>(null);

  useEffect(() => {
    if (!loading) return;
    setElapsedSeconds(0);
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (output !== null) {
      setEditedOutput(output);
      setInsertState("idle");
      setInsertError(null);
      feedback.reset();
      if (lastRunMeta && lastRunMeta.skillId !== "none") {
        setActiveSkillContext({
          skillId: lastRunMeta.skillId,
          skillName: lastRunMeta.skillName,
          matterId: lastRunMeta.matterId,
          output,
        });
      }
      // The backend saved this section's draft on completion -- reflect it.
      void msj.refresh();
    }
  }, [output]);

  const selectedSkill = SKILL_REGISTRY.find((s) => s.skillId === selectedSkillId) ?? null;
  const selectedSectionType = selectedSkill ? sectionTypeForSkillId(selectedSkill.skillId) : null;

  // Advisory only (PRD 4.3): sections canonically before the selected one
  // that have no draft yet -- the run proceeds, just without that context.
  const selectedSectionInfo = selectedSectionType
    ? msj.sections.find((sec) => sec.sectionType === selectedSectionType)
    : null;
  const undraftedUpstream = selectedSectionInfo
    ? msj.sections.filter((sec) => sec.order < selectedSectionInfo.order && sec.status === "not_started")
    : [];

  const handleRun = () => {
    // Snapshot any edits made in Word since the last sweep before the
    // next run changes what's on screen. Fire-and-forget.
    void editPairSweep.sweepNow();

    // Skill Coach: classify the follow-up against the PRIOR Skill output,
    // in parallel -- never delays or blocks the message's own run.
    const trimmedMessage = message.trim();
    if (activeSkillContext && trimmedMessage) {
      void skillCoach.coach({
        skillId: activeSkillContext.skillId,
        skillName: activeSkillContext.skillName,
        matterId: matter ? matter.matterId : activeSkillContext.matterId,
        priorOutput: activeSkillContext.output,
        lawyerMessage: trimmedMessage,
      });
    }

    setLastRunMeta({
      skillId: selectedSkill ? selectedSkill.skillId : "none",
      skillName: selectedSkill ? selectedSkill.displayName : "No Skill (message only)",
      matterId: matter ? matter.matterId : null,
      sectionId: activeSection ? activeSection.sectionId : null,
      sectionType: selectedSectionType,
      documentIds: uploadedDocuments.map((d) => d.documentId),
    });
    run({ skill: selectedSkill, matter, activeSection, uploadedDocuments, message, sectionType: selectedSectionType });
  };

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!matter || !e.target.files || e.target.files.length === 0) {
      return;
    }
    const files = Array.from(e.target.files);
    e.target.value = "";
    await uploadDocuments(files, matter.matterId, uploadRole);
  };

  const handleInsert = async () => {
    setInsertState("inserting");
    setInsertError(null);
    try {
      // The id ties three things together: the corpus entry, the hidden
      // content control wrapping the inserted text, and every later
      // post-insert snapshot of that text.
      const editPairId = newEditPairId();

      // Section end when we know where we are; cursor fallback otherwise
      // (e.g. a blank document during intake has no sections yet).
      if (activeSection) {
        await insertTextAtSectionEnd(activeSection, editedOutput, editPairId);
        setInsertTarget(`at the end of section ${activeSection.sectionId}`);
      } else {
        await insertTextAtCursor(editedOutput, editPairId);
        setInsertTarget("at the cursor position");
      }
      setInsertState("done");

      // Corpus capture: the model's draft vs. what actually went into the
      // pleading. Fire-and-forget -- never blocks or fails the insert.
      if (output !== null) {
        logEditPair({
          editPairId,
          skillId: lastRunMeta ? lastRunMeta.skillId : null,
          skillName: lastRunMeta ? lastRunMeta.skillName : null,
          matterId: lastRunMeta ? lastRunMeta.matterId : null,
          sectionId: activeSection ? activeSection.sectionId : null,
          insertTarget: activeSection ? "section_end" : "cursor",
          modelDraft: output,
          finalText: editedOutput,
        });
        editPairSweep.primeBaseline(editPairId, editedOutput);
      }

      // PRD 4.7: record that this section's draft has landed in the motion.
      if (lastRunMeta && lastRunMeta.sectionType && lastRunMeta.matterId) {
        void fetch(`${BACKEND_URL}/api/msj-sections/mark-inserted`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matterId: lastRunMeta.matterId, sectionType: lastRunMeta.sectionType }),
        })
          .then(() => msj.refresh())
          .catch((err) => console.warn("Failed to mark section inserted:", err));
      }
    } catch (err) {
      setInsertError(err instanceof Error ? err.message : "Unknown error inserting into document.");
      setInsertState("error");
    }
  };

  /** Fully clears the previous run so the pane returns to its pre-run state. */
  const handleDiscard = () => {
    setEditedOutput("");
    setInsertState("idle");
    setInsertError(null);
    setInsertTarget(null);
    setNotesOpenState("idle");
    setNotesOpenError(null);
    feedback.reset();
    resetRun();
  };

  const handleOpenNotes = async () => {
    if (!workingNotes || workingNotes.kind !== "docx") return;
    setNotesOpenState("opening");
    setNotesOpenError(null);
    try {
      await openDocxInNewWindow(workingNotes.base64);
      setNotesOpenState("idle");
    } catch (err) {
      setNotesOpenError(err instanceof Error ? err.message : "Unknown error opening working notes.");
      setNotesOpenState("error");
    }
  };

  // Message composer + run button + everything that reports on a run
  // (spinner, Skill Coach, trace, errors). Rendered in one of two places:
  // below the assistant's output once there is one (chat-like flow), or in
  // the pre-output position before the first run / while a run is clearing
  // the previous output.
  const composer = (
    <>
      <p style={styles.fieldLabel}>Message to Claude</p>
      <textarea
        style={styles.messageTextarea}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="e.g. Emphasise the passing-of-risk date and cross-reference Clause 11.2 directly."
        rows={4}
      />

      <div style={styles.runRow}>
        <button style={styles.runButton} onClick={handleRun} disabled={loading}>
          Enter
        </button>
        {loading && (
          <div style={styles.runningIndicator}>
            <span style={styles.spinner} />
            <span style={styles.runningText}>Running… {elapsedSeconds}s elapsed</span>
          </div>
        )}
      </div>

      {skillCoach.state.phase === "countdown" && (
        <div style={styles.coachIndicator}>
          <span style={styles.coachIndicatorText}>
            Coaching the {skillCoach.state.skillName} Skill — {CATEGORY_LABELS[skillCoach.state.category]} …
          </span>
          <button style={styles.coachStopButton} onClick={skillCoach.stop}>
            Stop
          </button>
        </div>
      )}

      {skillCoach.state.phase === "manual-review" && (
        <div style={styles.coachManualReview}>
          <span style={styles.coachManualReviewText}>
            {skillCoach.state.skillName} Skill — this touches a core rule and needs manual review
          </span>
          <button style={styles.coachDismissButton} onClick={skillCoach.dismiss}>
            ✕
          </button>
        </div>
      )}

      {skillCoach.state.phase === "committed" && (
        <div style={styles.coachToast}>
          <span style={styles.coachToastText}>
            Updated the {skillCoach.state.skillName} Skill — {skillCoach.state.diffSummary}
          </span>
          <button style={styles.coachUndoButton} onClick={() => void skillCoach.undo()}>
            Undo
          </button>
          <button style={styles.coachDismissButton} onClick={skillCoach.dismiss}>
            ✕
          </button>
        </div>
      )}

      {skillCoach.state.phase === "reverted" && (
        <div style={styles.coachToast}>
          <span style={styles.coachToastText}>Reverted the {skillCoach.state.skillName} Skill update.</span>
          <button style={styles.coachDismissButton} onClick={skillCoach.dismiss}>
            ✕
          </button>
        </div>
      )}

      {skillCoach.state.phase === "error" && (
        <div style={styles.coachManualReview}>
          <span style={styles.coachManualReviewText}>Skill Coach: {skillCoach.state.message}</span>
          <button style={styles.coachDismissButton} onClick={skillCoach.dismiss}>
            ✕
          </button>
        </div>
      )}

      {trace.length > 0 && (
        <div style={styles.tracePanel}>
          <div style={styles.traceHeader}>
            <p style={styles.traceTitle}>Backend activity</p>
            <button style={styles.traceCollapseButton} onClick={() => setTraceCollapsed((p) => !p)}>
              {traceCollapsed ? "Show" : "Hide"}
            </button>
          </div>
          {!traceCollapsed && (
            <ul style={styles.traceList}>
              {trace.map((entry, i) => (
                <li key={i}>
                  <span style={styles.traceTime}>{formatTraceTime(entry.at)}</span> {entry.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div style={styles.errorBox}>
          <strong>Error:</strong> {error}
        </div>
      )}
    </>
  );

  return (
    <div>
      {matter && (
        <>
          <MsjPanel
            matterId={matter.matterId}
            sections={msj.sections}
            notes={msj.notes}
            styleProfile={msj.styleProfile}
            selectedSkillId={selectedSkillId}
            onSelectSkill={setSelectedSkillId}
            refresh={msj.refresh}
          />
          {msj.error && (
            <div style={styles.errorBox}>
              <strong>Section state error:</strong> {msj.error}
            </div>
          )}
          <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #E0E0E0" }} />
        </>
      )}

      <p style={styles.fieldLabel}>Run a Section Skill</p>
      <p style={styles.helperText}>
        Pick a motion section above or from the dropdown. Each run automatically includes the
        latest drafts of the sections already completed, the case documents, and the style profile
        when one is set.
      </p>

      <select
        style={styles.select}
        value={selectedSkillId}
        onChange={(e) => setSelectedSkillId(e.target.value)}
      >
        <option value="">-- No Skill (send message only) --</option>
        {SKILL_REGISTRY.map((skill) => (
          <option key={skill.skillId} value={skill.skillId}>
            {skill.displayName}
          </option>
        ))}
      </select>

      {selectedSkill && <p style={styles.helperText}>{selectedSkill.description}</p>}

      {undraftedUpstream.length > 0 && (
        <div style={styles.coachManualReview}>
          <span style={styles.coachManualReviewText}>
            Heads up: {undraftedUpstream.map((u) => MSJ_SECTION_NAMES[u.sectionType]).join(", ")}{" "}
            {undraftedUpstream.length === 1 ? "hasn't" : "haven't"} been drafted yet -- this section
            will be drafted without that context. You can still run it.
          </span>
        </div>
      )}

      <p style={styles.fieldLabel}>Upload Documents for This Run</p>
      <p style={styles.helperText}>
        Select any number of PDF, DOCX, or Outlook .msg files relevant to this Skill (e.g. a full exhibit bundle) --
        uploads a large batch concurrently rather than one at a time. They're added to the
        matter's document set and included in every Skill run for {matter ? matter.matterId : "this matter"} from
        now on, not just this one.
      </p>

      {!matter && (
        <p style={styles.helperText}>
          <em>Detect a matter above first -- uploads are scoped to a resolved matter.</em>
        </p>
      )}

      {matter && (
        <div style={styles.uploadRow}>
          <select
            style={styles.uploadRoleSelect}
            value={uploadRole}
            onChange={(e) => setUploadRole(e.target.value as DocumentRole)}
            disabled={uploading}
          >
            {DOCUMENT_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept=".pdf,.docx,.msg"
            multiple
            onChange={handleUploadFiles}
            style={styles.fileInput}
            disabled={uploading}
          />
        </div>
      )}

      <UploadProgress jobs={uploadJobs} />

      {uploadError && (
        <div style={styles.errorBox}>
          <strong>Upload error:</strong> {uploadError}
        </div>
      )}

      {removeError && (
        <div style={styles.errorBox}>
          <strong>Remove error:</strong> {removeError}
        </div>
      )}

      {uploadedDocuments.length > 0 && (
        <ul style={styles.documentList}>
          {uploadedDocuments.map((doc) => {
            const isRemoving = removingDocumentIds.includes(doc.documentId);
            return (
              <li key={doc.documentId} style={styles.documentListItem}>
                <span style={styles.documentListText}>
                  {doc.filename} <em>({doc.documentRole})</em>
                </span>
                <button
                  style={styles.removeButton}
                  onClick={() => removeDocument(doc.documentId)}
                  disabled={isRemoving}
                >
                  {isRemoving ? "Removing…" : "Remove"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <style>{"@keyframes suade-spin { to { transform: rotate(360deg); } }"}</style>

      {output === null && composer}

      {output !== null && (
        <div style={styles.outputBox}>
          <p style={styles.outputLabel}>
            Clean draft -- review and edit before inserting. Working material (gap reports,
            checklists) is kept separate below.
          </p>
          <textarea
            style={styles.outputTextarea}
            value={editedOutput}
            onChange={(e) => setEditedOutput(e.target.value)}
            rows={14}
          />

          {workingNotes && workingNotes.kind === "docx" && (
            <div style={styles.notesRow}>
              <button style={styles.notesButton} onClick={handleOpenNotes} disabled={notesOpenState === "opening"}>
                {notesOpenState === "opening" ? "Opening…" : "Open working notes in Word"}
              </button>
              <span style={styles.notesFilename}>{workingNotes.filename}</span>
            </div>
          )}

          {notesOpenState === "error" && notesOpenError && (
            <div style={styles.errorBox}>
              <strong>Working notes error:</strong> {notesOpenError}
            </div>
          )}

          {workingNotes && workingNotes.kind === "inline" && (
            <div style={styles.inlineNotesPanel}>
              <div style={styles.traceHeader}>
                <p style={styles.traceTitle}>Working notes (document generation failed -- shown inline)</p>
                <button style={styles.traceCollapseButton} onClick={() => setInlineNotesCollapsed((p) => !p)}>
                  {inlineNotesCollapsed ? "Show" : "Hide"}
                </button>
              </div>
              {!inlineNotesCollapsed && <pre style={styles.inlineNotesText}>{workingNotes.text}</pre>}
            </div>
          )}

          {composer}

          {lastRunMeta && (
            <div style={styles.feedbackRow}>
              <span style={styles.helperText}>Was this output helpful?</span>
              <button
                style={{
                  ...styles.voteButton,
                  ...(feedback.vote === "up" ? styles.voteButtonActiveUp : {}),
                }}
                onClick={() => feedback.submitVote({ vote: "up", ...lastRunMeta })}
                disabled={feedback.submitting}
              >
                👍
              </button>
              <button
                style={{
                  ...styles.voteButton,
                  ...(feedback.vote === "down" ? styles.voteButtonActiveDown : {}),
                }}
                onClick={() => feedback.submitVote({ vote: "down", ...lastRunMeta })}
                disabled={feedback.submitting}
              >
                👎
              </button>
              {feedback.vote && <span style={styles.successText}>Thanks, recorded.</span>}
              {feedback.error && <span style={styles.feedbackErrorText}>{feedback.error}</span>}
            </div>
          )}

          <div style={styles.insertRow}>
            <button
              style={styles.insertButton}
              onClick={handleInsert}
              disabled={insertState === "inserting"}
            >
              {insertState === "inserting" ? "Inserting…" : "Insert into Document"}
            </button>
            <button style={styles.discardButton} onClick={handleDiscard}>
              Clear output
            </button>
          </div>

          {!activeSection && (
            <p style={styles.helperText}>
              <em>No section detected -- the output will be inserted at the cursor position.</em>
            </p>
          )}

          {insertState === "done" && (
            <p style={styles.successText}>
              Inserted as a tracked change {insertTarget}. Review it in Word (Review tab -- Track
              Changes) before accepting.
            </p>
          )}

          {insertState === "error" && insertError && (
            <div style={styles.errorBox}>
              <strong>Insert error:</strong> {insertError}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  fieldLabel: { fontWeight: 700, color: "#5B6470", marginTop: "12px", fontSize: "13px" },
  helperText: { fontSize: "11px", color: "#5B6470", margin: "4px 0 8px 0", lineHeight: 1.5 },
  uploadRow: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" },
  uploadRoleSelect: { fontSize: "12px", padding: "4px" },
  fileInput: { fontSize: "12px" },
  documentList: { listStyle: "none", margin: "4px 0 8px 0", padding: 0 },
  documentListItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    fontSize: "12px",
    padding: "4px 0",
    borderBottom: "1px solid #EDEFF2",
  },
  documentListText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  removeButton: {
    fontSize: "11px",
    padding: "2px 8px",
    cursor: "pointer",
    border: "1px solid #DDE3EA",
    borderRadius: "3px",
    background: "#fff",
    color: "#5B6470",
    flexShrink: 0,
  },
  select: { fontSize: "12px", padding: "4px", width: "100%", marginBottom: "6px" },
  messageTextarea: {
    width: "100%",
    fontSize: "12px",
    fontFamily: "Segoe UI, sans-serif",
    padding: "8px",
    border: "1px solid #DDE3EA",
    borderRadius: "4px",
    boxSizing: "border-box",
    resize: "vertical",
    marginBottom: "8px",
  },
  runRow: { display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" },
  coachIndicator: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "8px",
    padding: "6px 10px",
    fontSize: "12px",
    background: "#EFF4FA",
    border: "1px solid #C5D5E8",
    borderRadius: "4px",
  },
  coachIndicatorText: { color: "#1F3A5F", flex: 1 },
  coachStopButton: {
    fontSize: "11px",
    padding: "2px 10px",
    cursor: "pointer",
    border: "1px solid #1F3A5F",
    borderRadius: "3px",
    background: "#fff",
    color: "#1F3A5F",
    flexShrink: 0,
  },
  coachManualReview: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "8px",
    padding: "6px 10px",
    fontSize: "12px",
    background: "#FFF8E6",
    border: "1px solid #E0C878",
    borderRadius: "4px",
  },
  coachManualReviewText: { color: "#7A5C00", flex: 1, lineHeight: 1.4 },
  coachToast: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "8px",
    padding: "6px 10px",
    fontSize: "12px",
    background: "#EAF1E8",
    border: "1px solid #B9D3B4",
    borderRadius: "4px",
  },
  coachToastText: { color: "#2C5530", flex: 1, lineHeight: 1.4 },
  coachUndoButton: {
    fontSize: "11px",
    padding: "2px 10px",
    cursor: "pointer",
    border: "1px solid #2C5530",
    borderRadius: "3px",
    background: "#fff",
    color: "#2C5530",
    flexShrink: 0,
  },
  coachDismissButton: {
    fontSize: "11px",
    padding: "2px 6px",
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: "#5B6470",
    flexShrink: 0,
  },
  tracePanel: {
    marginTop: "10px",
    fontSize: "11px",
    background: "#F5F7FA",
    border: "1px solid #DDE3EA",
    borderRadius: "4px",
    padding: "8px 10px",
  },
  traceHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  traceTitle: { fontWeight: 700, margin: 0, color: "#5B6470" },
  traceCollapseButton: {
    fontSize: "11px",
    padding: "2px 8px",
    cursor: "pointer",
    border: "1px solid #DDE3EA",
    borderRadius: "3px",
    background: "#fff",
    color: "#5B6470",
  },
  traceList: {
    listStyle: "none",
    margin: "8px 0 0 0",
    padding: 0,
    lineHeight: 1.7,
    maxHeight: "150px",
    overflowY: "auto",
  },
  traceTime: { fontFamily: "Menlo, Consolas, monospace", color: "#8A93A0", marginRight: "6px" },
  runButton: {
    fontSize: "12px",
    padding: "8px 12px",
    background: "#1F3A5F",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
  runningIndicator: { display: "flex", alignItems: "center", gap: "6px" },
  spinner: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    border: "2px solid #D9D9D9",
    borderTopColor: "#D9D9D9",
    borderRightColor: "transparent",
    animation: "suade-spin 0.7s linear infinite",
    display: "inline-block",
  },
  runningText: { fontSize: "12px", color: "#5B6470" },
  errorBox: {
    fontSize: "13px",
    background: "#FBEAEA",
    border: "1px solid #D98C8C",
    borderRadius: "4px",
    padding: "10px",
    marginTop: "10px",
  },
  outputBox: {
    marginTop: "12px",
    background: "#F5F7FA",
    border: "1px solid #DDE3EA",
    borderRadius: "4px",
    padding: "10px",
  },
  outputLabel: { fontSize: "11px", color: "#5B6470", margin: "0 0 6px 0", lineHeight: 1.5 },
  outputTextarea: {
    width: "100%",
    fontSize: "12px",
    lineHeight: 1.5,
    fontFamily: "Segoe UI, sans-serif",
    padding: "8px",
    border: "1px solid #DDE3EA",
    borderRadius: "4px",
    boxSizing: "border-box",
    resize: "vertical",
  },
  feedbackRow: { display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" },
  voteButton: {
    fontSize: "14px",
    padding: "2px 8px",
    cursor: "pointer",
    border: "1px solid #DDE3EA",
    borderRadius: "4px",
    background: "#fff",
  },
  voteButtonActiveUp: { background: "#EAF1E8", border: "1px solid #2C5530" },
  voteButtonActiveDown: { background: "#FBEAEA", border: "1px solid #B3261E" },
  feedbackErrorText: { fontSize: "11px", color: "#B3261E" },
  notesRow: { display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" },
  notesButton: {
    fontSize: "12px",
    padding: "6px 12px",
    background: "#fff",
    color: "#1F3A5F",
    border: "1px solid #1F3A5F",
    borderRadius: "4px",
    cursor: "pointer",
    flexShrink: 0,
  },
  notesFilename: {
    fontSize: "10px",
    color: "#8A93A0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  inlineNotesPanel: {
    marginTop: "8px",
    fontSize: "11px",
    background: "#FFF8E6",
    border: "1px solid #E0C878",
    borderRadius: "4px",
    padding: "8px 10px",
  },
  inlineNotesText: {
    margin: "8px 0 0 0",
    whiteSpace: "pre-wrap",
    fontFamily: "Segoe UI, sans-serif",
    fontSize: "11px",
    lineHeight: 1.5,
    maxHeight: "200px",
    overflowY: "auto",
  },
  insertRow: { display: "flex", gap: "8px", marginTop: "8px" },
  insertButton: {
    fontSize: "12px",
    padding: "8px 12px",
    background: "#2C5530",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
  discardButton: {
    fontSize: "12px",
    padding: "8px 12px",
    background: "#fff",
    color: "#5B6470",
    border: "1px solid #DDE3EA",
    borderRadius: "4px",
    cursor: "pointer",
  },
  successText: { fontSize: "12px", color: "#2C5530", marginTop: "8px", lineHeight: 1.5 },
};

export default SkillRunnerSection;
