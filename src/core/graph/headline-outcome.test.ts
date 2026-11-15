/** The headline outcome (step 8.4s, S8; audit RU-01): exclusive, then major, then the stored order, within the first outcome group. */
import { describe, expect, it } from 'vitest';
import { headlineOutcomeOf } from './headline-outcome';

const o = (name: string, selectivity: string, variants: string[] = []) => ({ name, selectivity, conditionVariantIds: variants });

describe('headlineOutcomeOf', () => {
  it('has no headline for no outcome', () => {
    expect(headlineOutcomeOf([])).toEqual({ headline: undefined, alternatives: [] });
  });
  it('takes the major outcome whatever the stored order', () => {
    expect(headlineOutcomeOf([o('minor one', 'minor'), o('major one', 'major')]).headline?.name).toBe('major one');
    expect(headlineOutcomeOf([o('major one', 'major'), o('minor one', 'minor')]).headline?.name).toBe('major one');
  });
  it('an exclusive outcome comes before a major one', () => {
    expect(headlineOutcomeOf([o('major', 'major'), o('only', 'exclusive'), o('minor', 'minor')]).headline?.name).toBe('only');
  });
  it('equal outcomes keep their stored order', () => {
    expect(headlineOutcomeOf([o('first', 'major'), o('second', 'major')]).headline?.name).toBe('first');
    expect(headlineOutcomeOf([o('a', 'unspecified'), o('b', 'unspecified')]).headline?.name).toBe('a');
  });
  it('the first group opens the line; a later group with the same selectivity is an alternative by conditions', () => {
    const answer = headlineOutcomeOf([o('cold', 'major', ['v1']), o('cold side', 'minor', ['v1']), o('hot', 'major', ['v2'])]);
    expect(answer.headline?.name).toBe('cold');
    expect(answer.alternatives.map((alt) => alt.name)).toEqual(['hot']);
  });
  it('a later group that is not as selective is not an alternative', () => {
    const answer = headlineOutcomeOf([o('cold', 'major', ['v1']), o('hot', 'minor', ['v2'])]);
    expect(answer.alternatives).toEqual([]);
  });
  it('bounded: at most two alternatives', () => {
    const answer = headlineOutcomeOf([o('a', 'major', ['1']), o('b', 'major', ['2']), o('c', 'major', ['3']), o('d', 'major', ['4'])]);
    expect(answer.alternatives.map((alt) => alt.name)).toEqual(['b', 'c']);
  });
  it('a value the rule does not know is the same as any other: it ranks last, and ties by stored order', () => {
    expect(headlineOutcomeOf([o('x', 'strange'), o('y', 'major')]).headline?.name).toBe('y');
  });
});
