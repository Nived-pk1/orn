/**
 * The route editor's recipes over the draft and its view (7.2b C1). Same rules as the other models: text is stored as typed; a choice that
 * is not made is ABSENT (a new step has an empty reaction until one is picked: L1 refuses Save); nothing is guessed, in particular a new
 * step takes its input from nothing until the person ticks a step (RTE-001 to RTE-004 speak at Save). Removing a step takes its id out of
 * every "Takes its input from" so no id dangles. No chemistry.
 */
import type { DraftRecipe } from '@/core/editing';

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const stepsOf = (draft: Fields): Fields[] => {
  if (!Array.isArray(draft.steps)) draft.steps = [];
  return (draft.steps as unknown[]).filter(isBag);
};

export const ROUTE_PURPOSES_WORDS: Readonly<Record<string, string>> = { curated: 'Curated', worked_example: 'Worked example', exam_problem: 'Exam problem', user: 'Mine' };

export interface StepView {
  readonly id: string;
  readonly reactionId: string;
  readonly outcomeId: string;
  readonly conditionVariantId: string;
  readonly inputFromStepIds: readonly string[];
}
export interface RouteView {
  readonly name: string;
  readonly purpose: string;
  readonly target: { readonly kind: string; readonly id: string } | undefined;
  readonly steps: readonly StepView[];
}

export function routeViewOf(draft: unknown): RouteView {
  const d = isBag(draft) ? draft : {};
  const target = isBag(d.target) ? { kind: text(d.target.kind), id: text(d.target.id) } : undefined;
  const steps = (Array.isArray(d.steps) ? d.steps : []).filter(isBag).map((s) => ({
    id: text(s.id),
    reactionId: text(s.reactionId),
    outcomeId: text(s.outcomeId),
    conditionVariantId: text(s.conditionVariantId),
    inputFromStepIds: Array.isArray(s.inputFromStepIds) ? (s.inputFromStepIds as unknown[]).map(text) : [],
  }));
  return { name: text(d.name), purpose: text(d.purpose), target, steps };
}

export const setRouteName = (value: string): DraftRecipe => (draft) => {
  draft.name = value;
};
export const setPurpose = (value: string): DraftRecipe => (draft) => {
  draft.purpose = value;
};
export const setTarget = (ref: { readonly kind: string; readonly id: string } | undefined): DraftRecipe => (draft) => {
  if (ref === undefined) Reflect.deleteProperty(draft, 'target');
  else draft.target = { kind: ref.kind, id: ref.id };
};
export const addStep = (newId: (prefix: string) => string): DraftRecipe => (draft) => {
  stepsOf(draft);
  (draft.steps as unknown[]).push({ id: newId('rst'), reactionId: '', inputFromStepIds: [] });
};
export const removeStep = (index: number): DraftRecipe => (draft) => {
  const steps = stepsOf(draft);
  const gone = steps[index];
  if (gone === undefined) return;
  (draft.steps as unknown[]).splice((draft.steps as unknown[]).indexOf(gone), 1);
  for (const step of steps) if (Array.isArray(step.inputFromStepIds)) step.inputFromStepIds = (step.inputFromStepIds as unknown[]).filter((id) => id !== gone.id);
};
export const moveStep = (index: number, by: -1 | 1): DraftRecipe => (draft) => {
  stepsOf(draft);
  const list = draft.steps as unknown[];
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return;
  const [moved] = list.splice(index, 1);
  list.splice(to, 0, moved);
};
/** A different reaction means different outcomes and variants: both choices go. */
export const setStepReaction = (index: number, reactionId: string): DraftRecipe => (draft) => {
  const step = stepsOf(draft)[index];
  if (step === undefined) return;
  step.reactionId = reactionId;
  Reflect.deleteProperty(step, 'outcomeId');
  Reflect.deleteProperty(step, 'conditionVariantId');
};
/** `''` is "Any outcome" / "No variant": the field is absent. */
export const setStepOutcome = (index: number, outcomeId: string): DraftRecipe => (draft) => {
  const step = stepsOf(draft)[index];
  if (step === undefined) return;
  if (outcomeId === '') Reflect.deleteProperty(step, 'outcomeId');
  else step.outcomeId = outcomeId;
};
export const setStepVariant = (index: number, variantId: string): DraftRecipe => (draft) => {
  const step = stepsOf(draft)[index];
  if (step === undefined) return;
  if (variantId === '') Reflect.deleteProperty(step, 'conditionVariantId');
  else step.conditionVariantId = variantId;
};
export const toggleInput = (index: number, fromStepId: string, on: boolean): DraftRecipe => (draft) => {
  const step = stepsOf(draft)[index];
  if (step === undefined) return;
  const current = Array.isArray(step.inputFromStepIds) ? (step.inputFromStepIds as unknown[]) : [];
  step.inputFromStepIds = on ? (current.includes(fromStepId) ? current : [...current, fromStepId]) : current.filter((id) => id !== fromStepId);
};

export const ROUTE_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'Name',
  purpose: 'What this route is',
  target: 'Target',
  steps: 'Steps',
  description: 'Description',
  notes: 'Notes',
  conceptIds: 'Concepts',
};
