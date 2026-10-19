/**
 * The species editor's edits as recipes over the draft, and its words (step 6.2a part 4). Same rules as the names model: text is stored
 * exactly as typed (INV-24); an EMPTY optional input means the field is ABSENT (the key is removed); a schema problem is a finding, not
 * a fix. The choices come from the schema's own lists, so the editor can offer nothing the schema refuses. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';
import type { AROMATICITY, SPECIES_KINDS, STEREO_KINDS } from '@/core/schema';

export const SPECIES_KIND_WORDS: Readonly<Record<(typeof SPECIES_KINDS)[number], string>> = {
  molecule: 'Molecule',
  ion: 'Ion',
  salt: 'Salt',
  radical: 'Radical',
  reactive_intermediate: 'Reactive intermediate',
  element: 'Element',
  polymer: 'Polymer',
  unspecified: 'Not specified',
};
export const STEREO_KIND_WORDS: Readonly<Record<(typeof STEREO_KINDS)[number], string>> = {
  achiral: 'Achiral',
  single_stereoisomer: 'Single stereoisomer',
  racemic: 'Racemic',
  meso: 'Meso',
  diastereomeric_mixture: 'Diastereomeric mixture',
  unspecified: 'Unspecified',
};
export const AROMATICITY_WORDS: Readonly<Record<(typeof AROMATICITY)[number], string>> = {
  aromatic: 'Aromatic',
  antiaromatic: 'Antiaromatic',
  non_aromatic: 'Non-aromatic',
  unspecified: 'Unspecified',
};

type Fields = Record<string, unknown>;
type StereoDraft = { kind?: unknown; descriptors?: unknown; note?: unknown } & Fields;

const stereoOf = (draft: Fields): StereoDraft | undefined => (typeof draft.stereo === 'object' && draft.stereo !== null ? (draft.stereo as StereoDraft) : undefined);
const descriptorsOf = (stereo: StereoDraft): string[] => {
  if (!Array.isArray(stereo.descriptors)) stereo.descriptors = [];
  return stereo.descriptors as string[];
};

const setText = (field: string, value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, field);
  else draft[field] = value;
};

export const setSpeciesKind = (value: string): DraftRecipe => (draft) => {
  draft.speciesKind = value;
};
export const setIsotopeNote = (value: string): DraftRecipe => setText('isotopeNote', value);
export const setFormula = (value: string): DraftRecipe => setText('formula', value);

/** A whole number from -20 to 20 is stored; an empty field removes the charge; anything else changes nothing (the field shows what was typed). */
export const setCharge = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'charge');
  else if (/^[+-]?\d+$/.test(value)) draft.charge = Number(value);
};

/** `''` removes the stereo statement, but only when it holds nothing else (see `stereoIsEmpty`). */
export const setStereoKind = (value: string): DraftRecipe => (draft) => {
  const stereo = stereoOf(draft);
  if (value === '') {
    if (stereo === undefined || stereoIsEmpty(stereo)) Reflect.deleteProperty(draft, 'stereo');
  } else if (stereo === undefined) draft.stereo = { kind: value, descriptors: [] };
  else stereo.kind = value;
};
export const stereoIsEmpty = (stereo: { descriptors?: unknown; note?: unknown }): boolean =>
  (!Array.isArray(stereo.descriptors) || stereo.descriptors.length === 0) && (typeof stereo.note !== 'string' || stereo.note === '');

export const addDescriptor = (): DraftRecipe => (draft) => {
  const stereo = stereoOf(draft);
  if (stereo === undefined) draft.stereo = { kind: 'unspecified', descriptors: [''] };
  else descriptorsOf(stereo).push('');
};
export const setDescriptor = (index: number, value: string): DraftRecipe => (draft) => {
  const stereo = stereoOf(draft);
  if (stereo === undefined) return;
  const items = descriptorsOf(stereo);
  if (index >= 0 && index < items.length) items[index] = value;
};
export const removeDescriptor = (index: number): DraftRecipe => (draft) => {
  const stereo = stereoOf(draft);
  if (stereo === undefined) return;
  const items = descriptorsOf(stereo);
  if (index >= 0 && index < items.length) items.splice(index, 1);
};
export const setStereoNote = (value: string): DraftRecipe => (draft) => {
  const stereo = stereoOf(draft);
  if (stereo === undefined) return;
  if (value === '') Reflect.deleteProperty(stereo, 'note');
  else stereo.note = value;
};

export const setAromaticity = (value: string): DraftRecipe => setText('aromaticity', value);

export const setLifecycle = (value: string): DraftRecipe => (draft) => {
  const review = (typeof draft.review === 'object' && draft.review !== null ? draft.review : (draft.review = {})) as Fields;
  review.lifecycle = value;
};

/** Adds a class once (the same class twice is never offered); the list keeps the order the user chose. */
export const addClass = (id: string): DraftRecipe => (draft) => {
  if (!Array.isArray(draft.classIds)) draft.classIds = [];
  const ids = draft.classIds as string[];
  if (!ids.includes(id)) ids.push(id);
};
export const removeClass = (id: string): DraftRecipe => (draft) => {
  if (!Array.isArray(draft.classIds)) return;
  const ids = draft.classIds as string[];
  const at = ids.indexOf(id);
  if (at >= 0) ids.splice(at, 1);
};

/** The draft's species fields as plain values for the form. */
export interface SpeciesView {
  readonly speciesKind: string;
  readonly isotopeNote: string;
  readonly formula: string;
  readonly charge: string;
  readonly stereoKind: string;
  readonly descriptors: readonly string[];
  readonly stereoNote: string;
  readonly aromaticity: string;
  readonly lifecycle: string;
  readonly status: string;
  readonly classIds: readonly string[];
}

export function speciesViewOf(draft: unknown): SpeciesView {
  const fields = (typeof draft === 'object' && draft !== null ? draft : {}) as Fields;
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  const stereo = (typeof fields.stereo === 'object' && fields.stereo !== null ? fields.stereo : {}) as StereoDraft;
  const review = (typeof fields.review === 'object' && fields.review !== null ? fields.review : {}) as Fields;
  return {
    speciesKind: text(fields.speciesKind),
    isotopeNote: text(fields.isotopeNote),
    formula: text(fields.formula),
    charge: typeof fields.charge === 'number' ? String(fields.charge) : '',
    stereoKind: text(stereo.kind),
    descriptors: Array.isArray(stereo.descriptors) ? stereo.descriptors.map((d) => text(d)) : [],
    stereoNote: text(stereo.note),
    aromaticity: text(fields.aromaticity),
    lifecycle: text(review.lifecycle),
    status: text(review.status),
    classIds: Array.isArray(fields.classIds) ? fields.classIds.filter((id): id is string => typeof id === 'string') : [],
  };
}

/** The labels of the fields the species editor owns, by path (the conflict table shows them instead of raw paths). */
export const SPECIES_FIELD_LABELS: Readonly<Record<string, string>> = {
  speciesKind: 'Kind of species',
  isotopeNote: 'Isotope note',
  structure: 'Structure',
  formula: 'Formula',
  charge: 'Charge',
  stereo: 'Stereo',
  aromaticity: 'Aromaticity',
  classIds: 'Classes',
  'review.lifecycle': 'Lifecycle',
  'review.status': 'Review status',
  'review.reasons': 'Review reasons',
  'review.confidence': 'Review confidence',
  'structure.format': 'Structure notation',
  'structure.value': 'Structure',
  'stereo.kind': 'Stereo kind',
  'stereo.descriptors': 'Stereo descriptors',
  'stereo.note': 'Stereo note',
  properties: 'Properties',
  notes: 'Notes',
  studyNotes: 'Study notes',
  acidBaseNotes: 'Acid-base notes',
  tags: 'Tags',
  citations: 'Citations',
};
