/**
 * In local dev, the task pane (webpack dev server, :3000) and the backend
 * (server.js, :3001) are two separate processes, so calls need an absolute
 * URL. In production, server.js serves both the built task pane AND the
 * API from the same origin (see server.js), so a relative "" (same-origin)
 * works and there's no separate domain to hardcode here.
 */
export const BACKEND_URL = window.location.hostname === "localhost" ? "https://localhost:3101" : "";

/**
 * Placeholder identity until real auth exists (same caveat as
 * uploadedBy in useDocumentUploads). Keys the per-lawyer personal Skill
 * store on the backend, so every user of this build currently shares
 * one "lawyer" and therefore one set of coached Skills.
 */
export const LAWYER_ID = "default-lawyer";
