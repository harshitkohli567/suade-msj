# Suade.MSJ — Product Requirements Document

**Version:** 0.2 · **Date:** 17 July 2026 · **Status:** Living document — system built; Skill content pending.
**Relationship to Suade:** Suade.MSJ is a specialized fork of Suade v1.0 (16 July 2026), scoped to a single deliverable — a Motion for Summary Judgment (MSJ) — for a Massachusetts employment lawyer. It inherits Suade's task-pane/backend architecture, document handling, citation model, two-channel output, tracked-changes insertion, and Skill Coach. This PRD specifies only what is new or changed; unmarked behavior is identical to Suade v1.0 (see the parent repo's PRD.md).

Statuses: **[Built]** shipped and verified · **[Placeholder]** system built, lawyer-supplied content pending · **[Planned]**.

---

## 1. Product thesis

Suade.MSJ turns Suade's general drafting engine into a purpose-built MSJ assembly line: one Skill per section of the motion, run in a recommended sequence, each aware of what has already been drafted, calibrated to the lawyer's own voice via an uploaded precedent document, and — like Suade — verifiable down to the cited passage.

Four ideas define it, three inherited and one new:

- **Point of work** (inherited). Operates inside the Word task pane against the matter's actual documents; output inserts as tracked changes.
- **Verifiability over fluency** (inherited). Citations hyperlink to the source passage; gaps are reported, never invented.
- **The instructions are the product** (inherited). Each of the six sections is a versioned, editable Skill; Skill Coach lets the lawyer's corrections durably update them.
- **Draft in the firm's own voice** (new). A lawyer-supplied precedent MSJ (or brief) is analyzed for tone and style, and that profile is threaded into every section Skill — the output should read like this lawyer's writing, not generic motion boilerplate.

## 2. Users and core workflows

**User:** an employment-side litigator in Massachusetts drafting a Motion for Summary Judgment on a specific matter. Side-agnostic (plaintiff or defense) — the Legal Standards and Analysis Skills carry whatever framing the lawyer's own Skill content specifies.

Assumption carried from Suade: single shared deployment, one lawyer identity per environment (§7). Revisit per-lawyer isolation before any multi-attorney rollout.

**Workflow A — voice calibration (optional).** Upload one precedent MSJ/brief (PDF/DOCX) → a structured style profile is extracted (register, sentence structure, citation conventions, section-opening patterns — form, never content) → applied to every section run for the matter; replace or remove at any time; prior drafts are not re-styled.

**Workflow B — sequential section drafting.** Detect/create the matter → upload case documents → run each section Skill in the recommended order (Introduction → Statement of Claim(s) → SUMF → Legal Standards → Analysis → Conclusion) → review clean draft + working notes → insert as tracked changes. Every run automatically receives the latest clean drafts of all completed sections, regardless of run order; sections can be re-run at will.

**Workflow C — coaching (inherited).** Identical to Suade; coaching is per-Skill — a correction on Legal Standards updates only that section's Skill.

## 3. Architecture — [Built]

Reuses the Suade stack unchanged. Dev ports: task pane **3100**, backend **3101** (so Suade and Suade.MSJ run side by side). Additions:

- **MSJ section state** — `msj-sections/{matterSlug}.json`: per section, the latest clean draft, version, run metadata, insertion timestamp, and the exact versions of other sections used as context.
- **Precedent/style store** — `precedent-docs/{matterSlug}/`: original bytes, text extraction, derived `profile.md`, metadata. Never enters the case-document list; never hosted at a citation URL.
- **Six Skills**, folder-per-skill: `msj-introduction`, `msj-statement-of-claims`, `msj-statement-of-undisputed-facts`, `msj-legal-standards`, `msj-analysis`, `msj-conclusion`.

## 4. Functional requirements

### 4.1 Matter & document layer — [Built] (inherited)
Matter detection/intake, PDF/DOCX/MSG upload, hosted originals: unchanged from Suade FR-8/FR-11/FR-10/FR-12.

### 4.2 Precedent document & style profile — [Built]
- One precedent per matter (PDF/DOCX); replacing replaces the active profile going forward — prior drafts are not retroactively re-styled. PDFs are text-extracted server-side (PDF.js); scanned/near-empty documents are rejected with a clear error.
- Style extraction runs once at upload, producing a structured, human-readable profile under fixed headings (register/tone, sentence structure, paragraph & section-opening patterns, citation conventions, argumentation habits, formatting) — the profile, not the raw document, is what enters prompts. Hard rules in the extraction: no quotes over 8 words, no party/case names, no facts.
- The precedent is never a citation source and never quoted into drafts; prompts instruct this explicitly, and working notes flag any borrowed phrasing.
- Optional at every step; runs without a profile fall back to the Skill's default voice guidance.

### 4.3 Sequential section Skills & cross-section context — [Built]
- Six-section structure via the existing run lifecycle; request carries `sectionType`.
- Every section run's prompt includes: case documents, the style profile (if any), and the latest clean drafts of all other completed sections — regardless of run order — with an explicit consistency instruction (claim names, party labels, defined terms).
- Ordering is advisory: the pane recommends the canonical sequence and shows a non-blocking warning when upstream sections are undrafted.
- Re-running a section does not auto-re-run downstream sections; the rail flags each section drafted against a now-superseded upstream version (`stale`), computed live from recorded context versions. Re-run decisions stay with the lawyer.

### 4.4 Skill runs — [Built] (inherited)
Run lifecycle, live activity trace (now also showing prior-section context and style-profile application), transient-error retry, message-only runs: unchanged.

### 4.5 Two-channel output & working notes — [Built] (inherited, extended)
Same `<clean_draft>`/`<working_notes>` contract and .docx rendering. **Extension:** working notes end with a backend-appended "Context Used for This Run" section listing each prior section used (name, draft version, timestamp) and whether the style profile applied — deterministic, not model-reported.

### 4.6 Verifiable citations — [Built] (inherited)
Same contract as Suade FR-14, applying to case documents. Statute/case-law sourcing conventions belong to the lawyer-supplied Skill content; until then, placeholder Skills forbid invented authority and emit `[AUTHORITY NEEDED: …]` markers.

### 4.7 Insertion — [Built] (inherited, extended)
Tracked-changes insertion unchanged. **Extension:** a successful insert marks that section `inserted` in section state (persisted server-side), so the rail shows it across pane reloads; re-running a section resets it to `drafted` until re-inserted.

### 4.8 Skill Coach — [Built] (inherited, per-section)
Identical mechanics, applied independently per section Skill; personal copies per lawyer per section; Non-Negotiable Rules / Guardrails sections remain excluded from auto-commit — the placeholder Skills ship with those sections populated so the protections are active from day one.

### 4.9 Feedback & learning corpus — [Built] (inherited)
Thumbs, run log, edit-pair corpus incl. post-insert capture: per section run, unchanged.

### 4.10 Operations & UX chrome — [Built]
Inherited chrome plus the **section progress rail**: six steps showing not started / drafted (with version) / inserted, a "next" hint on the first undrafted section, stale badges with an explanatory tooltip, and click-to-select wiring into the Skill runner.

### 4.11 Skill content — [Placeholder]
All six Skills ship as clearly-bannered placeholders: real Non-Negotiable Rules and Guardrails (active now), generic MA-employment process skeletons to be replaced by the lawyer-supplied content per section (banner marks exactly which sections to replace).

## 5. Interface inventory (new/changed routes)

| Route | Purpose |
|---|---|
| `POST /api/precedent-doc` · `DELETE /api/precedent-doc?matterId=` | upload precedent → derive style profile · remove it |
| `GET /api/msj-sections?matterId=` | status + versions + stale flags + style profile, for the rail and context assembly |
| `POST /api/msj-sections/mark-inserted` | pane marks a section's draft inserted after a successful Word insert |
| `POST /api/run-skill` (extended) | request includes `sectionType`; backend assembles prior-section + style context automatically |

*(Deviation from PRD v0.1: matter ids contain `/`, so `:matterId` path params became query params.)*

## 6. Data & storage model

Same pre-database posture. Additions: `msj-sections/{matterSlug}.json`, `precedent-docs/{matterSlug}/`, `skills/personal/{lawyer}/msj-*` (created on first coaching). Env overrides: `SUADE_MSJ_SECTIONS_DIR`, `SUADE_PRECEDENT_DOCS_DIR`.

> Same critical dependency as Suade: Render's filesystem is ephemeral until a persistent disk is attached. For Suade.MSJ an un-mounted disk additionally wipes in-progress MSJ section state and style profiles on redeploy — raising the stakes on the disk-attach task.

## 7. Security & confidentiality posture

Inherits Suade's no-auth, shared-identity, private-link model — reasonable for a solo lawyer; revisit before sharing the deployment. Precedent documents are treated with the same confidentiality as case documents (they are work product), but are deliberately excluded from citation hosting. Model-behavior guardrails carried over: no invented facts or authority, protected Skill sections not auto-editable, precedent never surfaces as content.

## 8. Known limitations

Style extraction is heuristic and single-document (no multi-precedent blending). Ordering warnings are advisory, not blocking. Stale flags don't auto-refresh downstream sections. Placeholder Skill content until the lawyer's own arrives. All Suade §8 limitations apply (scanned PDFs, .eml, raw markdown in the draft box, Word-API behaviors verified by live use). The six-section structure (vs. the source brief's "5 parts" framing) is implemented as enumerated here — flagged for the lawyer's confirmation.

## 9. Roadmap

- **Now:** swap in the six lawyer-supplied Skill contents as they arrive; first live-Word walkthrough of the full six-section flow; create the GitHub repo + Render service (with persistent disk from day one).
- **Next:** Skill promotion for the MSJ Skills once multiple attorneys share a deployment.
- **Later:** generalize the section-Skill-sequence pattern to other MA employment motion types; multi-precedent style blending.

## 10. Decisions log

| When | Decision |
|---|---|
| 16 Jul | Fork of Suade v1.0; new surface limited to style calibration + sequential section context (PRD v0.1) |
| 16 Jul | Precedent informs form only — never a citation source, never quoted |
| 16 Jul | Ordering advisory; downstream flagged, never auto-re-run |
| 17 Jul | Fork realized as sibling repo on ports 3100/3101; six placeholder Skills shipped with live guardrails; `:matterId` path params became query params (ids contain `/`); style profile capped at 60k chars of precedent text, extraction rejects <500 chars; a section re-run resets its `inserted` status |
