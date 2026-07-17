import React, { useState } from "react";
import { useDocumentContext } from "./hooks/useDocumentContext";
import { useSectionDebug } from "./hooks/useSectionDebug";
import { useMatterDetection } from "./hooks/useMatterDetection";
import { useMatterIntake } from "./hooks/useMatterIntake";
import { resolveAutoMatch } from "@/data/matters/matterMatching";
import { useDocumentUploads, UNASSIGNED_MATTER_ID } from "./hooks/useDocumentUploads";
import SkillRunnerSection from "./SkillRunnerSection";
import BackendStatus from "./BackendStatus";
import UploadProgress from "./UploadProgress";

const App: React.FC = () => {
  const { context, error } = useDocumentContext();
  const debug = useSectionDebug();
  const matterDetection = useMatterDetection();
  const intake = useMatterIntake();
  const documentUploads = useDocumentUploads();
  const boldSignals = debug.signals.filter((s) => s.bold);
  const resolvedMatch = resolveAutoMatch(matterDetection.results);
  const [matterCardCollapsed, setMatterCardCollapsed] = useState(false);
  const [diagnosticsCollapsed, setDiagnosticsCollapsed] = useState(false);
  const [intakeInstruction, setIntakeInstruction] = useState("");

  // A matter established via blank-document intake takes precedence;
  // otherwise fall back to document-text detection.
  const resolvedMatter = intake.result ? intake.result.matter : resolvedMatch ? resolvedMatch.matter : null;
  const matterNote = intake.result ? intake.result.note : resolvedMatch ? resolvedMatch.reason : null;

  const intakeDocs = documentUploads.documentsForMatter(UNASSIGNED_MATTER_ID);

  const handleIntakeFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    e.target.value = "";
    await documentUploads.uploadDocuments(files, UNASSIGNED_MATTER_ID, "client_communication");
  };

  const handleStartMatter = async () => {
    const result = await intake.run(intakeInstruction, intakeDocs);
    if (result) {
      // Intake materials become the new matter's documents, so Skills can use them.
      documentUploads.reassignDocuments(UNASSIGNED_MATTER_ID, result.matter.matterId);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Suade MSJ</h1>
      <p style={styles.subheading}>Motion for Summary Judgment drafting — Massachusetts employment.</p>

      <BackendStatus />

      {error && (
        <div style={styles.errorBox}>
          <strong>Error reading document:</strong> {error}
        </div>
      )}

      {!error && !context && <p style={styles.body}>Reading document context…</p>}

      {context && (
        <dl style={styles.fieldList}>
          <dt style={styles.fieldLabel}>Paragraph index</dt>
          <dd style={styles.fieldValue}>
            {context.paragraphIndex >= 0 ? context.paragraphIndex : "(none detected)"}
          </dd>

          <dt style={styles.fieldLabel}>Active section</dt>
          <dd style={styles.fieldValue}>
            {context.activeSection ? (
              <>
                <strong>{context.activeSection.sectionId}</strong> — {context.activeSection.title}
              </>
            ) : (
              <em>(none — outside any recognized section, e.g. cover page)</em>
            )}
          </dd>
        </dl>
      )}

      <hr style={styles.divider} />

      <p style={styles.fieldLabel}>Matter Detection</p>
      <button style={styles.debugButton} onClick={matterDetection.run} disabled={matterDetection.loading}>
        {matterDetection.loading ? "Detecting…" : "Detect Matter"}
      </button>

      {matterDetection.error && (
        <div style={styles.errorBox}>
          <strong>Matter detection error:</strong> {matterDetection.error}
        </div>
      )}

      {resolvedMatter && (
        <div style={styles.matterCard}>
          <div style={styles.matterCardHeader}>
            <p style={styles.matterCardTitle}>
              {matterCardCollapsed ? resolvedMatter.matterId : "Resolved Matter"}
            </p>
            <button
              style={styles.collapseButton}
              onClick={() => setMatterCardCollapsed((prev) => !prev)}
            >
              {matterCardCollapsed ? "Show" : "Hide"}
            </button>
          </div>

          {!matterCardCollapsed && (
            <dl style={styles.fieldList}>
              <dt style={styles.fieldLabel}>Matter ID</dt>
              <dd style={styles.fieldValue}>{resolvedMatter.matterId}</dd>
              <dt style={styles.fieldLabel}>Client</dt>
              <dd style={styles.fieldValue}>{resolvedMatter.client}</dd>
              <dt style={styles.fieldLabel}>Represented side</dt>
              <dd style={styles.fieldValue}>{resolvedMatter.representedSide}</dd>
              <dt style={styles.fieldLabel}>Counterparty</dt>
              <dd style={styles.fieldValue}>{resolvedMatter.counterparty}</dd>
              <dt style={styles.fieldLabel}>Matter type</dt>
              <dd style={styles.fieldValue}>{resolvedMatter.matterType}</dd>
              <dt style={styles.fieldLabel}>Governing law</dt>
              <dd style={styles.fieldValue}>{resolvedMatter.governingLaw}</dd>
              <dt style={styles.fieldLabel}>Institution / seat</dt>
              <dd style={styles.fieldValue}>{resolvedMatter.institutionSeat}</dd>
              <dt style={styles.fieldLabel}>Responsible team</dt>
              <dd style={styles.fieldValue}>{resolvedMatter.responsibleLawyerTeam}</dd>
            </dl>
          )}

          {!matterCardCollapsed && matterNote && <p style={styles.matchReason}>{matterNote}</p>}

          {!matterCardCollapsed && intake.result && intake.result.gaps.length > 0 && (
            <ul style={styles.gapList}>
              {intake.result.gaps.map((gap, i) => (
                <li key={i}>{gap}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!resolvedMatter && matterDetection.hasRun && (
        <p style={styles.body}>No matter detected in this document.</p>
      )}

      {!resolvedMatter && (
        <div style={styles.intakeBlock}>
          <p style={styles.fieldLabel}>Or start from a blank document</p>
          <p style={styles.helperText}>
            Describe the matter in your own words and attach the client meeting transcript or an
            email from the client (PDF, DOCX, or Outlook .msg). Suade will pull out the matter
            details -- or recognise the matter if it already exists in the repository -- so you can
            start drafting.
          </p>

          <textarea
            style={styles.intakeTextarea}
            value={intakeInstruction}
            onChange={(e) => setIntakeInstruction(e.target.value)}
            placeholder="e.g. New matter -- we act for the client in the attached meeting notes. Prepare to draft a Statement of Claim."
            rows={3}
          />

          <input
            type="file"
            accept=".pdf,.docx,.msg"
            multiple
            onChange={handleIntakeFiles}
            style={styles.intakeFileInput}
            disabled={documentUploads.uploading || intake.loading}
          />

          <UploadProgress jobs={documentUploads.uploadJobs} />

          {intakeDocs.length > 0 && (
            <p style={styles.helperText}>
              Attached: {intakeDocs.map((d) => d.filename).join(", ")}
            </p>
          )}

          <button
            style={styles.debugButton}
            onClick={handleStartMatter}
            disabled={intake.loading || documentUploads.uploading || (!intakeInstruction.trim() && intakeDocs.length === 0)}
          >
            {intake.loading ? "Reading materials…" : "Start Matter"}
          </button>

          {intake.error && (
            <div style={styles.errorBox}>
              <strong>Intake error:</strong> {intake.error}
            </div>
          )}
        </div>
      )}

      <hr style={styles.divider} />

      <SkillRunnerSection
        matter={resolvedMatter}
        activeSection={context ? context.activeSection : null}
        uploadedDocuments={resolvedMatter ? documentUploads.documentsForMatter(resolvedMatter.matterId) : []}
        uploadDocuments={documentUploads.uploadDocuments}
        uploading={documentUploads.uploading}
        uploadError={documentUploads.uploadError}
        uploadJobs={documentUploads.uploadJobs}
        removeDocument={documentUploads.removeDocument}
        removingDocumentIds={documentUploads.removingDocumentIds}
        removeError={documentUploads.removeError}
      />

      <hr style={styles.divider} />

      <button style={styles.debugButton} onClick={debug.run} disabled={debug.loading}>
        {debug.loading ? "Running diagnostics…" : "Run section-detection diagnostics"}
      </button>

      {debug.error && (
        <div style={styles.errorBox}>
          <strong>Diagnostics error:</strong> {debug.error}
        </div>
      )}

      {debug.sections.length > 0 || boldSignals.length > 0 ? (
        <div style={styles.debugPanel}>
          <div style={styles.matterCardHeader}>
            <p style={styles.debugHeading}>
              Sections detected: {debug.sections.length} | Bold paragraphs found: {boldSignals.length}
            </p>
            <button
              style={styles.collapseButton}
              onClick={() => setDiagnosticsCollapsed((prev) => !prev)}
            >
              {diagnosticsCollapsed ? "Show" : "Hide"}
            </button>
          </div>

          {!diagnosticsCollapsed && (
            <>
              <p style={styles.debugSubheading}>Detected sections:</p>
              <ul style={styles.debugList}>
                {debug.sections.map((s) => (
                  <li key={s.sectionId}>
                    <strong>{s.sectionId}</strong> [{s.startParagraphIndex}–{s.endParagraphIndex}] —{" "}
                    {s.title}
                  </li>
                ))}
              </ul>

              <p style={styles.debugSubheading}>All bold paragraphs (raw signal):</p>
              <ul style={styles.debugList}>
                {boldSignals.map((s) => (
                  <li key={s.index}>
                    #{s.index} size={s.fontSize ?? "null"} listItem={String(s.isListItem)} —{" "}
                    {s.text.slice(0, 60)}
                    {s.text.length > 60 ? "…" : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        debug.signals.length > 0 && (
          <p style={styles.body}>
            Diagnostics ran but found 0 bold paragraphs — this itself is useful information, tell
            Claude this exact result.
          </p>
        )
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { fontFamily: "Segoe UI, sans-serif", padding: "16px", color: "#1a1a1a" },
  heading: { fontSize: "20px", fontWeight: 700, color: "#1F3A5F", margin: "0 0 4px 0" },
  subheading: { fontSize: "13px", color: "#5B6470", margin: "0 0 16px 0" },
  body: { fontSize: "13px", lineHeight: 1.5 },
  errorBox: {
    fontSize: "13px",
    background: "#FBEAEA",
    border: "1px solid #D98C8C",
    borderRadius: "4px",
    padding: "10px",
    marginBottom: "12px",
  },
  fieldList: { fontSize: "13px", margin: 0 },
  fieldLabel: { fontWeight: 700, color: "#5B6470", marginTop: "12px" },
  fieldValue: { margin: "4px 0 0 0", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  helperText: { fontSize: "11px", color: "#5B6470", margin: "4px 0 8px 0", lineHeight: 1.5 },
  divider: { margin: "20px 0", border: "none", borderTop: "1px solid #E0E0E0" },
  debugButton: {
    fontSize: "12px",
    padding: "8px 12px",
    background: "#1F3A5F",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    marginTop: "8px",
  },
  matterCard: {
    marginTop: "12px",
    background: "#EAF1E8",
    border: "1px solid #B9D3B4",
    borderRadius: "4px",
    padding: "10px",
  },
  matterCardTitle: { fontWeight: 700, margin: 0, color: "#2C5530" },
  matchReason: { fontSize: "11px", fontStyle: "italic", color: "#2C5530", margin: "8px 0 0 0", lineHeight: 1.5 },
  gapList: {
    fontSize: "11px",
    color: "#7A5C00",
    margin: "6px 0 0 0",
    paddingLeft: "16px",
    lineHeight: 1.5,
  },
  intakeBlock: { marginTop: "14px" },
  intakeTextarea: {
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
  intakeFileInput: { fontSize: "12px", marginBottom: "6px" },
  matterCardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  collapseButton: {
    fontSize: "11px",
    padding: "2px 8px",
    cursor: "pointer",
    border: "1px solid #B9D3B4",
    borderRadius: "3px",
    background: "#fff",
    color: "#2C5530",
  },
  debugPanel: {
    marginTop: "12px",
    fontSize: "11px",
    background: "#F5F7FA",
    border: "1px solid #DDE3EA",
    borderRadius: "4px",
    padding: "10px",
    maxHeight: "300px",
    overflowY: "auto",
  },
  debugHeading: { fontWeight: 700, margin: "0 0 8px 0" },
  debugSubheading: { fontWeight: 700, margin: "10px 0 4px 0", color: "#5B6470" },
  debugList: { margin: 0, paddingLeft: "18px", lineHeight: 1.6 },
};

export default App;
