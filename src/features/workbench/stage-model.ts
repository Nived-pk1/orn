/**
 * The reaction editor's stages as recipes over the draft, and their view (step 6.3a decisions D3, 4 and 5). Stage order is array order;
 * a stage lists its participants (`participantIds`), and with stages present every participant is in exactly one (RXN-007). So:
 *  - adding the FIRST stage puts every existing participant in it (the form says so in words);
 *  - removing a stage that participants use needs to know where they go (another stage), or, when it is the only stage, leaves them in no
 *    stage (a reaction with no stages is valid);
 *  - a stage that a condition variant or an intermediate names cannot be removed (they are read-only until step 6.4; never detached silently).
 * The stage's parameters are not edited here (read-only until 6.4); a new stage starts with the empty parameter arrays the schema requires.
 * The kinds come from the schema's own list. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';
import type { STAGE_KINDS } from '@/core/schema';

export type StageKindValue = (typeof STAGE_KINDS)[number];

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const listOf = (draft: Fields, field: string): unknown[] => {
  if (!Array.isArray(draft[field])) draft[field] = [];
  return draft[field] as unknown[];
};
const stageAt = (draft: Fields, index: number): Fields | undefined => {
  const item = listOf(draft, 'stages')[index];
  return isBag(item) ? item : undefined;
};

/** A new stage: the ID is given; no participants yet, except that the FIRST stage takes every participant of the reaction. */
export const addStage = (id: string, kind: StageKindValue): DraftRecipe => (draft) => {
  const stages = listOf(draft, 'stages');
  const everyone = stages.length === 0 ? listOf(draft, 'participants').flatMap((p) => (isBag(p) && typeof p.id === 'string' ? [p.id] : [])) : [];
  stages.push({ id, kind, participantIds: everyone, parameters: { solventCharacter: [], activation: [], other: [], parsedFields: [] } });
};

export const setStageLabel = (index: number, value: string): DraftRecipe => (draft) => {
  const stage = stageAt(draft, index);
  if (stage === undefined) return;
  if (value === '') Reflect.deleteProperty(stage, 'label');
  else stage.label = value;
};
export const setStageKind = (index: number, kind: string): DraftRecipe => (draft) => {
  const stage = stageAt(draft, index);
  if (stage !== undefined) stage.kind = kind;
};

/** Swaps the stage with its neighbour: the array stays a permutation of the same stages (the participants stay in their stages). */
export const moveStage = (index: number, by: -1 | 1): DraftRecipe => (draft) => {
  const stages = listOf(draft, 'stages');
  const to = index + by;
  if (index < 0 || index >= stages.length || to < 0 || to >= stages.length) return;
  const moved = stages[index];
  stages[index] = stages[to];
  stages[to] = moved;
};

export interface StageUse {
  /** What names the stage: a condition variant or an intermediate, with its words. */
  readonly by: 'condition' | 'intermediate';
  readonly label: string;
}

/** What a stage is used by besides participants (a condition variant or an intermediate), or undefined. */
export function stageUseOf(draft: unknown, stageId: string): StageUse | undefined {
  const fields = isBag(draft) ? draft : {};
  const variants = Array.isArray(fields.conditionVariants) ? fields.conditionVariants : [];
  for (const variant of variants) {
    if (isBag(variant) && variant.stageId === stageId) return { by: 'condition', label: typeof variant.label === 'string' ? variant.label : '' };
  }
  const intermediates = Array.isArray(fields.intermediates) ? fields.intermediates : [];
  for (const [at, item] of intermediates.entries()) {
    if (isBag(item) && item.stageId === stageId) return { by: 'intermediate', label: typeof item.label === 'string' && item.label !== '' ? item.label : `intermediate ${at + 1}` };
  }
  return undefined;
}

/**
 * Removes the stage. Its participants go to stage `moveTo` (an index in the stages as they are now, not the removed one); with no target they
 * stay in no stage (only valid when it was the only stage: otherwise RXN-007 would refuse Save). A stage a condition or intermediate names is not removed.
 */
export const removeStage = (index: number, moveTo?: number): DraftRecipe => (draft) => {
  const stages = listOf(draft, 'stages');
  const stage = stageAt(draft, index);
  if (stage === undefined || typeof stage.id !== 'string' || stageUseOf(draft, stage.id) !== undefined) return;
  const carried = Array.isArray(stage.participantIds) ? [...(stage.participantIds as unknown[])] : [];
  const target = moveTo === undefined || moveTo === index ? undefined : stageAt(draft, moveTo);
  if (target !== undefined) listOf(target, 'participantIds').push(...carried.filter((id) => !listOf(target, 'participantIds').includes(id)));
  stages.splice(index, 1);
};

export interface StageView {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly participantIds: readonly string[];
  /** The stage's free-text conditions (`parameters.text`), read-only. */
  readonly conditionsText: string;
  readonly originalText: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function stagesViewOf(draft: unknown): readonly StageView[] {
  const stages = isBag(draft) && Array.isArray(draft.stages) ? draft.stages : [];
  return stages.map((item): StageView => {
    const row = isBag(item) ? item : {};
    return {
      id: text(row.id),
      kind: text(row.kind),
      label: text(row.label),
      participantIds: Array.isArray(row.participantIds) ? row.participantIds.filter((id): id is string => typeof id === 'string') : [],
      conditionsText: isBag(row.parameters) ? text(row.parameters.text) : '',
      originalText: text(row.originalText),
    };
  });
}
