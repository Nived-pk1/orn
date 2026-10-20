/**
 * What the editor host needs to know about each kind that has a full form (steps 6.2a and 6.2b): the history section word, the title, and
 * which finding paths belong to the form (the others are listed with "not on this form"). Data only; a kind without a full form edits its
 * names alone.
 */
import type { RecordKind } from '@/core/schema';
import { CLASS_FIELD_LABELS } from './class-model';
import { MECHANISM_FIELD_LABELS } from './mechanism-model';
import { REACTION_FIELD_LABELS } from './reaction-model';
import { REAGENT_FIELD_LABELS } from './reagent-model';
import { SPECIES_FIELD_LABELS } from './species-model';

const LABELS: Partial<Readonly<Record<RecordKind, Readonly<Record<string, string>>>>> = {
  species: SPECIES_FIELD_LABELS,
  class: CLASS_FIELD_LABELS,
  reagent: REAGENT_FIELD_LABELS,
  reaction: REACTION_FIELD_LABELS,
  mechanism: MECHANISM_FIELD_LABELS,
};

/** Kinds whose editor is a full form (Names and more). */
export const FULL_FORM_KINDS: readonly RecordKind[] = ['species', 'class', 'reagent', 'reaction', 'mechanism'];

export const hasFullForm = (kind: RecordKind): boolean => FULL_FORM_KINDS.includes(kind);

/** The word in the history label "Edit <section> of <name>". */
export const sectionOf = (kind: RecordKind): string => (hasFullForm(kind) ? kind : 'names');

export const labelOfField = (kind: RecordKind, path: string): string | undefined => LABELS[kind]?.[path];

const topOf = (path: string | undefined): string => (path ?? '').split(/[.[]/)[0] ?? '';

/** Whether a finding path is on this kind's form (names and the fields the kind's form owns). */
export function formOwns(kind: RecordKind, path: string | undefined): boolean {
  const labels = LABELS[kind];
  if (labels === undefined) return path === 'names' || (path ?? '').startsWith('names.');
  return topOf(path) === 'names' || Object.hasOwn(labels, topOf(path)) || Object.hasOwn(labels, path ?? '');
}

export function titleOf(kind: RecordKind, isNew: boolean, name: string): string {
  if (!hasFullForm(kind)) return `Edit names of ${name}`;
  return isNew ? `New ${kind}` : `Edit ${name}`;
}
