/**
 * Classifications as recipes over the draft, and their words (step 6.6a, decision C3): a reaction's `reactionTypes` and `mechanismClasses` and
 * a mechanism's `mechanismClasses`, each `{ conceptId, certainty }`. The certainty has NO default: a classification is added with the
 * certainty ABSENT, the form says "Choose certainty", and the schema's L1 refuses a Save until it is chosen. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';

export type ClassificationField = 'reactionTypes' | 'mechanismClasses';

export const CERTAINTY_WORDS = { definite: 'Definite', probable: 'Probable', possible: 'Possible' } as const;

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const listOf = (draft: Fields, field: string): unknown[] => {
  if (!Array.isArray(draft[field])) draft[field] = [];
  return draft[field] as unknown[];
};

export interface ClassificationView {
  readonly conceptId: string;
  /** '' when not chosen. */
  readonly certainty: string;
}

export function classificationsOf(draft: unknown, field: ClassificationField): ClassificationView[] {
  const list = isBag(draft) && Array.isArray(draft[field]) ? (draft[field] as unknown[]) : [];
  return list.flatMap((item) => (isBag(item) && typeof item.conceptId === 'string' ? [{ conceptId: item.conceptId, certainty: typeof item.certainty === 'string' ? item.certainty : '' }] : []));
}

export const addClassification = (field: ClassificationField, conceptId: string): DraftRecipe => (draft) => {
  const list = listOf(draft, field);
  if (!list.some((item) => isBag(item) && item.conceptId === conceptId)) list.push({ conceptId });
};
export const setCertainty = (field: ClassificationField, index: number, value: string): DraftRecipe => (draft) => {
  const item = listOf(draft, field)[index];
  if (!isBag(item)) return;
  if (value === '') Reflect.deleteProperty(item, 'certainty');
  else item.certainty = value;
};
export const removeClassification = (field: ClassificationField, index: number): DraftRecipe => (draft) => {
  listOf(draft, field).splice(index, 1);
};
