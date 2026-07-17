import { SkillRecord } from "@/types";

/**
 * Suade.MSJ Skill Registry: exactly six Skills, one per section of a
 * Motion for Summary Judgment, in the canonical drafting order (PRD
 * §4.3). Ordering is advisory -- the pane recommends the sequence and
 * warns when upstream sections are undrafted, but never blocks a run.
 *
 * dependsOnSkills encodes the canonical chain (each section lists every
 * section that canonically precedes it); the MSJ progress rail and the
 * upstream-undrafted warning are driven from MSJ_SECTION_ORDER below,
 * which is the single source of truth for sequence.
 *
 * Skill content is PLACEHOLDER pending the lawyer-supplied section
 * content (PRD header note) -- see the banner inside each skill file.
 */

const OWNER = "Suade.MSJ (firm default)";
const SEEDED_AT = "2026-07-17T00:00:00Z";

/** Section types in canonical order; skillId = "msj-" + sectionType. */
export const MSJ_SECTION_ORDER = [
  "introduction",
  "statement-of-claims",
  "statement-of-undisputed-facts",
  "legal-standards",
  "analysis",
  "conclusion",
] as const;

export type MsjSectionType = (typeof MSJ_SECTION_ORDER)[number];

export const MSJ_SECTION_NAMES: Record<MsjSectionType, string> = {
  introduction: "Introduction",
  "statement-of-claims": "Statement of Claim(s)",
  "statement-of-undisputed-facts": "Statement of Undisputed Material Facts",
  "legal-standards": "Legal Standards",
  analysis: "Analysis",
  conclusion: "Conclusion",
};

export function sectionTypeForSkillId(skillId: string): MsjSectionType | null {
  const candidate = skillId.replace(/^msj-/, "") as MsjSectionType;
  return MSJ_SECTION_ORDER.includes(candidate) ? candidate : null;
}

function seed(
  overrides: Omit<SkillRecord, "scope" | "owner" | "version" | "lastEditedBy" | "lastEditedAt">
): SkillRecord {
  return {
    ...overrides,
    scope: "firm-default",
    owner: OWNER,
    version: 1,
    lastEditedBy: "system-seed",
    lastEditedAt: SEEDED_AT,
  };
}

const priorSections = (sectionType: MsjSectionType): string[] =>
  MSJ_SECTION_ORDER.slice(0, MSJ_SECTION_ORDER.indexOf(sectionType)).map((s) => `msj-${s}`);

export const SKILL_REGISTRY: SkillRecord[] = [
  seed({
    skillId: "msj-introduction",
    displayName: "1. Introduction",
    trigger: { documentTypes: ["motion_for_summary_judgment"], sections: [] },
    description:
      "Drafts the Introduction: who moves, the judgment sought, the counts targeted, and a compact preview of the decisive grounds.",
    sourceFile: "msj-introduction.md",
    dependsOnSkills: priorSections("introduction"),
    requiredDocuments: [],
    lawyerSuppliedInputs: [],
    outputSpec: { register: "confident, plain, direct", structuralFormat: "one to three short paragraphs" },
    insertionRule: { anchor: "cursor", numberingBehaviour: "unnumbered prose paragraphs" },
  }),
  seed({
    skillId: "msj-statement-of-claims",
    displayName: "2. Statement of Claim(s)",
    trigger: { documentTypes: ["motion_for_summary_judgment"], sections: [] },
    description:
      "Drafts the Statement of Claim(s): the operative complaint's counts, each targeted count's elements framework, and which counts the motion targets.",
    sourceFile: "msj-statement-of-claims.md",
    dependsOnSkills: priorSections("statement-of-claims"),
    requiredDocuments: ["other"],
    lawyerSuppliedInputs: [],
    outputSpec: { register: "neutral, precise, descriptive", structuralFormat: "numbered list per count" },
    insertionRule: { anchor: "cursor", numberingBehaviour: "literal count numbering from the complaint" },
  }),
  seed({
    skillId: "msj-statement-of-undisputed-facts",
    displayName: "3. Statement of Undisputed Material Facts",
    trigger: { documentTypes: ["motion_for_summary_judgment"], sections: [] },
    description:
      "Drafts the SUMF: separately numbered single-fact paragraphs, each pinned to the record with a citation; unsupported or disputable facts go to the working notes.",
    sourceFile: "msj-statement-of-undisputed-facts.md",
    dependsOnSkills: priorSections("statement-of-undisputed-facts"),
    requiredDocuments: ["exhibit", "witness_statement", "other"],
    lawyerSuppliedInputs: [],
    outputSpec: {
      register: "flat, factual, citation-dense",
      structuralFormat: "separately numbered single-fact paragraphs, each with a record citation",
    },
    insertionRule: { anchor: "cursor", numberingBehaviour: "literal sequential paragraph numbering" },
  }),
  seed({
    skillId: "msj-legal-standards",
    displayName: "4. Legal Standards",
    trigger: { documentTypes: ["motion_for_summary_judgment"], sections: [] },
    description:
      "Drafts the Legal Standards: the forum's summary-judgment standard and the substantive frameworks for the targeted employment claims -- supplied authority only, placeholders otherwise.",
    sourceFile: "msj-legal-standards.md",
    dependsOnSkills: priorSections("legal-standards"),
    requiredDocuments: [],
    lawyerSuppliedInputs: [],
    outputSpec: { register: "formal, authority-led", structuralFormat: "short headed subsections per framework" },
    insertionRule: { anchor: "cursor", numberingBehaviour: "headed subsections; no auto-numbering" },
  }),
  seed({
    skillId: "msj-analysis",
    displayName: "5. Analysis",
    trigger: { documentTypes: ["motion_for_summary_judgment"], sections: [] },
    description:
      "Drafts the Analysis: applies the legal standards to the undisputed facts claim by claim, element by element, citing SUMF paragraphs and the record.",
    sourceFile: "msj-analysis.md",
    dependsOnSkills: priorSections("analysis"),
    requiredDocuments: ["exhibit", "witness_statement", "other"],
    lawyerSuppliedInputs: [],
    outputSpec: {
      register: "argumentative, structured, measured",
      structuralFormat: "argumentative headings per claim with lettered subsections",
    },
    insertionRule: { anchor: "cursor", numberingBehaviour: "literal argumentative heading numbering" },
  }),
  seed({
    skillId: "msj-conclusion",
    displayName: "6. Conclusion",
    trigger: { documentTypes: ["motion_for_summary_judgment"], sections: [] },
    description: "Drafts the Conclusion: the precise relief requested, one short paragraph, no new argument.",
    sourceFile: "msj-conclusion.md",
    dependsOnSkills: priorSections("conclusion"),
    requiredDocuments: [],
    lawyerSuppliedInputs: [],
    outputSpec: { register: "brief, formal, declarative", structuralFormat: "single short paragraph" },
    insertionRule: { anchor: "cursor", numberingBehaviour: "unnumbered" },
  }),
];
