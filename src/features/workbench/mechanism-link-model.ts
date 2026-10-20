/**
 * The reaction's mechanism links and each outcome's mechanism and variant as recipes over the draft (step 6.5a decision D5). A reaction links
 * mechanisms in `mechanismIds`; an outcome may name one mechanism (and one of its variants). Linking a mechanism from an outcome also links it to
 * the reaction in the SAME edit, so one undo takes both back. Changing an outcome's mechanism drops its variant (a variant belongs to its
 * mechanism); choosing "none" removes the outcome's link and leaves the reaction's alone. Removing a mechanism from the reaction while an
 * outcome names it is refused in words by the editor (`usingWords`). The graph and the validation rules read these fields; nothing here is derived data.
 */
import type { DraftRecipe } from '@/core/editing';
import { isBag, listOf, text, type Fields } from './step-model';

export const addMechanismLink = (id: string): DraftRecipe => (draft) => {
  const ids = listOf(draft, 'mechanismIds');
  if (!ids.includes(id)) ids.push(id);
};
export const removeMechanismLink = (index: number): DraftRecipe => (draft) => {
  const ids = listOf(draft, 'mechanismIds');
  if (index >= 0 && index < ids.length) ids.splice(index, 1);
};

const outcomeAt = (draft: Fields, index: number): Fields | undefined => {
  const item = listOf(draft, 'outcomes')[index];
  return isBag(item) ? item : undefined;
};

export const setOutcomeMechanism = (index: number, mechanismId: string): DraftRecipe => (draft) => {
  const outcome = outcomeAt(draft, index);
  if (outcome === undefined) return;
  if (mechanismId === '') {
    Reflect.deleteProperty(outcome, 'mechanism');
    return;
  }
  const current = isBag(outcome.mechanism) ? outcome.mechanism : undefined;
  if (current?.mechanismId !== mechanismId) outcome.mechanism = { mechanismId };
  const ids = listOf(draft, 'mechanismIds');
  if (!ids.includes(mechanismId)) ids.push(mechanismId);
};
export const setOutcomeVariant = (index: number, variantId: string): DraftRecipe => (draft) => {
  const outcome = outcomeAt(draft, index);
  const link = outcome !== undefined && isBag(outcome.mechanism) ? outcome.mechanism : undefined;
  if (link === undefined) return;
  if (variantId === '') Reflect.deleteProperty(link, 'variantId');
  else link.variantId = variantId;
};

export const linkedIdsOf = (draft: unknown): readonly string[] => (isBag(draft) && Array.isArray(draft.mechanismIds) ? draft.mechanismIds.filter((id): id is string => typeof id === 'string') : []);

export function outcomeLinkOf(draft: unknown, index: number): { readonly mechanismId: string; readonly variantId: string } {
  const outcomes = isBag(draft) && Array.isArray(draft.outcomes) ? draft.outcomes : [];
  const outcome = outcomes[index];
  const link = isBag(outcome) && isBag(outcome.mechanism) ? outcome.mechanism : {};
  return { mechanismId: text(link.mechanismId), variantId: text(link.variantId) };
}

/** The 1-based numbers of the outcomes that name this mechanism. */
export function outcomeNumbersUsing(draft: unknown, mechanismId: string): readonly number[] {
  const outcomes = isBag(draft) && Array.isArray(draft.outcomes) ? draft.outcomes : [];
  return outcomes.flatMap((outcome, at) => (isBag(outcome) && isBag(outcome.mechanism) && outcome.mechanism.mechanismId === mechanismId ? [at + 1] : []));
}

/** "Outcome 2 uses this mechanism; change that link first" (or several), undefined when no outcome does. */
export function usingWords(numbers: readonly number[]): string | undefined {
  if (numbers.length === 0) return undefined;
  if (numbers.length === 1) return `Outcome ${numbers[0]} uses this mechanism; change that link first`;
  const head = numbers.slice(0, -1).join(', ');
  return `Outcomes ${head} and ${numbers[numbers.length - 1]} use this mechanism; change those links first`;
}
