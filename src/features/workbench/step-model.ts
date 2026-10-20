/**
 * The steps of a mechanism variant as recipes over the draft, and their views (step 6.5a decision D4). A step is addressed by its variant's
 * index `v` and its own index `s`. Same rules as the other models: text is stored exactly as typed (INV-24); an EMPTY optional text means the
 * field is ABSENT; the two optional flags are set to true or false when the person ticks or clears them, never guessed; a schema problem is a
 * finding, not a fix. A new step has its ID, no kinds and no rows. The rows of a step (species, bond changes, electron movements) are in
 * `step-rows-model.ts`. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';
import type { STEP_KINDS } from '@/core/schema';
import { wordsOf } from './reagent-model';

export type StepKindValue = (typeof STEP_KINDS)[number];
export type StepFlag = 'isRateDetermining' | 'reversible';
export type StepText = 'stereochemicalEvent' | 'description';

export type Fields = Record<string, unknown>;
export const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
export const text = (value: unknown): string => (typeof value === 'string' ? value : '');
export const listOf = (owner: Fields, field: string): unknown[] => {
  if (!Array.isArray(owner[field])) owner[field] = [];
  return owner[field] as unknown[];
};
export const variantAt = (draft: Fields, v: number): Fields | undefined => {
  const item = listOf(draft, 'variants')[v];
  return isBag(item) ? item : undefined;
};
export const stepAt = (draft: Fields, v: number, s: number): Fields | undefined => {
  const variant = variantAt(draft, v);
  const item = variant === undefined ? undefined : listOf(variant, 'steps')[s];
  return isBag(item) ? item : undefined;
};
/** The rows of a step's list read WITHOUT changing the draft (the editors read frozen drafts): [] when anything on the way is missing. */
export function readRows(draft: unknown, v: number, s: number, field: string): Fields[] {
  const variants = isBag(draft) && Array.isArray(draft.variants) ? draft.variants : [];
  const variant = variants[v];
  const steps = isBag(variant) && Array.isArray(variant.steps) ? variant.steps : [];
  const step = steps[s];
  const rows = isBag(step) && Array.isArray(step[field]) ? (step[field] as unknown[]) : [];
  return rows.map((row) => (isBag(row) ? row : {}));
}
export function setOrDelete(target: Fields, key: string, value: unknown): void {
  if (value === undefined || value === '') Reflect.deleteProperty(target, key);
  else target[key] = value;
}

export const addStep = (v: number, id: string): DraftRecipe => (draft) => {
  const variant = variantAt(draft, v);
  if (variant !== undefined) listOf(variant, 'steps').push({ id, stepKinds: [], species: [], bondsFormed: [], bondsBroken: [], electronMovements: [] });
};
export const removeStep = (v: number, s: number): DraftRecipe => (draft) => {
  const variant = variantAt(draft, v);
  const steps = variant === undefined ? [] : listOf(variant, 'steps');
  if (s >= 0 && s < steps.length) steps.splice(s, 1);
};
export const moveStep = (v: number, s: number, by: -1 | 1): DraftRecipe => (draft) => {
  const variant = variantAt(draft, v);
  const steps = variant === undefined ? [] : listOf(variant, 'steps');
  const to = s + by;
  if (s < 0 || s >= steps.length || to < 0 || to >= steps.length) return;
  const moved = steps[s];
  steps[s] = steps[to];
  steps[to] = moved;
};
export const toggleStepKind = (v: number, s: number, kind: string, on: boolean): DraftRecipe => (draft) => {
  const step = stepAt(draft, v, s);
  if (step === undefined) return;
  const kinds = listOf(step, 'stepKinds');
  const at = kinds.indexOf(kind);
  if (on && at < 0) kinds.push(kind);
  if (!on && at >= 0) kinds.splice(at, 1);
};
export const setStepFlag = (v: number, s: number, flag: StepFlag, value: boolean): DraftRecipe => (draft) => {
  const step = stepAt(draft, v, s);
  if (step !== undefined) step[flag] = value;
};
export const setStepText = (v: number, s: number, field: StepText, value: string): DraftRecipe => (draft) => {
  const step = stepAt(draft, v, s);
  if (step !== undefined) setOrDelete(step, field, value);
};

export interface StepView {
  readonly id: string;
  readonly title: string;
  readonly kinds: readonly string[];
  readonly isRateDetermining: boolean | undefined;
  readonly reversible: boolean | undefined;
  readonly stereochemicalEvent: string;
  readonly description: string;
  readonly speciesCount: number;
}

export function stepsViewOf(draft: unknown, v: number): readonly StepView[] {
  const variant = isBag(draft) && Array.isArray(draft.variants) && isBag(draft.variants[v]) ? draft.variants[v] : undefined;
  const steps = isBag(variant) && Array.isArray(variant.steps) ? variant.steps : [];
  return steps.map((item): StepView => {
    const row = isBag(item) ? item : {};
    return {
      id: text(row.id),
      title: text(row.title),
      kinds: Array.isArray(row.stepKinds) ? row.stepKinds.filter((k): k is string => typeof k === 'string') : [],
      isRateDetermining: typeof row.isRateDetermining === 'boolean' ? row.isRateDetermining : undefined,
      reversible: typeof row.reversible === 'boolean' ? row.reversible : undefined,
      stereochemicalEvent: text(row.stereochemicalEvent),
      description: text(row.description),
      speciesCount: Array.isArray(row.species) ? row.species.length : 0,
    };
  });
}

/** "Step <n> · <step kinds> · rate-determining · reversible": a part not stated (or cleared) is left out. */
export function stepSummary(step: StepView, n: number): string {
  const kinds = step.kinds.map((kind) => wordsOf(kind).toLowerCase()).join(', ');
  return [`Step ${n}`, ...(kinds === '' ? [] : [kinds]), ...(step.isRateDetermining === true ? ['rate-determining'] : []), ...(step.reversible === true ? ['reversible'] : [])].join(' · ');
}
