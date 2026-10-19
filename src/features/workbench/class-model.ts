/**
 * The class editor's edits as recipes over the draft, and its words (step 6.2b decision D1). Same rules as the species model: text is
 * stored exactly as typed (INV-24); an EMPTY optional input means the field is ABSENT; a schema problem is a finding, not a fix. The
 * kinds come from the schema's own list, so the editor can offer nothing the schema refuses. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';
import type { CLASS_KINDS } from '@/core/schema';
import { genericText, setGenericField } from './generic-model';

export const CLASS_KIND_WORDS: Readonly<Record<(typeof CLASS_KINDS)[number], string>> = {
  compound_class: 'Compound class',
  functional_group: 'Functional group',
  structural_family: 'Structural family',
  homologous_series: 'Homologous series',
  reagent_family: 'Reagent family',
};

type Fields = Record<string, unknown>;

/** `''` (the "Choose a kind" option) removes the field: a new class has none, and L1 refuses Save until one is chosen. */
export const setClassKind = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'classKind');
  else draft.classKind = value;
};

const listOf = (draft: Fields, field: string): string[] => {
  if (!Array.isArray(draft[field])) draft[field] = [];
  return draft[field] as string[];
};

const addTo = (field: string, id: string): DraftRecipe => (draft) => {
  const ids = listOf(draft, field);
  if (!ids.includes(id)) ids.push(id);
};
const removeFrom = (field: string, index: number): DraftRecipe => (draft) => {
  const ids = listOf(draft, field);
  if (index >= 0 && index < ids.length) ids.splice(index, 1);
};

export const addParent = (id: string): DraftRecipe => addTo('parentIds', id);
export const removeParent = (index: number): DraftRecipe => removeFrom('parentIds', index);
export const addExample = (id: string): DraftRecipe => addTo('exampleSpeciesIds', id);
export const removeExample = (index: number): DraftRecipe => removeFrom('exampleSpeciesIds', index);
/** Examples are ordered ("curated, ordered examples"): a move swaps a record with its neighbour. */
export const moveExample = (index: number, by: -1 | 1): DraftRecipe => (draft) => {
  const ids = listOf(draft, 'exampleSpeciesIds');
  const to = index + by;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return;
  const moved = ids[index] as string;
  ids[index] = ids[to] as string;
  ids[to] = moved;
};

export type GenericText = 'formulaText' | 'generalFormula' | 'smarts';
export const setGenericText = (field: GenericText, value: string): DraftRecipe => setGenericField(field, value === '' ? undefined : value);

/** The draft's class fields as plain values for the form. */
export interface ClassView {
  readonly id: string;
  readonly classKind: string;
  readonly parentIds: readonly string[];
  readonly exampleSpeciesIds: readonly string[];
  readonly formulaText: string;
  readonly generalFormula: string;
  readonly smarts: string;
}

const ids = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);

export function classViewOf(draft: unknown): ClassView {
  const fields = (typeof draft === 'object' && draft !== null ? draft : {}) as Fields;
  return {
    id: typeof fields.id === 'string' ? fields.id : '',
    classKind: typeof fields.classKind === 'string' ? fields.classKind : '',
    parentIds: ids(fields.parentIds),
    exampleSpeciesIds: ids(fields.exampleSpeciesIds),
    formulaText: genericText(draft, 'formulaText'),
    generalFormula: genericText(draft, 'generalFormula'),
    smarts: genericText(draft, 'smarts'),
  };
}

/** The labels of the fields the class editor owns, by path (the conflict table shows them instead of raw paths). */
export const CLASS_FIELD_LABELS: Readonly<Record<string, string>> = {
  classKind: 'Kind of class',
  parentIds: 'Parent classes',
  generic: 'Generic representation',
  'generic.formulaText': 'Generic formula',
  'generic.generalFormula': 'General formula',
  'generic.structure': 'Generic structure',
  'generic.smarts': 'Membership SMARTS',
  'generic.rGroupNote': 'R-group note',
  exampleSpeciesIds: 'Examples',
  'review.lifecycle': 'Lifecycle',
  'review.status': 'Review status',
  'review.reasons': 'Review reasons',
  'review.confidence': 'Review confidence',
  description: 'Description',
  studyNotes: 'Study notes',
  notes: 'Notes',
  tags: 'Tags',
  citations: 'Citations',
};
