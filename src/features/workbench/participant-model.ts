/**
 * The reaction editor's participants as recipes over the draft, and the view the rows read (step 6.3a decision D2). Same rules as the other
 * models: text is stored exactly as typed (INV-24); an EMPTY optional input means the field is ABSENT; a schema problem is a finding, not
 * a fix. A participant has NO stage field: its stage is the stage whose `participantIds` lists it, so "set the stage" moves the ID between
 * two lists (RXN-007: with stages present each participant is in exactly one). Reordering is an exact permutation, like the reorder builder.
 * The roles, phases, strengths and qualifiers come from the schema's own lists. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';
import { slotClassOf } from './slot-model';
import type { PARTICIPANT_ROLES, PHASES, QUANTITY_QUALIFIERS, STRENGTHS } from '@/core/schema';

export type ParticipantRoleValue = (typeof PARTICIPANT_ROLES)[number];
export type PhaseValue = (typeof PHASES)[number];
export type StrengthValue = (typeof STRENGTHS)[number];
export type QualifierValue = (typeof QUANTITY_QUALIFIERS)[number];
export type FlagName = 'contributesAtoms' | 'consumed' | 'catalytic';
export type FlagChoice = 'default' | 'yes' | 'no';
export type SubstanceKind = 'species' | 'class' | 'reagent';

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const listOf = (draft: Fields, field: string): unknown[] => {
  if (!Array.isArray(draft[field])) draft[field] = [];
  return draft[field] as unknown[];
};
const participantAt = (draft: Fields, index: number): Fields | undefined => {
  const item = listOf(draft, 'participants')[index];
  return isBag(item) ? item : undefined;
};
const stageLists = (draft: Fields): unknown[][] =>
  listOf(draft, 'stages').flatMap((stage) => (isBag(stage) ? [listOf(stage, 'participantIds')] : []));

function setOrDelete(target: Fields, key: string, value: unknown): void {
  if (value === undefined || value === '') Reflect.deleteProperty(target, key);
  else target[key] = value;
}

/** A new participant: the ID is given (the editor port makes it); the role is the one the person chose beside the picker. */
export const addParticipant = (id: string, ref: { readonly kind: SubstanceKind; readonly id: string }, role: ParticipantRoleValue): DraftRecipe => (draft) => {
  listOf(draft, 'participants').push({ id, ref: { kind: ref.kind, id: ref.id }, role });
  const stages = stageLists(draft);
  stages[0]?.push(id); // with stages present every participant is in exactly one: the first, said in words by the form
};

/** The condition variant (its label) that lists this participant, or undefined. Variants are read-only in 6.3a, so a participant they name cannot go. */
export function variantUsing(draft: unknown, participantId: string): string | undefined {
  const variants = isBag(draft) && Array.isArray(draft.conditionVariants) ? draft.conditionVariants : [];
  for (const variant of variants) {
    if (isBag(variant) && Array.isArray(variant.participantIds) && variant.participantIds.includes(participantId)) return typeof variant.label === 'string' ? variant.label : '';
  }
  return undefined;
}

export const removeParticipant = (index: number): DraftRecipe => (draft) => {
  const items = listOf(draft, 'participants');
  const gone = items[index];
  if (!isBag(gone) || typeof gone.id !== 'string') return;
  if (variantUsing(draft, gone.id) !== undefined) return; // refused in words by the form; never detached silently
  items.splice(index, 1);
  for (const list of stageLists(draft)) {
    for (let at = list.length - 1; at >= 0; at -= 1) if (list[at] === gone.id) list.splice(at, 1);
  }
};

/** Swaps the participant with its neighbour: the array stays a permutation of the same participants (no stage list changes). */
export const moveParticipant = (index: number, by: -1 | 1): DraftRecipe => (draft) => {
  const items = listOf(draft, 'participants');
  const to = index + by;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return;
  const moved = items[index];
  items[index] = items[to];
  items[to] = moved;
};

export const setParticipantRef = (index: number, ref: { readonly kind: SubstanceKind; readonly id: string }): DraftRecipe => (draft) => {
  const item = participantAt(draft, index);
  if (item === undefined) return;
  const same = isBag(item.ref) && item.ref.kind === ref.kind && item.ref.id === ref.id;
  item.ref = { kind: ref.kind, id: ref.id };
  if (!same || ref.kind !== 'reagent') Reflect.deleteProperty(item, 'profileId'); // a profile belongs to ONE reagent
};

export const setRole = (index: number, role: string): DraftRecipe => (draft) => {
  const item = participantAt(draft, index);
  if (item !== undefined) item.role = role;
};
/** `undefined` (an empty input) removes the field. */
export const setCoefficient = (index: number, value: number | undefined): DraftRecipe => (draft) => {
  const item = participantAt(draft, index);
  if (item !== undefined) setOrDelete(item, 'coefficient', value);
};
export const setPhase = (index: number, value: string): DraftRecipe => (draft) => {
  const item = participantAt(draft, index);
  if (item !== undefined) setOrDelete(item, 'phase', value);
};
export const setStrength = (index: number, value: string): DraftRecipe => (draft) => {
  const item = participantAt(draft, index);
  if (item !== undefined) setOrDelete(item, 'strength', value);
};
export const setDry = (index: number, on: boolean): DraftRecipe => (draft) => {
  const item = participantAt(draft, index);
  if (item !== undefined) setOrDelete(item, 'dry', on ? true : undefined);
};
export const setPrimary = (index: number, on: boolean): DraftRecipe => (draft) => {
  const item = participantAt(draft, index);
  if (item !== undefined) setOrDelete(item, 'isPrimarySubstrate', on ? true : undefined);
};
/** The participant's source wording (one line) or its note (mini-markup); empty = absent. */
export const setParticipantText = (index: number, field: 'originalText' | 'note', value: string): DraftRecipe => (draft) => {
  const item = participantAt(draft, index);
  if (item !== undefined) setOrDelete(item, field, value);
};
export const setProfile = (index: number, profileId: string): DraftRecipe => (draft) => {
  const item = participantAt(draft, index);
  if (item !== undefined) setOrDelete(item, 'profileId', profileId);
};

/** One part of `quantity`; the object goes when nothing is left in it. */
export const setQuantityPart = (index: number, part: 'equivalents' | 'qualifier' | 'text', value: number | string | undefined): DraftRecipe => (draft) => {
  const item = participantAt(draft, index);
  if (item === undefined) return;
  const quantity = isBag(item.quantity) ? item.quantity : {};
  setOrDelete(quantity, part, value);
  if (Object.keys(quantity).length === 0) Reflect.deleteProperty(item, 'quantity');
  else item.quantity = quantity;
};

/** 'default' removes the override; the object goes when no override is left. */
export const setFlag = (index: number, flag: FlagName, choice: FlagChoice): DraftRecipe => (draft) => {
  const item = participantAt(draft, index);
  if (item === undefined) return;
  const flags = isBag(item.flags) ? item.flags : {};
  setOrDelete(flags, flag, choice === 'default' ? undefined : choice === 'yes');
  if (Object.keys(flags).length === 0) Reflect.deleteProperty(item, 'flags');
  else item.flags = flags;
};

/** Moves the participant's ID from every stage list into stage `stageIndex` (exactly one: RXN-007). */
export const setParticipantStage = (participantId: string, stageIndex: number): DraftRecipe => (draft) => {
  const lists = stageLists(draft);
  if (stageIndex < 0 || stageIndex >= lists.length) return;
  for (const list of lists) {
    for (let at = list.length - 1; at >= 0; at -= 1) if (list[at] === participantId) list.splice(at, 1);
  }
  lists[stageIndex]?.push(participantId);
};

export interface ParticipantView {
  readonly id: string;
  readonly substance: { readonly kind: SubstanceKind; readonly id: string } | undefined;
  readonly role: string;
  readonly coefficient: number | undefined;
  readonly phase: string;
  readonly strength: string;
  readonly dry: boolean;
  readonly equivalents: number | undefined;
  readonly qualifier: string;
  readonly quantityText: string;
  readonly profileId: string;
  readonly flags: Readonly<Record<FlagName, FlagChoice>>;
  readonly primary: boolean;
  readonly originalText: string;
  readonly note: string;
  /** The class an empty slot stands for (step 6.7a), or undefined. */
  readonly slotClassId?: string | undefined;
  /** Index of the stage that lists it, or -1 (no stages, or listed by none). */
  readonly stageIndex: number;
}

export interface StageSummary {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);
const choiceOf = (flags: Fields, flag: FlagName): FlagChoice => (typeof flags[flag] === 'boolean' ? (flags[flag] ? 'yes' : 'no') : 'default');
const isSubstance = (kind: unknown): kind is SubstanceKind => kind === 'species' || kind === 'class' || kind === 'reagent';

export function participantsViewOf(draft: unknown): readonly ParticipantView[] {
  const fields = isBag(draft) ? draft : {};
  const stages = Array.isArray(fields.stages) ? fields.stages : [];
  return (Array.isArray(fields.participants) ? fields.participants : []).map((item): ParticipantView => {
    const row = isBag(item) ? item : {};
    const id = text(row.id);
    const ref = isBag(row.ref) ? row.ref : {};
    const quantity = isBag(row.quantity) ? row.quantity : {};
    const flags = isBag(row.flags) ? row.flags : {};
    return {
      id,
      substance: isSubstance(ref.kind) && typeof ref.id === 'string' ? { kind: ref.kind, id: ref.id } : undefined,
      role: text(row.role),
      coefficient: num(row.coefficient),
      phase: text(row.phase),
      strength: text(row.strength),
      dry: row.dry === true,
      equivalents: num(quantity.equivalents),
      qualifier: text(quantity.qualifier),
      quantityText: text(quantity.text),
      profileId: text(row.profileId),
      flags: { contributesAtoms: choiceOf(flags, 'contributesAtoms'), consumed: choiceOf(flags, 'consumed'), catalytic: choiceOf(flags, 'catalytic') },
      primary: row.isPrimarySubstrate === true,
      originalText: text(row.originalText),
      note: text(row.note),
      slotClassId: slotClassOf(row),
      stageIndex: stages.findIndex((stage) => isBag(stage) && Array.isArray(stage.participantIds) && stage.participantIds.includes(id)),
    };
  });
}

export function stageSummariesOf(draft: unknown): readonly StageSummary[] {
  const stages = isBag(draft) && Array.isArray(draft.stages) ? draft.stages : [];
  return stages.map((stage): StageSummary => {
    const row = isBag(stage) ? stage : {};
    return { id: text(row.id), kind: text(row.kind), label: text(row.label) };
  });
}
