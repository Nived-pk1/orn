/**
 * The mechanism's identity, summary and variants as recipes over the draft, and the views the editor reads (step 6.5a, decisions D2 and D3).
 * A mechanism has `name` and `aliases` (like a reaction; the recipes for them are the reaction model's), an optional `summary`, and variants.
 * Same rules as the other models: text is stored exactly as typed (INV-24); an EMPTY optional text means the field is ABSENT; a schema problem
 * is a finding, not a fix. A new variant has its ID, its label and no steps. The steps are in `step-model.ts`. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const listOf = (draft: Fields, field: string): unknown[] => {
  if (!Array.isArray(draft[field])) draft[field] = [];
  return draft[field] as unknown[];
};
const variantAt = (draft: Fields, index: number): Fields | undefined => {
  const item = listOf(draft, 'variants')[index];
  return isBag(item) ? item : undefined;
};
function setOrDelete(target: Fields, key: string, value: string): void {
  if (value === '') Reflect.deleteProperty(target, key);
  else target[key] = value;
}

export const setSummary = (value: string): DraftRecipe => (draft) => {
  setOrDelete(draft, 'summary', value);
};

export const addVariant = (id: string, label: string): DraftRecipe => (draft) => {
  listOf(draft, 'variants').push({ id, label, steps: [] });
};
export const setVariantLabel = (index: number, value: string): DraftRecipe => (draft) => {
  const variant = variantAt(draft, index);
  if (variant !== undefined) variant.label = value;
};
export const setVariantNote = (index: number, value: string): DraftRecipe => (draft) => {
  const variant = variantAt(draft, index);
  if (variant !== undefined) setOrDelete(variant, 'note', value);
};

export const setVariantApplicability = (index: number, value: string): DraftRecipe => (draft) => {
  const variant = variantAt(draft, index);
  if (variant !== undefined) setOrDelete(variant, 'applicability', value);
};
export const setVariantRateLaw = (index: number, value: string): DraftRecipe => (draft) => {
  const variant = variantAt(draft, index);
  if (variant !== undefined) setOrDelete(variant, 'rateLaw', value);
};
export const removeVariant = (index: number): DraftRecipe => (draft) => {
  const variants = listOf(draft, 'variants');
  if (index >= 0 && index < variants.length) variants.splice(index, 1);
};
export const moveVariant = (index: number, by: -1 | 1): DraftRecipe => (draft) => {
  const variants = listOf(draft, 'variants');
  const to = index + by;
  if (index < 0 || index >= variants.length || to < 0 || to >= variants.length) return;
  const moved = variants[index];
  variants[index] = variants[to];
  variants[to] = moved;
};

export interface MechanismView {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly summary: string;
  readonly lifecycle: string;
  readonly status: string;
}

export function mechanismViewOf(draft: unknown): MechanismView {
  const fields = isBag(draft) ? draft : {};
  const review = isBag(fields.review) ? fields.review : {};
  return {
    id: text(fields.id),
    name: text(fields.name),
    aliases: Array.isArray(fields.aliases) ? fields.aliases.map(text) : [],
    summary: text(fields.summary),
    lifecycle: text(review.lifecycle) || 'draft',
    status: text(review.status) || 'unreviewed',
  };
}

export interface VariantView {
  readonly id: string;
  readonly label: string;
  readonly applicability: string;
  readonly rateLaw: string;
  readonly note: string;
  readonly stepCount: number;
}

export function variantsViewOf(draft: unknown): readonly VariantView[] {
  const variants = isBag(draft) && Array.isArray(draft.variants) ? draft.variants : [];
  return variants.map((item): VariantView => {
    const row = isBag(item) ? item : {};
    return { id: text(row.id), label: text(row.label), applicability: text(row.applicability), rateLaw: text(row.rateLaw), note: text(row.note), stepCount: Array.isArray(row.steps) ? row.steps.length : 0 };
  });
}

const SUMMARY_APPLICABILITY_MAX = 80;

/** "<label> · <n> steps · <applicability>": the applicability on one line (as typed, markup unrendered), cut with an ellipsis; a part not stated is left out. */
export function variantSummary(variant: VariantView): string {
  const one = variant.applicability.replace(/\s+/g, ' ').trim();
  const applicability = one.length > SUMMARY_APPLICABILITY_MAX ? `${one.slice(0, SUMMARY_APPLICABILITY_MAX - 1)}…` : one;
  return [variant.label, `${variant.stepCount} ${variant.stepCount === 1 ? 'step' : 'steps'}`, ...(applicability === '' ? [] : [applicability])].join(' · ');
}

/** The labels of the fields the mechanism editor owns or summarises, by path (the conflict table shows them instead of raw paths). */
export const MECHANISM_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'Name',
  aliases: 'Aliases',
  summary: 'Summary',
  variants: 'Variants',
  mechanismClasses: 'Mechanism classes',
  conceptIds: 'Concepts',
  studyNotes: 'Study notes',
  notes: 'Notes',
  tags: 'Tags',
  citations: 'Citations',
  'review.lifecycle': 'Lifecycle',
  'review.status': 'Review status',
  'review.reasons': 'Review reasons',
  'review.confidence': 'Review confidence',
};
