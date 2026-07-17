# Output and Context Contract

*(System-owned reference. Six identical copies live in each MSJ skill's
`references/` folder; keep them in sync. This file describes the contract
the Suade.MSJ runtime enforces around every section run -- the skill files
point here so drafting instructions and system behavior never diverge.)*

## Output format: two channels

Return your ENTIRE response as exactly two tagged channels, nothing outside
the tags:

- `<clean_draft>` — only the insert-ready section text, written as PLAIN
  TEXT exactly as it should read in the motion. No markdown symbols (no
  `#`, `**`, backticks, bullet markers); the ONLY markdown permitted is
  citation links as described below. No gap reports, no commentary, no
  process notes.
- `<working_notes>` — everything else: gap reports, verification
  checklists, adverse-fact flags, `[AUTHORITY NEEDED]` lists, open
  questions, consistency conflicts with prior sections. Use markdown
  headings, bullets, numbered lists, and tables freely — this channel is
  rendered into a separate Word document for the lawyer.

The system automatically appends a "Context Used for This Run" section to
the working notes; you do not need to produce one.

## Citation rules (case documents)

- Uploaded case documents are listed in the prompt, each with a Citation
  URL. When the draft cites, quotes, or relies on one, hyperlink the
  MINIMAL citation phrase — never a whole sentence — as
  `[phrase](citation-url/view#q=...)`, where `#q=` carries the URL-encoded
  VERBATIM supporting passage (max 200 characters; first sentence or
  clause if longer). If you cannot quote verbatim, link to
  `citation-url/view` without `#q=`.
- Never invent a URL. Documents without a Citation URL are cited unlinked.
- Every factual assertion in the draft must trace to an uploaded document;
  facts without record support go to the working notes as gaps, never into
  the draft.

## Legal authority

Never fabricate a case name, reporter citation, statute section, or
quotation from authority. Where a proposition needs authority that has not
been supplied, write `[AUTHORITY NEEDED: <the proposition>]` in the draft
and list it in the working notes.

## Previously drafted sections

When the prompt contains "Previously Drafted Sections of This Motion",
treat those drafts as settled: keep claim names, party labels, defined
terms, and fact characterizations consistent with them; do not re-draft
them. If your section's own instructions conflict with a prior draft,
follow the prior draft and record the conflict in the working notes.

## Style profile

When the prompt contains a "Style Profile (form, not content)" block,
match its register, sentence structure, and formatting conventions. The
profile derives from a precedent document that is NOT part of this
matter's record: never cite it, never quote it, never borrow its phrasing,
facts, or authorities. If any drafted phrasing risks tracking the
precedent too closely, flag it in the working notes. With no style
profile, use the register the skill file itself describes.
