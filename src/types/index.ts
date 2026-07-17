/**
 * Shared types for Suade, mirroring the data model in the PRD (Section 12,
 * as resolved in the v0.3 Decisions Log). These are declared now, in Step 1,
 * even though nothing populates them yet -- later steps (3: section
 * detection, 4: Skill Registry, 6: Document Reference Service) build
 * against this shape rather than re-deriving it ad hoc.
 */

// ---------------------------------------------------------------------------
// Matter (FR-8, seeded from a CSV for MVP -- FR-8.6)
// ---------------------------------------------------------------------------

export type RepresentedSide = "Claimant" | "Respondent" | "Other";

export interface MatterRecord {
  matterId: string;
  client: string;
  representedSide: RepresentedSide;
  counterparty: string;
  matterType: string;
  governingLaw: string;
  institutionSeat: string;
  responsibleLawyerTeam: string;
}

// ---------------------------------------------------------------------------
// Uploaded document (FR-10 -- file lives in the lawyer's own Claude account;
// Suade stores only a reference + metadata, not file content)
// ---------------------------------------------------------------------------

export type DocumentRole =
  | "governing_contract"
  | "witness_statement"
  | "expert_report"
  | "exhibit"
  | "corporate_registry" // registry/incorporation extracts -- description-of-parties needs these specifically, distinct from a generic exhibit
  | "client_communication" // meeting transcript / client email -- the matter-intake flow's primary input
  | "other";

export interface UploadedDocumentRecord {
  documentId: string;
  matterId: string;
  /** Opaque reference returned by Claude's native file-upload capability. Suade never stores file content itself (FR-10.2). */
  claudeFileReference: string;
  /**
   * Unguessable token + URL of the backend-hosted copy of the ORIGINAL
   * file, used as the target for citation hyperlinks in Skill output.
   * Null for documents uploaded before hosting existed.
   */
  documentToken: string | null;
  documentUrl: string | null;
  filename: string;
  fileType: "pdf" | "docx" | "msg";
  documentRole: DocumentRole;
  uploadedBy: string;
  uploadedAt: string; // ISO 8601
  linkedSkillRunIds: string[];
}

// ---------------------------------------------------------------------------
// Skill (FR-4, FR-6, FR-10.3)
// ---------------------------------------------------------------------------

export type SkillScope = "firm-default" | "user-copy";

export interface SkillTrigger {
  documentTypes: string[]; // e.g. ["statement_of_claim"]
  sections: string[]; // section identifiers this Skill is offered for
}

/**
 * Qualitative guidance only -- deliberately no fixed target length.
 * The model determines appropriate length/detail from the matter's
 * actual facts at run-time (FR-7.1, Decisions Log item 4).
 */
export interface SkillOutputSpec {
  register: string; // e.g. "argumentative", "short narrative"
  structuralFormat: string; // e.g. "numbered clauses matching surrounding document"
}

export type InsertionAnchor = "cursor" | "section_end" | "replace_selection";

export interface SkillInsertionRule {
  anchor: InsertionAnchor;
  numberingBehaviour: string; // free-text guidance for now; formalize in Step 8
}

export interface SkillRecord {
  /** Matches the skill file's YAML frontmatter `name`, e.g. "quantum-of-loss". */
  skillId: string;
  displayName: string; // human-readable, e.g. "Quantum of Loss"
  scope: SkillScope;
  owner: string;
  trigger: SkillTrigger;
  /** One-line trigger/routing description, taken directly from the skill file's YAML frontmatter `description`. */
  description: string;
  /**
   * Path (relative to src/data/skills/source/) to the skill's full
   * instructions. These are NOT a short {{variable}} prompt template --
   * each file is a complete multi-phase agentic workflow spec (required
   * inputs, non-negotiable rules, phase-by-phase process, verification,
   * output package, guardrails, reference calibration). The whole file
   * is what gets loaded as context when the Skill runs.
   */
  sourceFile: string;
  /**
   * Other Skills whose output this Skill's own "Required Inputs" section
   * says it needs (e.g. relief-sought depends on main-proposition,
   * breach, causation, quantum-of-loss, interest, and
   * jurisdiction-and-applicable-law). Suade doesn't yet enforce or
   * auto-run this chain -- see the open question in the registry file --
   * this field just records the real dependency so the UI can eventually
   * warn a lawyer who tries to run a Skill out of order.
   */
  dependsOnSkills: string[];
  /** document_role values this Skill's own "Required Inputs" section names as needed uploads (FR-10.3). */
  requiredDocuments: DocumentRole[];
  /**
   * Inputs several Skills require that are neither an uploaded document
   * nor another Skill's output -- e.g. a lawyer-supplied "Legal Theory
   * Brief" or "Case Brief" giving causes of action, elements, and
   * governing provisions. Not yet modeled anywhere in the product (no UI
   * captures these) -- flagged here rather than silently dropped.
   */
  lawyerSuppliedInputs: string[];
  outputSpec: SkillOutputSpec;
  insertionRule: SkillInsertionRule;
  version: number;
  lastEditedBy: string;
  lastEditedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Document structure / section detection (FR-1.2-1.3 -- Step 3)
// ---------------------------------------------------------------------------

export interface DocumentSection {
  /** Stable identifier used to match against Skill.trigger.sections, e.g. "III" or "IV.A". */
  sectionId: string;
  title: string;
  level: number; // 1 = roman-numeral heading, 2 = lettered sub-heading
  startParagraphIndex: number;
  endParagraphIndex: number | null; // null while still the last-known section
}

// ---------------------------------------------------------------------------
// Live cursor/selection context (FR-1.1 -- Step 2)
// ---------------------------------------------------------------------------

export interface DocumentContext {
  paragraphIndex: number;
  paragraphText: string;
  selectedText: string;
  activeSection: DocumentSection | null;
}

// ---------------------------------------------------------------------------
// Activity graph (FR-2 -- Phase 3, not built yet, typed early for stability)
// ---------------------------------------------------------------------------

export type SkillRunOutcome = "accepted" | "edited" | "rejected";

export interface SkillRunRecord {
  skillRunId: string;
  skillId: string;
  matterId: string;
  lawyerId: string;
  sectionId: string;
  documentReferencesUsed: string[]; // UploadedDocumentRecord.documentId[]
  outcome: SkillRunOutcome | null; // null while in flight
  createdAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Skill run feedback (thumbs up/down on a Skill's output)
// ---------------------------------------------------------------------------

export type SkillFeedbackVote = "up" | "down";
