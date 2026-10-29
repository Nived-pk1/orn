/**
 * The route editor's recipes (7.2b C1): steps added, removed, moved; a step's choices cleared when its reaction changes; "Takes its input
 * from" kept consistent when a step goes; nothing guessed (a new step takes no input). And the seed of a found route (C2).
 */
import { describe, expect, it } from 'vitest';
import { routeSeedOf } from '@/core/editing/route-seed';
import { addStep, moveStep, removeStep, routeViewOf, setStepOutcome, setStepReaction, setStepVariant, setTarget, toggleInput } from './route-model';

type Bag = Record<string, unknown>;
const run = (recipe: (draft: Bag) => void, draft: Bag): Bag => {
  const copy = structuredClone(draft);
  recipe(copy);
  return copy;
};
const base = (): Bag => ({ kind: 'route', id: 'rte_x', name: '', purpose: 'user', steps: [], conceptIds: [] });
let n = 0;
const newId = (prefix: string): string => `${prefix}_s${(n += 1)}`;

describe('steps', () => {
  it('a new step has no reaction choice and takes input from nothing', () => {
    const draft = run(addStep(newId), base());
    expect(draft.steps).toEqual([{ id: expect.stringMatching(/^rst_/), reactionId: '', inputFromStepIds: [] }]);
  });

  it('choosing a reaction clears the outcome and the variant of the step', () => {
    let draft = run(addStep(newId), base());
    draft = run(setStepReaction(0, 'rxn_a'), draft);
    draft = run(setStepOutcome(0, 'out_1'), draft);
    draft = run(setStepVariant(0, 'cvr_1'), draft);
    expect(routeViewOf(draft).steps[0]).toMatchObject({ reactionId: 'rxn_a', outcomeId: 'out_1', conditionVariantId: 'cvr_1' });
    draft = run(setStepReaction(0, 'rxn_b'), draft);
    expect(routeViewOf(draft).steps[0]).toMatchObject({ reactionId: 'rxn_b', outcomeId: '', conditionVariantId: '' });
    expect(draft.steps).toEqual([expect.not.objectContaining({ outcomeId: expect.anything() })]);
  });

  it('"Takes its input from" toggles an EARLIER step on and off; removing a step takes its id out of the others', () => {
    let draft = base();
    for (let i = 0; i < 3; i += 1) draft = run(addStep(newId), draft);
    const ids = (draft.steps as { id: string }[]).map((s) => s.id);
    draft = run(toggleInput(1, ids[0] as string, true), draft);
    draft = run(toggleInput(2, ids[1] as string, true), draft);
    expect(routeViewOf(draft).steps.map((s) => s.inputFromStepIds)).toEqual([[], [ids[0]], [ids[1]]]);
    draft = run(toggleInput(1, ids[0] as string, false), draft);
    expect(routeViewOf(draft).steps[1]?.inputFromStepIds).toEqual([]);
    draft = run(toggleInput(2, ids[0] as string, true), draft);
    draft = run(removeStep(0), draft);
    expect(routeViewOf(draft).steps.map((s) => s.inputFromStepIds)).toEqual([[], [ids[1]]]);
  });

  it('Up and Down move a step; the ends do nothing', () => {
    let draft = base();
    for (let i = 0; i < 3; i += 1) draft = run(addStep(newId), draft);
    const ids = (draft.steps as { id: string }[]).map((s) => s.id);
    draft = run(moveStep(2, -1), draft);
    expect((draft.steps as { id: string }[]).map((s) => s.id)).toEqual([ids[0], ids[2], ids[1]]);
    draft = run(moveStep(0, -1), draft);
    draft = run(moveStep(2, 1), draft);
    expect((draft.steps as { id: string }[]).map((s) => s.id)).toEqual([ids[0], ids[2], ids[1]]);
  });

  it('the target is set and cleared', () => {
    let draft = run(setTarget({ kind: 'species', id: 'spc_a' }), base());
    expect(routeViewOf(draft).target).toEqual({ kind: 'species', id: 'spc_a' });
    draft = run(setTarget(undefined), draft);
    expect(draft).not.toHaveProperty('target');
  });
});

describe('the seed of a found route (C2)', () => {
  const step = (reactionId: string, variants: string[]) => ({ reactionId, outcomeId: `out_${reactionId}`, conditionVariantIds: variants });

  it('copies reaction, outcome and variant; each step takes input from the one before; the name is empty', () => {
    const seed = routeSeedOf({ steps: [step('rxn_1', ['cvr_a']), step('rxn_2', []), step('rxn_3', ['cvr_b', 'cvr_c'])], target: { kind: 'species', id: 'spc_t' } }, newId) as { steps: Bag[]; name: string; target: unknown; purpose: string };
    expect(seed.name).toBe('');
    expect(seed.target).toEqual({ kind: 'species', id: 'spc_t' });
    const ids = seed.steps.map((s) => s.id);
    expect(seed.steps.map((s) => s.reactionId)).toEqual(['rxn_1', 'rxn_2', 'rxn_3']);
    expect(seed.steps.map((s) => s.outcomeId)).toEqual(['out_rxn_1', 'out_rxn_2', 'out_rxn_3']);
    // exactly one variant is kept; none or several are left unset (nothing is guessed)
    expect(seed.steps.map((s) => s.conditionVariantId)).toEqual(['cvr_a', undefined, undefined]);
    expect(seed.steps.map((s) => s.inputFromStepIds)).toEqual([[], [ids[0]], [ids[1]]]);
    expect(ids.every((id) => String(id).startsWith('rst_'))).toBe(true);
  });
});
