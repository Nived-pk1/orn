/**
 * The relationship editor's recipes over the draft, and its words (step 6.6b part 4, decision N5). The type has no default ("" removes
 * it; L1 refuses Save until one is chosen); the ends are record references; Swap exchanges them; the reverse kind is a choice that only
 * "reverse of" has. Text is stored exactly as typed (INV-24); a schema problem is a finding, not a fix. The type words and the allowed
 * kinds come from the schema's own table (`RELATIONSHIP_TYPE_SPECS`), so the editor offers nothing the schema refuses. No chemistry.
 */
import type { DraftRecipe } from '@/core/editing';
import { RELATIONSHIP_TYPES, RELATIONSHIP_TYPE_SPECS, type REVERSE_KINDS, type RecordRef, type RelationshipType } from '@/core/schema';
import type { PickKind } from './record-picker-contracts';

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** "Prerequisite of": the schema's label with a capital. */
export const TYPE_WORDS: Readonly<Record<RelationshipType, string>> = Object.fromEntries(RELATIONSHIP_TYPES.map((type) => [type, capital(RELATIONSHIP_TYPE_SPECS[type].label)])) as Record<RelationshipType, string>;

/** The schema's own words for the three reverse kinds (the comment on `REVERSE_KINDS`). */
export const REVERSE_KIND_WORDS: Readonly<Record<(typeof REVERSE_KINDS)[number], string>> = {
  microscopic: 'Microscopic (the exact reverse)',
  synthetic: 'Synthetic (a different reaction achieving the reverse change)',
  conceptual: 'Conceptual (taught as opposites)',
};

const PICKABLE: ReadonlySet<string> = new Set<string>(['species', 'class', 'reagent', 'reaction', 'mechanism', 'concept', 'named_reaction', 'transformation', 'caveat']);

/** The kinds a picker can offer for an end of this type: the type's endpoint kinds the pickers can search (routes have no picker yet). */
export function allowedKinds(type: string): readonly PickKind[] {
  if (!Object.hasOwn(RELATIONSHIP_TYPE_SPECS, type)) return [];
  return RELATIONSHIP_TYPE_SPECS[type as RelationshipType].endpointKinds.filter((kind) => PICKABLE.has(kind)) as readonly PickKind[];
}

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const refOf = (value: unknown): RecordRef | undefined => (isBag(value) && typeof value.kind === 'string' && typeof value.id === 'string' ? ({ kind: value.kind, id: value.id } as RecordRef) : undefined);

export const setRelationshipType = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'type');
  else draft.type = value;
};
export const setEnd = (end: 'from' | 'to', ref: { readonly kind: string; readonly id: string } | undefined): DraftRecipe => (draft) => {
  if (ref === undefined) Reflect.deleteProperty(draft, end);
  else draft[end] = { kind: ref.kind, id: ref.id };
};
export const swapEnds = (): DraftRecipe => (draft) => {
  if (draft.from === undefined || draft.to === undefined) return;
  const from = draft.from;
  draft.from = draft.to;
  draft.to = from;
};
export const setReverseKind = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'reverseKind');
  else draft.reverseKind = value;
};

export interface RelationshipView {
  readonly type: string;
  readonly from: RecordRef | undefined;
  readonly to: RecordRef | undefined;
  readonly reverseKind: string;
  readonly note: string;
}

export function relationshipViewOf(draft: unknown): RelationshipView {
  const fields = isBag(draft) ? draft : {};
  return { type: text(fields.type), from: refOf(fields.from), to: refOf(fields.to), reverseKind: text(fields.reverseKind), note: text(fields.note) };
}

/** The labels of the fields the relationship editor owns, by path. */
export const RELATIONSHIP_FIELD_LABELS: Readonly<Record<string, string>> = {
  type: 'Type of relationship',
  from: 'From',
  to: 'To',
  reverseKind: 'Reverse kind',
  note: 'Note',
  tags: 'Tags',
  citations: 'Citations',
  'review.lifecycle': 'Lifecycle',
  'review.status': 'Review status',
  'review.reasons': 'Review reasons',
  'review.confidence': 'Review confidence',
};
