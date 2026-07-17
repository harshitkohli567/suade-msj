import React from "react";
import { UploadJob } from "./hooks/useDocumentUploads";

interface UploadProgressProps {
  jobs: UploadJob[];
}

const UploadProgress: React.FC<UploadProgressProps> = ({ jobs }) => {
  if (jobs.length === 0) return null;

  const done = jobs.filter((j) => j.status === "done").length;
  const errored = jobs.filter((j) => j.status === "error");
  const inFlight = jobs.length - done - errored.length;

  return (
    <div style={styles.container}>
      <p style={styles.summary}>
        {inFlight > 0
          ? `Uploading ${done + errored.length}/${jobs.length}…`
          : `Uploaded ${done}/${jobs.length}`}
        {errored.length > 0 ? ` — ${errored.length} failed` : ""}
      </p>

      {errored.length > 0 && (
        <ul style={styles.errorList}>
          {errored.map((job) => (
            <li key={job.id}>
              <strong>{job.filename}</strong>: {job.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { marginTop: "6px", marginBottom: "6px" },
  summary: { fontSize: "11px", color: "#5B6470", margin: 0 },
  errorList: {
    margin: "6px 0 0 0",
    paddingLeft: "16px",
    fontSize: "11px",
    color: "#B3261E",
    lineHeight: 1.5,
    maxHeight: "120px",
    overflowY: "auto",
  },
};

export default UploadProgress;
