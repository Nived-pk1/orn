/** The stage recipes (step 6.3a decisions D3, 4 and 5), over real demo reactions. */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { reorderItems } from '@/core/commands/builders';
import type { DraftRecipe } from '@/core/editing';
import type { Reaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { must } from '@/test-support/state-fixture';
import { addStage, moveStage, removeStage, setStageKind, setStageLabel, stagesViewOf, stageUseOf } from './stage-model';

const state = demoState();
const reaction = (id: string): Reaction => state.records.reaction[id as never] as Reaction;
const GRIGNARD = reaction('rxn_methylmgbr-ethanal');
const PCC = reaction('rxn_ethanol-to-ethanal-pcc');
const apply = (draft: Reaction, ...recipes: DraftRecipe[]): Reaction => produce(draft, (d) => void recipes.forEach((recipe) => recipe(d as never))) as Reaction;
const noStages = { ...PCC, stages: [] } as Reaction;

describe('stage recipes', () => {
  it('adding the FIRST stage puts every existing participant in it; the second starts empty', () => {
    const first = apply(noStages, addStage('stg_first', 'reaction'));
    expect(first.stages).toHaveLength(1);
    expect(first.stages[0]?.participantIds).toEqual(noStages.participants.map((p) => p.id));
    expect(first.stages[0]?.parameters).toEqual({ solventCharacter: [], activation: [], other: [], parsedFields: [] });
    const second = apply(first, addStage('stg_second', 'workup'));
    expect(second.stages[1]).toMatchObject({ id: 'stg_second', kind: 'workup', participantIds: [] });
    expect(second.stages[0]?.participantIds).toEqual(first.stages[0]?.participantIds);
  });

  it('label and kind: an empty label removes the field', () => {
    const next = apply(GRIGNARD, setStageLabel(0, 'Grignard addition'), setStageKind(1, 'quench'));
    expect(next.stages[0]?.label).toBe('Grignard addition');
    expect(next.stages[1]?.kind).toBe('quench');
    expect(Object.hasOwn(must(apply(next, setStageLabel(0, '')).stages[0]), 'label')).toBe(false);
  });

  it('moving is an exact permutation, the same result as the reorder builder; the participants stay in their stages', () => {
    const moved = apply(GRIGNARD, moveStage(0, 1));
    const order = moved.stages.map((s) => s.id);
    const built = reorderItems(state, { ref: { kind: 'reaction', id: GRIGNARD.id }, field: 'stages', orderedIds: order });
    expect(built.ok).toBe(true);
    const update = built.ok ? built.envelope.commands[0] : undefined;
    expect(update?.type === 'record.update' && (update.record as Reaction).stages).toEqual(moved.stages);
    expect(moved.stages[1]?.participantIds).toEqual(GRIGNARD.stages[0]?.participantIds);
    expect(apply(GRIGNARD, moveStage(0, -1)).stages).toEqual(GRIGNARD.stages);
    expect(apply(apply(GRIGNARD, moveStage(0, 1)), moveStage(1, -1)).stages).toEqual(GRIGNARD.stages);
  });

  it('removing a stage moves its participants where asked; every participant stays in exactly one stage', () => {
    const next = apply(GRIGNARD, removeStage(1, 0));
    expect(next.stages).toHaveLength(1);
    const ids = next.participants.map((p) => p.id);
    expect([...(next.stages[0]?.participantIds ?? [])].sort()).toEqual([...ids].sort());
  });

  it('removing the ONLY stage leaves its participants in no stage (a reaction with no stages is valid)', () => {
    const one = apply(noStages, addStage('stg_only', 'reaction'));
    const none = apply(one, removeStage(0));
    expect(none.stages).toEqual([]);
    expect(none.participants).toHaveLength(noStages.participants.length);
  });

  it('a stage a condition variant or an intermediate names is NOT removed (the form says why)', () => {
    const stageId = must(GRIGNARD.stages[1]).id;
    const variant = { ...GRIGNARD, conditionVariants: [{ id: 'cvr_x', label: '443 K', stageId, parameters: { solventCharacter: [], activation: [], other: [], parsedFields: [] }, participantIds: [] }] } as unknown as Reaction;
    expect(stageUseOf(variant, stageId)).toEqual({ by: 'condition', label: '443 K' });
    expect(apply(variant, removeStage(1, 0)).stages).toEqual(variant.stages);
    const inter = { ...GRIGNARD, intermediates: [{ id: 'int_x', intermediateKind: 'carbanion', label: 'Alkoxide', stageId }] } as unknown as Reaction;
    expect(stageUseOf(inter, stageId)).toEqual({ by: 'intermediate', label: 'Alkoxide' });
    expect(apply(inter, removeStage(1, 0)).stages).toEqual(inter.stages);
    expect(stageUseOf(GRIGNARD, stageId)).toBeUndefined();
  });

  it('the view reads id, kind, label and the free-text conditions', () => {
    const view = stagesViewOf(apply(GRIGNARD, setStageLabel(0, 'First')));
    expect(view[0]).toMatchObject({ label: 'First', kind: 'reaction' });
    expect(view).toHaveLength(2);
  });
});
