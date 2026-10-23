/**
 * The words of the merge dialog (step 6.8b part A, W1): the editors' own labels for the scalar fields of the nine mergeable kinds, so the
 * dialog never shows a schema key. A key without an entry is split at its capitals ("typicalConditions" -> "Typical conditions").
 */
const WORDS: Readonly<Record<string, string>> = {
  speciesKind: 'Kind of species',
  formula: 'Formula',
  charge: 'Charge',
  isotopeNote: 'Isotope note',
  structure: 'Structure',
  stereo: 'Stereo statement',
  aromaticity: 'Aromaticity claim',
  acidBaseNotes: 'Acid-base notes',
  studyNotes: 'Study notes',
  notes: 'Notes',
  'names.iupac': 'IUPAC name',
  'names.qualifier': 'Qualifier',
  classKind: 'Kind of class',
  generic: 'Generic formula',
  speciesId: 'Backing species',
  formulaText: 'Formula text',
  conceptKind: 'Kind of concept',
  equationText: 'Equation text',
  reactionSmarts: 'Reaction SMARTS',
  bondChangeSummary: 'Bond change summary',
  carbonChainChange: 'Carbon chain change',
  refKind: 'Kind of source',
  topicKind: 'Kind of topic',
  parentId: 'Parent topic',
  shortName: 'Short name',
};

export function mergeFieldWords(path: string): string {
  const known = WORDS[path];
  if (known !== undefined) return known;
  const last = path.slice(path.lastIndexOf('.') + 1);
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A value that says nothing: absent, blank or the schema's "unspecified". */
export const isUnstated = (value: unknown): boolean => value === undefined || value === null || value === '' || value === 'unspecified' || value === 'not_stated';
