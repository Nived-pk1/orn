/**
 * The Names editor's edits as recipes over the draft (ADR-040). The editor's explicit mapping, documented here and nowhere else:
 *  - text is stored exactly as typed: it is never trimmed, folded or rewritten (INV-24); a schema problem is a finding, not a fix;
 *  - an EMPTY optional input (display, iupac, qualifier) means the field is ABSENT: the key is removed from the draft;
 *  - the required canonical name and the list items are stored as typed, an empty one included (the schema's finding says it is empty).
 * Generic over the schema: it touches only the `names` object of the draft, whatever the kind.
 */
import type { DraftRecipe } from '@/core/editing';

export const OPTIONAL_NAME_FIELDS = ['display', 'iupac', 'qualifier'] as const;
export type OptionalNameField = (typeof OPTIONAL_NAME_FIELDS)[number];
export const NAME_LISTS = ['common', 'aliases'] as const;
export type NameList = (typeof NAME_LISTS)[number];

type NamesDraft = { canonical?: unknown; common?: string[]; aliases?: string[] } & Record<string, unknown>;

const namesOf = (draft: Record<string, unknown>): NamesDraft => {
  if (typeof draft.names !== 'object' || draft.names === null || Array.isArray(draft.names)) draft.names = {};
  return draft.names as NamesDraft;
};
const listOf = (names: NamesDraft, list: NameList): string[] => {
  const current = names[list];
  if (!Array.isArray(current)) names[list] = [];
  return names[list] as string[];
};

export const setCanonical = (value: string): DraftRecipe => (draft) => {
  namesOf(draft).canonical = value;
};

export const setOptional = (field: OptionalNameField, value: string): DraftRecipe => (draft) => {
  const names = namesOf(draft);
  if (value === '') Reflect.deleteProperty(names, field);
  else names[field] = value;
};

export const setListItem = (list: NameList, index: number, value: string): DraftRecipe => (draft) => {
  const items = listOf(namesOf(draft), list);
  if (index >= 0 && index < items.length) items[index] = value;
};

export const addListItem = (list: NameList): DraftRecipe => (draft) => {
  listOf(namesOf(draft), list).push('');
};

export const removeListItem = (list: NameList, index: number): DraftRecipe => (draft) => {
  const items = listOf(namesOf(draft), list);
  if (index >= 0 && index < items.length) items.splice(index, 1);
};

/** Moves an item one place up (-1) or down (+1); at an end it does nothing. */
export const moveListItem = (list: NameList, index: number, by: -1 | 1): DraftRecipe => (draft) => {
  const items = listOf(namesOf(draft), list);
  const to = index + by;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return;
  const moved = items.splice(index, 1)[0] as string;
  items.splice(to, 0, moved);
};

/** The draft's names as plain values for the form (what is absent reads as empty text / an empty list). */
export interface NamesView {
  readonly canonical: string;
  readonly display: string;
  readonly iupac: string;
  readonly qualifier: string;
  readonly common: readonly string[];
  readonly aliases: readonly string[];
}

export function namesViewOf(draft: unknown): NamesView {
  const names = (typeof draft === 'object' && draft !== null ? (draft as { names?: unknown }).names : undefined) as Record<string, unknown> | undefined;
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  const list = (value: unknown): readonly string[] => (Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item : '')) : []);
  return {
    canonical: text(names?.canonical),
    display: text(names?.display),
    iupac: text(names?.iupac),
    qualifier: text(names?.qualifier),
    common: list(names?.common),
    aliases: list(names?.aliases),
  };
}
