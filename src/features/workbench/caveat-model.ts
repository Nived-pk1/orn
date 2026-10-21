/**
 * The caveat editor's recipes over the draft, and its words (step 6.6b part 5, decision N6). Same rules as the other models: text is stored
 * exactly as typed (INV-24); an EMPTY optional text means the field is ABSENT; a schema problem is a finding, not a fix. The kind of
 * caveat has no default ("" removes it; L1 refuses Save), and a target's role has none either (a target is added without one). The kinds,
 * roles and importance come from the schema's own lists, so the editor offers nothing the schema refuses. CAV-001 and CAV-002 are the
 * store's rules, shown live by the host: no role table is copied here. No chemistry.
 */
import type { DraftRecipe } from '@/core/editing';
import { CAVEAT_KINDS, CAVEAT_TARGET_KINDS, CAVEAT_TARGET_ROLES, type RecordRef } from '@/core/schema';
import { wordsOfKind } from './knowledge-model';
import type { PickKind } from './record-picker-contracts';

export const CAVEAT_KIND_WORDS: Readonly<Record<(typeof CAVEAT_KINDS)[number], string>> = Object.fromEntries(CAVEAT_KINDS.map((kind) => [kind, wordsOfKind(kind)])) as Record<(typeof CAVEAT_KINDS)[number], string>;
export const TARGET_ROLE_WORDS: Readonly<Record<(typeof CAVEAT_TARGET_ROLES)[number], string>> = Object.fromEntries(CAVEAT_TARGET_ROLES.map((role) => [role, wordsOfKind(role)])) as Record<(typeof CAVEAT_TARGET_ROLES)[number], string>;
export const IMPORTANCE_LEVELS = ['low', 'medium', 'high'] as const;

const PICKABLE: ReadonlySet<string> = new Set<string>(['species', 'class', 'reagent', 'reaction', 'mechanism', 'concept', 'named_reaction', 'transformation']);
/** The kinds a target can be (the schema's list) that the pickers can search. */
export const TARGET_PICK_KINDS = CAVEAT_TARGET_KINDS.filter((kind) => PICKABLE.has(kind)) as readonly PickKind[];

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const targetsOf = (draft: Fields): unknown[] => {
  if (!Array.isArray(draft.targets)) draft.targets = [];
  return draft.targets as unknown[];
};

export const setCaveatKind = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'caveatKind');
  else draft.caveatKind = value;
};
/** The title is required: it is stored as typed, empty included (L1 says it is required). */
export const setTitle = (value: string): DraftRecipe => (draft) => {
  draft.title = value;
};
/** `''` is "Not set" (absent). */
export const setImportance = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'importance');
  else draft.importance = value;
};
/** A target is added WITHOUT a role: "Choose a role" is the person's choice. */
export const addTarget = (ref: { readonly kind: string; readonly id: string }): DraftRecipe => (draft) => {
  const targets = targetsOf(draft);
  const has = targets.some((t) => isBag(t) && isBag(t.ref) && t.ref.kind === ref.kind && t.ref.id === ref.id);
  if (!has) targets.push({ ref: { kind: ref.kind, id: ref.id } });
};
export const setTargetRole = (index: number, role: string): DraftRecipe => (draft) => {
  const target = targetsOf(draft)[index];
  if (!isBag(target)) return;
  if (role === '') Reflect.deleteProperty(target, 'as');
  else target.as = role;
};
export const removeTarget = (index: number): DraftRecipe => (draft) => {
  const targets = targetsOf(draft);
  if (index >= 0 && index < targets.length) targets.splice(index, 1);
};
/** Takes the whole trigger-conditions block out (the schema's field is optional). */
export const removeTriggerConditions = (): DraftRecipe => (draft) => {
  Reflect.deleteProperty(draft, 'triggerConditions');
};

export interface CaveatView {
  readonly caveatKind: string;
  readonly title: string;
  readonly importance: string;
  readonly targets: readonly { readonly ref: RecordRef; readonly role: string }[];
  readonly hasTrigger: boolean;
}

export function caveatViewOf(draft: unknown): CaveatView {
  const fields = isBag(draft) ? draft : {};
  const targets = Array.isArray(fields.targets) ? fields.targets : [];
  return {
    caveatKind: text(fields.caveatKind),
    title: text(fields.title),
    importance: text(fields.importance),
    targets: targets.flatMap((t) => (isBag(t) && isBag(t.ref) && typeof t.ref.kind === 'string' && typeof t.ref.id === 'string' ? [{ ref: { kind: t.ref.kind, id: t.ref.id } as RecordRef, role: text(t.as) }] : [])),
    hasTrigger: isBag(fields.triggerConditions),
  };
}

/** The labels of the fields the caveat editor owns, by path (the conflict table shows them instead of raw paths). */
export const CAVEAT_FIELD_LABELS: Readonly<Record<string, string>> = {
  caveatKind: 'Kind of caveat',
  title: 'Title',
  rule: 'Rule',
  statement: 'Statement',
  trigger: 'Trigger',
  triggerConditions: 'Trigger conditions',
  explanation: 'Explanation',
  targets: 'Targets',
  conceptIds: 'Concepts',
  importance: 'Importance',
  notes: 'Notes',
  tags: 'Tags',
  citations: 'Citations',
  'review.lifecycle': 'Lifecycle',
  'review.status': 'Review status',
  'review.reasons': 'Review reasons',
  'review.confidence': 'Review confidence',
};
