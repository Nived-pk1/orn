/**
 * The reaction editor's identity as recipes over the draft, and its words (step 6.3a decisions D1 and 2). A reaction has `name` and `aliases`
 * (NOT the shared `Names`), a required `scope` with no empty value (absent until chosen, like a class's kind: L1 refuses Save with the schema's
 * words), an optional `instanceOfId` and the `purposes` list. Same rules as the other models: text is stored exactly as typed (INV-24); a
 * schema problem is a finding, not a fix. The purposes come from the schema's own list. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';
import type { REACTION_PURPOSES } from '@/core/schema';

export type PurposeValue = (typeof REACTION_PURPOSES)[number];

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const aliasesOf = (draft: Fields): unknown[] => {
  if (!Array.isArray(draft.aliases)) draft.aliases = [];
  return draft.aliases as unknown[];
};

export const setName = (value: string): DraftRecipe => (draft) => {
  draft.name = value;
};
export const addAlias = (): DraftRecipe => (draft) => {
  aliasesOf(draft).push('');
};
export const setAlias = (index: number, value: string): DraftRecipe => (draft) => {
  const items = aliasesOf(draft);
  if (index >= 0 && index < items.length) items[index] = value;
};
export const removeAlias = (index: number): DraftRecipe => (draft) => {
  const items = aliasesOf(draft);
  if (index >= 0 && index < items.length) items.splice(index, 1);
};
export const moveAlias = (index: number, by: -1 | 1): DraftRecipe => (draft) => {
  const items = aliasesOf(draft);
  const to = index + by;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return;
  const moved = items[index];
  items[index] = items[to];
  items[to] = moved;
};

/** An empty choice ("Choose a scope") removes the field: the schema has no empty scope. */
export const setScope = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'scope');
  else draft.scope = value;
};
export const setInstanceOf = (id: string): DraftRecipe => (draft) => {
  draft.instanceOfId = id;
};
export const clearInstanceOf = (): DraftRecipe => (draft) => {
  Reflect.deleteProperty(draft, 'instanceOfId');
};
export const togglePurpose = (purpose: string, on: boolean): DraftRecipe => (draft) => {
  if (!Array.isArray(draft.purposes)) draft.purposes = [];
  const items = draft.purposes as unknown[];
  const at = items.indexOf(purpose);
  if (on && at < 0) items.push(purpose);
  if (!on && at >= 0) items.splice(at, 1);
};

export interface ReactionView {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly scope: 'generic' | 'specific' | undefined;
  readonly instanceOfId: string | undefined;
  readonly purposes: readonly string[];
  /** The legacy `reagentFamily` kept in `provenance.legacy.unmapped`, as text ("aq. KOH"); undefined when there is none. Shown read-only, never linked. */
  readonly legacyReagentFamily: string | undefined;
  readonly lifecycle: string;
  readonly status: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const strings = (value: unknown): readonly string[] => (Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item : '')) : []);

export function reactionViewOf(draft: unknown): ReactionView {
  const fields = isBag(draft) ? draft : {};
  const review = isBag(fields.review) ? fields.review : {};
  const unmapped = isBag(fields.provenance) && isBag(fields.provenance.legacy) && isBag(fields.provenance.legacy.unmapped) ? fields.provenance.legacy.unmapped : {};
  const family = unmapped.reagentFamily;
  return {
    id: text(fields.id),
    name: text(fields.name),
    aliases: strings(fields.aliases),
    scope: fields.scope === 'generic' || fields.scope === 'specific' ? fields.scope : undefined,
    instanceOfId: typeof fields.instanceOfId === 'string' ? fields.instanceOfId : undefined,
    purposes: strings(fields.purposes),
    legacyReagentFamily: typeof family === 'string' ? family : family === undefined || family === null ? undefined : JSON.stringify(family),
    lifecycle: text(review.lifecycle) || 'draft',
    status: text(review.status) || 'unreviewed',
  };
}

/** The labels of the fields the reaction editor owns or summarises, by path (the conflict table shows them instead of raw paths). */
export const REACTION_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'Name',
  aliases: 'Aliases',
  scope: 'Scope',
  instanceOfId: 'Instance of',
  purposes: 'Purposes',
  participants: 'Participants',
  stages: 'Stages',
  conditionVariants: 'Condition variants',
  outcomes: 'Outcomes',
  intermediates: 'Intermediates',
  reversibility: 'Reversibility',
  namedReactionIds: 'Named reactions',
  transformationIds: 'Transformations',
  reactionTypes: 'Reaction types',
  mechanismClasses: 'Mechanism classes',
  mechanismIds: 'Mechanisms',
  conceptIds: 'Concepts',
  prerequisiteConceptIds: 'Prerequisite concepts',
  selectivityNotes: 'Selectivity notes',
  generalizedEquation: 'Generalised equation',
  mappedReaction: 'Atom-mapped reaction',
  limitations: 'Limitations',
  difficulty: 'Difficulty',
  studyNotes: 'Study notes',
  notes: 'Notes',
  tags: 'Tags',
  citations: 'Citations',
  'review.lifecycle': 'Lifecycle',
  'review.status': 'Review status',
  'review.reasons': 'Review reasons',
  'review.confidence': 'Review confidence',
};
