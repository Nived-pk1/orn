/**
 * Plain words for a student (step 8.1): the kind chip of a record and the few enum values a chip may show. No raw schema word, no
 * underscore. Presentation only; nothing here decides chemistry.
 */
const KIND_CHIP: Readonly<Record<string, string>> = {
  reaction: 'Reaction',
  species: 'Compound',
  class: 'Class',
  reagent: 'Reagent',
  concept: 'Idea',
  named_reaction: 'Named reaction',
  mechanism: 'Mechanism',
  transformation: 'Change',
  caveat: 'Watch out',
  route: 'Route',
};

/** The kinds the new layout is made for. */
export const STUDY_LAYOUT_KINDS: ReadonlySet<string> = new Set(Object.keys(KIND_CHIP));

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
export const plain = (value: string): string => value.replaceAll('_', ' ');

/** "Compound" for a species, "Idea" for a concept; any other kind in plain capitalised words. */
export const studyKindWord = (kind: string): string => KIND_CHIP[kind] ?? capital(plain(kind));
