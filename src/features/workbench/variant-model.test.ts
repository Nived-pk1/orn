/**
 * The condition-variant recipes and words (step 6.4a part 3, D3 and D4): a new variant starts empty, the summary line says what it overrides,
 * the refusal names the outcome.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import type { DraftRecipe } from '@/core/editing';
import { setMeasureChoice, setMeasureKind, setMeasureNumber, variantLoc } from './condition-model';
import { addVariant, moveVariant, outcomeNaming, overridesOf, removeVariant, setVariantLabel, setVariantStage, stageIndexOf, variantSummary, variantsViewOf } from './variant-model';

const empty = () => ({ solventCharacter: [], activation: [], other: [], parsedFields: [] });
const base = () => ({
  stages: [
    { id: 'stg_a', kind: 'workup', participantIds: [], parameters: empty() },
    { id: 'stg_b', kind: 'reaction', participantIds: [], parameters: empty() },
  ],
  conditionVariants: [{ id: 'cvr_1', label: '443 K, excess acid', participantIds: ['prt_x'], parameters: { ...empty(), temperature: { kind: 'value', value: 443, unit: 'K' } } }],
  outcomes: [{ id: 'out_1', conditionVariantIds: ['cvr_1'] }, { id: 'out_2', conditionVariantIds: [] }, { id: 'out_3', conditionVariantIds: ['cvr_1', 'cvr_2'] }],
});
const run = <T,>(draft: T, ...recipes: DraftRecipe[]): T => produce(draft, (d) => { for (const recipe of recipes) recipe(d as never); });

describe('the variant recipes', () => {
  it('a new variant starts empty with its label and stage; with no stage there is no stageId', () => {
    const d = run(base(), addVariant('cvr_new', 'cold', 'stg_b'), addVariant('cvr_two', 'warm', undefined));
    expect(d.conditionVariants.at(-2)).toEqual({ id: 'cvr_new', label: 'cold', stageId: 'stg_b', participantIds: [], parameters: empty() });
    expect(Object.hasOwn(d.conditionVariants.at(-1) as object, 'stageId')).toBe(false);
  });

  it('label, stage, reorder and remove', () => {
    let d = run(base(), addVariant('cvr_new', 'cold', 'stg_b'), setVariantLabel(1, 'colder'), setVariantStage(1, 'stg_a'));
    expect(variantsViewOf(d)[1]).toMatchObject({ label: 'colder', stageId: 'stg_a' });
    d = run(d, setVariantStage(1, ''), moveVariant(1, -1));
    expect(variantsViewOf(d).map((v) => v.id)).toEqual(['cvr_new', 'cvr_1']);
    expect(variantsViewOf(d)[0]?.stageId).toBe('');
    d = run(d, removeVariant(0));
    expect(variantsViewOf(d).map((v) => v.id)).toEqual(['cvr_1']);
  });

  it('an override of a variant leaves the stage untouched', () => {
    const d = run(base(), setMeasureKind(variantLoc(0), 'temperature', 'value'), setMeasureNumber(variantLoc(0), 'temperature', 'value', 453), setMeasureChoice(variantLoc(0), 'temperature', 'unit', 'K'));
    expect(d.conditionVariants[0]?.parameters.temperature).toEqual({ kind: 'value', value: 453, unit: 'K' });
    expect(d.stages[1]?.parameters).toEqual(empty());
  });
});

describe('the words', () => {
  it('names the outcomes that hold the variant', () => {
    expect(outcomeNaming(base(), 'cvr_1', '443 K')).toBe("Outcome 1 holds only under '443 K'; Outcome 3 names '443 K'; change the outcomes' 'Holds under' first.");
    expect(outcomeNaming({ ...base(), outcomes: [base().outcomes[0]] }, 'cvr_1', '443 K')).toBe("Outcome 1 holds only under '443 K'; change the outcome's 'Holds under' first.");
    expect(outcomeNaming(base(), 'cvr_9', 'x')).toBeUndefined();
  });

  it('the summary line: label, stage, then only the overridden fields in the arrow\'s words', () => {
    expect(variantSummary(base(), 0)).toBe('443 K, excess acid: stage 2 temperature 443 K'); // no stageId: the first stage of kind reaction
    const named = run(base(), setVariantStage(0, 'stg_a'), setMeasureKind(variantLoc(0), 'pressure', 'qualitative'));
    expect(variantSummary(named, 0)).toBe('443 K, excess acid: stage 1 temperature 443 K, pressure (not complete)');
    const fresh = run(base(), addVariant('cvr_n', 'cold', 'stg_b'));
    expect(variantSummary(fresh, 1)).toBe('cold: stage 2 no overrides yet');
  });

  it('a reaction with no stage says "no stage to override"; the stage index follows the id', () => {
    const none = { ...base(), stages: [] };
    expect(variantSummary(none, 0)).toBe('443 K, excess acid: no stage to override, temperature 443 K');
    expect(stageIndexOf(base(), 'stg_a')).toBe(0);
    expect(stageIndexOf(base(), '')).toBe(1);
    expect(stageIndexOf(base(), 'stg_zz')).toBe(-1);
  });

  it('lists the overridden fields in the form\'s order', () => {
    const d = run(base(), setMeasureKind(variantLoc(0), 'time', 'qualitative'));
    expect(overridesOf(d, 0)).toEqual(['temperature', 'time']);
  });
});
