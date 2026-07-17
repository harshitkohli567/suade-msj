import React from "react";
import { useBackendStatus } from "./hooks/useBackendStatus";

const LABELS: Record<string, string> = {
  checking: "Checking backend…",
  online: "Backend connected",
  offline: 'Backend not reachable — run "npm run server" in a terminal',
};

const DOT_COLORS: Record<string, string> = {
  checking: "#C9A227",
  online: "#2C5530",
  offline: "#B3261E",
};

const BackendStatus: React.FC = () => {
  const status = useBackendStatus();

  return (
    <div style={styles.container}>
      <span style={{ ...styles.dot, background: DOT_COLORS[status] }} />
      <span style={status === "offline" ? styles.textOffline : styles.text}>{LABELS[status]}</span>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" },
  dot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0 },
  text: { fontSize: "11px", color: "#5B6470" },
  textOffline: { fontSize: "11px", color: "#B3261E", fontWeight: 600 },
};

export default BackendStatus;
