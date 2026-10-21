/**
 * The knowledge editors' recipes over the draft, and their words (step 6.6b part 2, decisions N1 to N3): a concept, a named reaction and a
 * transformation. Same rules as the other models: text is stored exactly as typed (INV-24); an EMPTY optional input means the field is
 * ABSENT; a schema problem is a finding, not a fix. The kind of concept has no default ("" removes it; L1 refuses Save until one is
 * chosen). Difficulty is a whole number 1 to 5 with no meaning invented. The name and aliases recipes are the reaction's (same fields).
 * No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';
import { CARBON_CHAIN_CHANGES, CONCEPT_KINDS, type REVERSIBILITY } from '@/core/schema';
import { conceptIdsOf } from './shared-model';

export { addAlias, moveAlias, removeAlias, setAlias, setName } from './reaction-model';
export { addParent, removeParent } from './class-model';

/** "reaction_type" -> "Reaction type": the enum's own name with spaces and a capital, no invented wording. */
export const wordsOfKind = (value: string): string => {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export const CONCEPT_KIND_WORDS: Readonly<Record<(typeof CONCEPT_KINDS)[number], string>> = Object.fromEntries(CONCEPT_KINDS.map((kind) => [kind, wordsOfKind(kind)])) as Record<(typeof CONCEPT_KINDS)[number], string>;
export const CARBON_CHAIN_WORDS: Readonly<Record<(typeof CARBON_CHAIN_CHANGES)[number], string>> = Object.fromEntries(CARBON_CHAIN_CHANGES.map((kind) => [kind, wordsOfKind(kind)])) as Record<(typeof CARBON_CHAIN_CHANGES)[number], string>;

/** The schema's own `unknown` is "Not stated" (a new reaction starts there). */
export const REVERSIBILITY_WORDS: Readonly<Record<(typeof REVERSIBILITY)[number], string>> = { unknown: 'Not stated', equilibrium: 'Equilibrium', reversible_under_other_conditions: 'Reversible under other conditions', irreversible: 'Irreversible' };

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** `''` (the "Choose a kind" option) removes the field: the schema has no empty kind of concept. */
export const setConceptKind = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'conceptKind');
  else draft.conceptKind = value;
};

/** `''` is "Not set" (absent); 1 to 5 is stored as a number; anything else changes nothing. */
export const setDifficulty = (value: string): DraftRecipe => (draft) => {
  if (value === '') {
    Reflect.deleteProperty(draft, 'difficulty');
    return;
  }
  const n = Number(value);
  if (Number.isInteger(n) && n >= 1 && n <= 5) draft.difficulty = n;
};

/** `''` is "Not stated" (absent). */
export const setCarbonChain = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'carbonChainChange');
  else draft.carbonChainChange = value;
};

/** The kind is required in the schema, so it is never removed; the note is optional (empty removes it). */
export const setReversibility = (value: string): DraftRecipe => (draft) => {
  const current = isBag(draft.reversibility) ? draft.reversibility : {};
  draft.reversibility = { ...current, kind: value };
};
export const setReversibilityNote = (value: string): DraftRecipe => (draft) => {
  const current: Fields = isBag(draft.reversibility) ? { ...draft.reversibility } : { kind: 'unknown' };
  if (value === '') Reflect.deleteProperty(current, 'note');
  else current.note = value;
  draft.reversibility = current;
};

export type KnowledgeText = 'equationText' | 'bondChangeSummary' | 'generalizedEquation';

/** The draft's fields as plain values for the forms. */
export interface KnowledgeView {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly conceptKind: string;
  /** '' is "Not set"; otherwise "1" to "5". */
  readonly difficulty: string;
  readonly parentIds: readonly string[];
  readonly carbonChain: string;
  readonly fromClassIds: readonly string[];
  readonly toClassIds: readonly string[];
  readonly equationText: string;
  readonly bondChangeSummary: string;
  /** Read-only: a future seam, kept unchanged. */
  readonly reactionSmarts: string;
  readonly reversibility: string;
  readonly reversibilityNote: string;
  readonly namedReactionIds: readonly string[];
  readonly transformationIds: readonly string[];
  /** Read-only: the atom-mapped reaction (a future seam), as "format: value"; '' when absent. */
  readonly mappedReaction: string;
}

export function knowledgeViewOf(draft: unknown): KnowledgeView {
  const fields = isBag(draft) ? draft : {};
  return {
    id: text(fields.id),
    name: text(fields.name),
    aliases: Array.isArray(fields.aliases) ? fields.aliases.map(text) : [],
    conceptKind: text(fields.conceptKind),
    difficulty: typeof fields.difficulty === 'number' ? String(fields.difficulty) : '',
    parentIds: conceptIdsOf(draft, 'parentIds'),
    carbonChain: text(fields.carbonChainChange),
    fromClassIds: conceptIdsOf(draft, 'fromClassIds'),
    toClassIds: conceptIdsOf(draft, 'toClassIds'),
    equationText: text(fields.equationText),
    bondChangeSummary: text(fields.bondChangeSummary),
    reactionSmarts: text(fields.reactionSmarts),
    reversibility: isBag(fields.reversibility) && text(fields.reversibility.kind) !== '' ? text(fields.reversibility.kind) : 'unknown',
    reversibilityNote: isBag(fields.reversibility) ? text(fields.reversibility.note) : '',
    namedReactionIds: conceptIdsOf(draft, 'namedReactionIds'),
    transformationIds: conceptIdsOf(draft, 'transformationIds'),
    mappedReaction: isBag(fields.mappedReaction) ? text(fields.mappedReaction.value) : '',
  };
}

export const COMMON_LABELS: Readonly<Record<string, string>> = {
  name: 'Name',
  aliases: 'Aliases',
  studyNotes: 'Study notes',
  notes: 'Notes',
  tags: 'Tags',
  citations: 'Citations',
  'review.lifecycle': 'Lifecycle',
  'review.status': 'Review status',
  'review.reasons': 'Review reasons',
  'review.confidence': 'Review confidence',
};

/** The labels of the fields each editor owns, by path (the conflict table shows them instead of raw paths). */
export const CONCEPT_FIELD_LABELS: Readonly<Record<string, string>> = { ...COMMON_LABELS, conceptKind: 'Kind of concept', parentIds: 'Parent concepts', summary: 'Summary', difficulty: 'Difficulty' };
export const NAMED_REACTION_FIELD_LABELS: Readonly<Record<string, string>> = {
  ...COMMON_LABELS,
  parentIds: 'Parent named reactions',
  summary: 'Summary',
  typicalConditions: 'Typical conditions',
  conceptIds: 'Concepts',
  prerequisiteConceptIds: 'Prerequisite concepts',
  difficulty: 'Difficulty',
};
export const TRANSFORMATION_FIELD_LABELS: Readonly<Record<string, string>> = {
  ...COMMON_LABELS,
  fromClassIds: 'From classes',
  toClassIds: 'To classes',
  equationText: 'Equation text',
  reactionSmarts: 'Reaction SMARTS',
  bondChangeSummary: 'Bond change summary',
  carbonChainChange: 'Carbon chain change',
  conceptIds: 'Concepts',
  description: 'Description',
};
