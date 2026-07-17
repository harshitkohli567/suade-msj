import { DocumentSection } from "@/types";

export interface ParagraphSignal {
  index: number;
  text: string;
  bold: boolean;
  fontSize: number | null;
  isListItem: boolean;
}

const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

function romanToInt(roman: string): number {
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const current = ROMAN_VALUES[roman[i]];
    const next = ROMAN_VALUES[roman[i + 1]];
    if (next && current < next) {
      total -= current;
    } else {
      total += current;
    }
  }
  return total;
}

// Matches "I.", "IV.", "XIII." etc.
const ROMAN_NUMERAL_PATTERN =
  /^(M{0,4}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))\.\s+(.+)$/;

// Matches "A.", "B.", "G." etc.
const SUB_HEADING_PATTERN = /^([A-Z])\.\s+(.+)$/;

export function classifySections(signals: ParagraphSignal[]): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let openLevel1: DocumentSection | null = null;
  let openLevel2: DocumentSection | null = null;
  let expectedNextLevel1Value = 1;

  const closeLevel2 = (beforeIndex: number) => {
    if (openLevel2) {
      openLevel2.endParagraphIndex = beforeIndex - 1;
      openLevel2 = null;
    }
  };

  const closeLevel1 = (beforeIndex: number) => {
    closeLevel2(beforeIndex);
    if (openLevel1) {
      openLevel1.endParagraphIndex = beforeIndex - 1;
      openLevel1 = null;
    }
  };

  for (const signal of signals) {
    if (!signal.bold || signal.isListItem) {
      continue;
    }

    const trimmed = signal.text.trim();
    if (!trimmed) {
      continue;
    }

    const romanMatch = trimmed.match(ROMAN_NUMERAL_PATTERN);
    const subMatch = trimmed.match(SUB_HEADING_PATTERN);
    const romanValue = romanMatch ? romanToInt(romanMatch[1]) : null;
    const isDualMatch = Boolean(romanMatch && subMatch);

    // Single-letter tokens that are also valid roman numerals (I, V, X, L,
    // C, D, M) match BOTH patterns -- real ambiguity (sub-headings "C." and
    // "D." are genuine roman numerals too, but so are real top-level
    // sections "V." and "X." in this document). Font size turned out NOT
    // to reliably distinguish the two levels (live testing showed both
    // report the same resolved size in this document -- Word resolves the
    // full inherited style cascade, not just explicit overrides, and this
    // template's body default happens to match the heading override).
    // Roman-numeral SEQUENCE is the robust signal instead: level-1
    // headings must appear in strict numeric order (I, II, III, IV...), so
    // an ambiguous token is level-1 only if its value is exactly the next
    // expected one; otherwise it nests as a level-2 sub-heading.
    const treatAsLevel1 = Boolean(
      romanMatch && (!isDualMatch || romanValue === expectedNextLevel1Value || !openLevel1)
    );

    if (romanMatch && treatAsLevel1 && romanValue !== null) {
      closeLevel1(signal.index);
      const [, roman, title] = romanMatch;
      const section: DocumentSection = {
        sectionId: roman,
        title: title.trim(),
        level: 1,
        startParagraphIndex: signal.index,
        endParagraphIndex: null,
      };
      sections.push(section);
      openLevel1 = section;
      expectedNextLevel1Value = romanValue + 1;
    } else if (subMatch && openLevel1) {
      closeLevel2(signal.index);
      const [, letter, title] = subMatch;
      const section: DocumentSection = {
        sectionId: `${openLevel1.sectionId}.${letter}`,
        title: title.trim(),
        level: 2,
        startParagraphIndex: signal.index,
        endParagraphIndex: null,
      };
      sections.push(section);
      openLevel2 = section;
    }
  }

  closeLevel1(signals.length);
  return sections;
}

export function findActiveSection(
  sections: DocumentSection[],
  paragraphIndex: number
): DocumentSection | null {
  let best: DocumentSection | null = null;

  for (const section of sections) {
    const end = section.endParagraphIndex ?? Number.MAX_SAFE_INTEGER;
    const withinRange = paragraphIndex >= section.startParagraphIndex && paragraphIndex <= end;
    if (withinRange && (!best || section.level > best.level)) {
      best = section;
    }
  }

  return best;
}
