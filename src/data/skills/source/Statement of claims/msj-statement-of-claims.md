---
name: msj-statement-of-claims
description: >
  Use this skill to draft the Statement of Claim(s) of a Motion for Summary Judgment: an accurate enumeration of the operative complaint's counts, the elements framework for each, and which counts this motion targets.
---

# Skill: MSJ — Statement of Claim(s)

> **PLACEHOLDER SKILL CONTENT.** This file defines the Statement of Claim(s) section's
> drafting behavior with generic Massachusetts-employment MSJ guidance so
> the system runs end-to-end. The lawyer-supplied content for this section
> (see Suade.MSJ PRD, "Skill content to follow separately") should replace
> Sections 4 and 6 below -- Sections 3 and 5 contain the system's
> non-negotiable safety rules and should be extended, not weakened.

## 1. Purpose

Draft the **Statement of Claim(s)** section of a Motion for Summary Judgment for a
Massachusetts employment matter, insert-ready, in the lawyer's own voice
when a style profile is provided.

## 2. Required Inputs

- The matter's uploaded case documents (pleadings, discovery, deposition
  excerpts, exhibits) — the only permissible factual sources.
- Clean drafts of previously completed sections, when provided in context.
- The style profile, when provided (form only — see Rule 5).

## 3. Non-Negotiable Rules

1. **No invented facts.** Every factual assertion must trace to an uploaded
   case document. Where the record does not support an assertion the section
   needs, flag it in the working notes as a gap -- never fill it.
2. **Record citations use the citation contract.** Cite uploaded documents by
   hyperlinking the minimal citation phrase with the document's Citation URL
   and a verbatim `#q=` supporting quote, exactly as the run instructions
   specify.
3. **No fabricated legal authority.** Never invent a case name, reporter
   citation, statute section, or quotation from authority. Where a legal
   proposition needs authority that has not been supplied (in the case
   documents or in this Skill's content), write `[AUTHORITY NEEDED: <the
   proposition>]` in the draft and list it in the working notes.
4. **Align with previously drafted sections.** Where prior-section drafts are
   provided in context, keep claim names, party labels, defined terms, and
   fact characterizations consistent with them; note any conflict you cannot
   reconcile in the working notes instead of silently diverging.
5. **The style profile governs form, never content.** Match register and
   structure to the style profile when one is provided; never quote, copy
   phrasing from, or cite the precedent document itself.

## 4. Process

1. Enumerate each count of the operative complaint exactly as pleaded
   (number, claim name, statutory basis where pleaded, e.g. M.G.L. c. 151B).
2. For each targeted count, set out the elements the claim requires, marking
   any element whose authority has not been supplied with [AUTHORITY NEEDED].
3. State clearly which counts the motion targets and which (if any) it does
   not.
4. Keep characterizations of the pleadings neutral and precise -- this
   section describes the claims; the Analysis section argues them.

## 5. Guardrails

- Do not draft argument for claims the record cannot support -- say so in
  the working notes.
- Do not assume the forum's summary-judgment rule variant (Mass. R. Civ. P.
  56 vs. Fed. R. Civ. P. 56 / Local Rule 56.1); if the case documents do not
  settle it, flag it and draft neutrally.
- Keep the clean draft strictly insert-ready: no meta-commentary, no
  process notes, no headings about what you did.
- If any phrasing risks tracking the precedent document too closely, flag
  it explicitly in the working notes (see PRD 4.2).

## 6. Reference Calibration

*(Placeholder — the lawyer-supplied content for this section will define
tone exemplars and length calibration. Until then: match the style profile
when present; otherwise default to plain, direct Massachusetts motion
practice register.)*
