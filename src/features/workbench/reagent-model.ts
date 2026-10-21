/**
 * The reagent editor's edits as recipes over the draft, and its words (step 6.2b decision D3). Same rules as the other models: text is
 * stored exactly as typed (INV-24); an EMPTY optional input means the field is ABSENT; a schema problem is a finding, not a fix. The
 * families and roles come from the schema's own lists, so the editor can offer nothing the schema refuses. A reagent is ONE backing species
 * OR components (the schema allows both, RGT-001 warns): the editor never creates both. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';
import type { COMPONENT_ROLES, REAGENT_FAMILIES } from '@/core/schema';
import type { PickKind } from './record-picker-contracts';

export type ReagentFamilyValue = (typeof REAGENT_FAMILIES)[number];
export type ComponentRole = (typeof COMPONENT_ROLES)[number];

/** "lewis_acid" -> "Lewis acid": the schema value in words. */
export const wordsOf = (value: string): string => {
  const spaced = value.replace(/_/g, ' ');
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
};

type Fields = Record<string, unknown>;
const listOf = (draft: Fields, field: string): unknown[] => {
  if (!Array.isArray(draft[field])) draft[field] = [];
  return draft[field] as unknown[];
};
const objectAt = (list: unknown[], index: number): Fields | undefined => {
  const item = list[index];
  return typeof item === 'object' && item !== null ? (item as Fields) : undefined;
};

export const setSpecies = (id: string): DraftRecipe => (draft) => {
  draft.speciesId = id;
};
export const clearSpecies = (): DraftRecipe => (draft) => {
  Reflect.deleteProperty(draft, 'speciesId');
};
export const setReagentFormula = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'formulaText');
  else draft.formulaText = value;
};

/** A new component starts with the role "active" (the schema has no empty role; the person changes it in the row). */
export const addComponent = (ref: { readonly kind: PickKind; readonly id: string }): DraftRecipe => (draft) => {
  const items = listOf(draft, 'components');
  if (items.some((item) => (item as { ref?: { kind?: unknown; id?: unknown } }).ref?.kind === ref.kind && (item as { ref?: { id?: unknown } }).ref?.id === ref.id)) return;
  items.push({ ref: { kind: ref.kind, id: ref.id }, role: 'active' });
};
export const removeComponent = (index: number): DraftRecipe => (draft) => {
  const items = listOf(draft, 'components');
  if (index >= 0 && index < items.length) items.splice(index, 1);
};
export const moveComponent = (index: number, by: -1 | 1): DraftRecipe => (draft) => moveIn(listOf(draft, 'components'), index, by);
export const setComponentRole = (index: number, role: string): DraftRecipe => (draft) => {
  const item = objectAt(listOf(draft, 'components'), index);
  if (item !== undefined) item.role = role;
};
export const setComponentAmount = (index: number, value: string): DraftRecipe => (draft) => {
  const item = objectAt(listOf(draft, 'components'), index);
  if (item === undefined) return;
  if (value === '') Reflect.deleteProperty(item, 'amountText');
  else item.amountText = value;
};

export const toggleFamily = (family: string, on: boolean): DraftRecipe => (draft) => {
  const items = listOf(draft, 'families');
  const at = items.indexOf(family);
  if (on && at < 0) items.push(family);
  if (!on && at >= 0) items.splice(at, 1);
};

function moveIn(items: unknown[], index: number, by: -1 | 1): void {
  const to = index + by;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return;
  const moved = items[index];
  items[index] = items[to];
  items[to] = moved;
}

/** A new profile: the ID is given (the editor port makes it), the label is empty (L1 refuses Save until one is typed), and no conditions yet. */
export const addProfile = (id: string): DraftRecipe => (draft) => {
  listOf(draft, 'profiles').push({ id, label: '', aliases: [], parameters: { solventCharacter: [], activation: [], other: [], parsedFields: [] } });
};
export const removeProfile = (index: number): DraftRecipe => (draft) => {
  const items = listOf(draft, 'profiles');
  if (index >= 0 && index < items.length) items.splice(index, 1);
};
export const moveProfile = (index: number, by: -1 | 1): DraftRecipe => (draft) => moveIn(listOf(draft, 'profiles'), index, by);
export const setProfileLabel = (index: number, value: string): DraftRecipe => (draft) => {
  const item = objectAt(listOf(draft, 'profiles'), index);
  if (item !== undefined) item.label = value;
};
/** The behaviour is rich text with no default: absent when empty, stored exactly as typed otherwise. */
export const setProfileBehaviour = (index: number, value: string): DraftRecipe => (draft) => {
  const item = objectAt(listOf(draft, 'profiles'), index);
  if (item === undefined) return;
  if (value === '') Reflect.deleteProperty(item, 'behaviour');
  else item.behaviour = value;
};
const aliasesOf = (profile: Fields): string[] => {
  if (!Array.isArray(profile.aliases)) profile.aliases = [];
  return profile.aliases as string[];
};
export const addProfileAlias = (index: number): DraftRecipe => (draft) => {
  const item = objectAt(listOf(draft, 'profiles'), index);
  if (item !== undefined) aliasesOf(item).push('');
};
export const setProfileAlias = (index: number, alias: number, value: string): DraftRecipe => (draft) => {
  const item = objectAt(listOf(draft, 'profiles'), index);
  if (item === undefined) return;
  const aliases = aliasesOf(item);
  if (alias >= 0 && alias < aliases.length) aliases[alias] = value;
};
export const removeProfileAlias = (index: number, alias: number): DraftRecipe => (draft) => {
  const item = objectAt(listOf(draft, 'profiles'), index);
  if (item === undefined) return;
  const aliases = aliasesOf(item);
  if (alias >= 0 && alias < aliases.length) aliases.splice(alias, 1);
};

export interface ComponentView {
  readonly kind: PickKind;
  readonly id: string;
  readonly role: string;
  readonly amountText: string;
}
export interface ProfileView {
  readonly id: string;
  readonly label: string;
  readonly aliases: readonly string[];
  /** The profile's free-text restatement of its conditions (`parameters.text`). */
  readonly conditionsText: string;
  readonly behaviour: string;
}
export interface ReagentView {
  readonly id: string;
  readonly speciesId: string | undefined;
  readonly components: readonly ComponentView[];
  readonly formulaText: string;
  readonly families: readonly string[];
  readonly classIds: readonly string[];
  readonly profiles: readonly ProfileView[];
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const strings = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
const isPick = (kind: unknown): kind is PickKind => kind === 'species' || kind === 'class' || kind === 'reagent';

export function reagentViewOf(draft: unknown): ReagentView {
  const fields = (typeof draft === 'object' && draft !== null ? draft : {}) as Fields;
  const components = (Array.isArray(fields.components) ? fields.components : []).flatMap((item): ComponentView[] => {
    const row = (typeof item === 'object' && item !== null ? item : {}) as { ref?: { kind?: unknown; id?: unknown }; role?: unknown; amountText?: unknown };
    return isPick(row.ref?.kind) && typeof row.ref?.id === 'string' ? [{ kind: row.ref.kind, id: row.ref.id, role: text(row.role), amountText: text(row.amountText) }] : [];
  });
  const profiles = (Array.isArray(fields.profiles) ? fields.profiles : []).map((item): ProfileView => {
    const row = (typeof item === 'object' && item !== null ? item : {}) as { id?: unknown; label?: unknown; aliases?: unknown; parameters?: { text?: unknown }; behaviour?: unknown };
    return { id: text(row.id), label: text(row.label), aliases: strings(row.aliases), conditionsText: text(row.parameters?.text), behaviour: text(row.behaviour) };
  });
  return {
    id: text(fields.id),
    speciesId: typeof fields.speciesId === 'string' ? fields.speciesId : undefined,
    components,
    formulaText: text(fields.formulaText),
    families: strings(fields.families),
    classIds: strings(fields.classIds),
    profiles,
  };
}

/** The labels of the fields the reagent editor owns, by path (the conflict table shows them instead of raw paths). */
export const REAGENT_FIELD_LABELS: Readonly<Record<string, string>> = {
  speciesId: 'Backing species',
  components: 'Components',
  formulaText: 'Display formula',
  families: 'Families',
  classIds: 'Classes',
  profiles: 'Profiles',
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
