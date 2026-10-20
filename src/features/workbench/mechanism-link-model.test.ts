/** The reaction's mechanism links and each outcome's mechanism and variant as recipes (step 6.5a part 5, D5). */
import { describe, expect, it } from 'vitest';
import { addMechanismLink, linkedIdsOf, outcomeLinkOf, outcomeNumbersUsing, removeMechanismLink, setOutcomeMechanism, setOutcomeVariant, usingWords } from './mechanism-link-model';

type Fields = Record<string, unknown>;
const base = (): Fields => ({
  mechanismIds: ['mec_a'],
  outcomes: [{ id: 'out_1', mechanism: { mechanismId: 'mec_a', variantId: 'mvr_x' } }, { id: 'out_2' }, { id: 'out_3', mechanism: { mechanismId: 'mec_a' } }],
});
const run = (recipe: (draft: Fields) => void): Fields => {
  const copy = structuredClone(base());
  recipe(copy);
  return copy;
};
const outcome = (draft: Fields, i: number): Fields => (draft['outcomes'] as Fields[])[i] as Fields;

describe('reaction links', () => {
  it('adds a mechanism once and removes by position', () => {
    expect(run(addMechanismLink('mec_b'))['mechanismIds']).toEqual(['mec_a', 'mec_b']);
    expect(run(addMechanismLink('mec_a'))['mechanismIds']).toEqual(['mec_a']);
    expect(run(removeMechanismLink(0))['mechanismIds']).toEqual([]);
    expect(linkedIdsOf(base())).toEqual(['mec_a']);
    expect(linkedIdsOf({})).toEqual([]);
  });
  it('says which outcomes use a mechanism, in words', () => {
    expect(outcomeNumbersUsing(base(), 'mec_a')).toEqual([1, 3]);
    expect(usingWords([2])).toBe('Outcome 2 uses this mechanism; change that link first');
    expect(usingWords([1, 3])).toBe('Outcomes 1 and 3 use this mechanism; change those links first');
    expect(usingWords([1, 2, 3])).toBe('Outcomes 1, 2 and 3 use this mechanism; change those links first');
    expect(usingWords([])).toBeUndefined();
  });
});

describe('an outcome link', () => {
  it('linking a mechanism sets it with no variant and links it to the reaction too (one edit)', () => {
    const next = run(setOutcomeMechanism(1, 'mec_b'));
    expect(outcome(next, 1)['mechanism']).toEqual({ mechanismId: 'mec_b' });
    expect(next['mechanismIds']).toEqual(['mec_a', 'mec_b']);
  });
  it('changing the mechanism drops the variant (it belongs to the other mechanism); the same mechanism keeps it', () => {
    expect(outcome(run(setOutcomeMechanism(0, 'mec_b')), 0)['mechanism']).toEqual({ mechanismId: 'mec_b' });
    expect(outcome(run(setOutcomeMechanism(0, 'mec_a')), 0)['mechanism']).toEqual({ mechanismId: 'mec_a', variantId: 'mvr_x' });
  });
  it('none removes the link and leaves the reaction link alone', () => {
    const next = run(setOutcomeMechanism(0, ''));
    expect(Object.hasOwn(outcome(next, 0), 'mechanism')).toBe(false);
    expect(next['mechanismIds']).toEqual(['mec_a']);
  });
  it('a variant is set on an outcome that links a mechanism, and removed with an empty choice', () => {
    expect(outcome(run(setOutcomeVariant(2, 'mvr_y')), 2)['mechanism']).toEqual({ mechanismId: 'mec_a', variantId: 'mvr_y' });
    expect(outcome(run(setOutcomeVariant(0, '')), 0)['mechanism']).toEqual({ mechanismId: 'mec_a' });
    expect(Object.hasOwn(outcome(run(setOutcomeVariant(1, 'mvr_y')), 1), 'mechanism')).toBe(false);
  });
  it('reads the link of an outcome', () => {
    expect(outcomeLinkOf(base(), 0)).toEqual({ mechanismId: 'mec_a', variantId: 'mvr_x' });
    expect(outcomeLinkOf(base(), 1)).toEqual({ mechanismId: '', variantId: '' });
  });
});
