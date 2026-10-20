/**
 * The rows of a mechanism step as recipes over the draft (step 6.5a decision D4): species, bonds formed and broken, electron movements.
 * `v` is the variant's index, `s` the step's. Text is stored as typed; an empty optional value is ABSENT. A NEW species row has no role (the
 * schema has none by default: L1 refuses Save until one is chosen, MEC-002 until the row names something); a NEW bond change or movement has
 * nothing chosen. Atom maps are never typed here: a pair or a site is a CHOICE from the maps the chem worker found in the step, and is
 * written exactly as the schema shapes it. The codecs turn a site or a pair into the value of a choice list and back. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';
import { isBag, listOf, setOrDelete, stepAt, type Fields } from './step-model';

export type BondField = 'bondsFormed' | 'bondsBroken';
export type SiteEnd = 'from' | 'to';
export type SiteKind = 'atom' | 'lone_pair' | 'radical' | 'bond';
export type Site = { readonly kind: 'atom' | 'lone_pair' | 'radical'; readonly atom: number } | { readonly kind: 'bond'; readonly atoms: readonly [number, number] };
export type Pair = readonly [number, number];
export type SubstanceRefValue = { readonly kind: 'species' | 'class' | 'reagent'; readonly id: string };

const rowsOf = (draft: Fields, v: number, s: number, field: string): unknown[] => {
  const step = stepAt(draft, v, s);
  return step === undefined ? [] : listOf(step, field);
};
const rowAt = (draft: Fields, v: number, s: number, field: string, i: number): Fields | undefined => {
  const item = rowsOf(draft, v, s, field)[i];
  return isBag(item) ? item : undefined;
};
const removeAt = (v: number, s: number, field: string, i: number): DraftRecipe => (draft) => {
  const rows = rowsOf(draft, v, s, field);
  if (i >= 0 && i < rows.length) rows.splice(i, 1);
};

// ---- species ----------------------------------------------------------------------------------------------------------------
export const addSpecies = (v: number, s: number): DraftRecipe => (draft) => {
  rowsOf(draft, v, s, 'species').push({});
};
export const removeSpecies = (v: number, s: number, k: number): DraftRecipe => removeAt(v, s, 'species', k);
export const moveSpecies = (v: number, s: number, k: number, by: -1 | 1): DraftRecipe => (draft) => {
  const rows = rowsOf(draft, v, s, 'species');
  const to = k + by;
  if (k < 0 || k >= rows.length || to < 0 || to >= rows.length) return;
  const moved = rows[k];
  rows[k] = rows[to];
  rows[to] = moved;
};
export const setSpeciesRole = (v: number, s: number, k: number, role: string): DraftRecipe => (draft) => {
  const row = rowAt(draft, v, s, 'species', k);
  if (row !== undefined) setOrDelete(row, 'role', role);
};
export const setSpeciesRef = (v: number, s: number, k: number, ref: SubstanceRefValue | undefined): DraftRecipe => (draft) => {
  const row = rowAt(draft, v, s, 'species', k);
  if (row !== undefined) setOrDelete(row, 'ref', ref === undefined ? undefined : { kind: ref.kind, id: ref.id });
};
export const setSpeciesLabel = (v: number, s: number, k: number, label: string): DraftRecipe => (draft) => {
  const row = rowAt(draft, v, s, 'species', k);
  if (row !== undefined) setOrDelete(row, 'label', label);
};
/** Applies `recipe` to the species ROW itself, so the structure panel can edit a row's `structure` as it edits a record's. */
export const onSpeciesRow = (v: number, s: number, k: number, recipe: (row: Fields) => void): DraftRecipe => (draft) => {
  const row = rowAt(draft, v, s, 'species', k);
  if (row !== undefined) recipe(row);
};

// ---- bond changes -----------------------------------------------------------------------------------------------------------
export const addBond = (v: number, s: number, field: BondField): DraftRecipe => (draft) => {
  rowsOf(draft, v, s, field).push({});
};
export const removeBond = (v: number, s: number, field: BondField, i: number): DraftRecipe => removeAt(v, s, field, i);
export const setBondPair = (v: number, s: number, field: BondField, i: number, pair: Pair | undefined): DraftRecipe => (draft) => {
  const row = rowAt(draft, v, s, field, i);
  if (row !== undefined) setOrDelete(row, 'atoms', pair === undefined ? undefined : [pair[0], pair[1]]);
};
export const setBondOrder = (v: number, s: number, field: BondField, i: number, order: 1 | 2 | 3 | undefined): DraftRecipe => (draft) => {
  const row = rowAt(draft, v, s, field, i);
  if (row !== undefined) setOrDelete(row, 'order', order);
};

// ---- electron movements -----------------------------------------------------------------------------------------------------
export const addMovement = (v: number, s: number): DraftRecipe => (draft) => {
  rowsOf(draft, v, s, 'electronMovements').push({});
};
export const removeMovement = (v: number, s: number, i: number): DraftRecipe => removeAt(v, s, 'electronMovements', i);
export const setMovementSite = (v: number, s: number, i: number, end: SiteEnd, site: Site | undefined): DraftRecipe => (draft) => {
  const row = rowAt(draft, v, s, 'electronMovements', i);
  if (row === undefined) return;
  setOrDelete(row, end, site === undefined ? undefined : site.kind === 'bond' ? { kind: 'bond', atoms: [site.atoms[0], site.atoms[1]] } : { kind: site.kind, atom: site.atom });
};
export const setMovementElectrons = (v: number, s: number, i: number, electrons: 1 | 2 | undefined): DraftRecipe => (draft) => {
  const row = rowAt(draft, v, s, 'electronMovements', i);
  if (row !== undefined) setOrDelete(row, 'electrons', electrons);
};

// ---- choice values ----------------------------------------------------------------------------------------------------------
export const pairValue = (pair: Pair): string => `${pair[0]}-${pair[1]}`;
export function pairOfValue(value: string): Pair | undefined {
  const found = /^(\d{1,3})-(\d{1,3})$/.exec(value);
  return found === null ? undefined : [Number(found[1]), Number(found[2])];
}
export const siteValue = (site: Site): string => (site.kind === 'bond' ? `bond:${pairValue(site.atoms)}` : `${site.kind}:${site.atom}`);
export function siteOfValue(value: string): Site | undefined {
  const found = /^(atom|lone_pair|radical|bond):(.+)$/.exec(value);
  if (found === null) return undefined;
  const kind = found[1] as SiteKind;
  if (kind === 'bond') {
    const pair = pairOfValue(found[2] as string);
    return pair === undefined ? undefined : { kind, atoms: pair };
  }
  return /^\d{1,3}$/.test(found[2] as string) ? { kind, atom: Number(found[2]) } : undefined;
}
/** A site read from the draft (any shape): undefined when it is not one of the schema's four. */
export function siteOfDraft(value: unknown): Site | undefined {
  if (!isBag(value)) return undefined;
  if (value.kind === 'bond' && Array.isArray(value.atoms) && value.atoms.length === 2 && value.atoms.every((a) => typeof a === 'number')) return { kind: 'bond', atoms: [value.atoms[0] as number, value.atoms[1] as number] };
  if ((value.kind === 'atom' || value.kind === 'lone_pair' || value.kind === 'radical') && typeof value.atom === 'number') return { kind: value.kind, atom: value.atom };
  return undefined;
}
