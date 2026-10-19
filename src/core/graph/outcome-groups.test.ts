/** The outcome-group rule (outcome groups step, part 2): outcomes of one reaction are grouped by their condition-variant set. */
import { describe, expect, it } from 'vitest';
import { groupOutcomes, outcomeWordOf } from './outcome-groups';

const o = (id: string, selectivity: string, variants: readonly string[] = []) => ({ id, selectivity, conditionVariantIds: variants });
const idsOf = (groups: ReturnType<typeof groupOutcomes<ReturnType<typeof o>>>): string[][] => groups.map((g) => g.outcomes.map((x) => x.id));

describe('groupOutcomes', () => {
  it('two outcomes with the same set are in the same group (two empty sets: all variants)', () => {
    const groups = groupOutcomes([o('a', 'major'), o('b', 'minor')]);
    expect(idsOf(groups)).toEqual([['a', 'b']]);
    expect(groups[0]?.conditionVariantIds).toEqual([]);
  });

  it('the same variants in another order are the same set', () => {
    expect(idsOf(groupOutcomes([o('a', 'major', ['v1', 'v2']), o('b', 'minor', ['v2', 'v1', 'v1'])]))).toEqual([['a', 'b']]);
  });

  it('two disjoint sets are two groups, in the order of their first outcome', () => {
    const groups = groupOutcomes([o('a', 'major', ['v2']), o('b', 'major', ['v1']), o('c', 'minor', ['v2'])]);
    expect(idsOf(groups)).toEqual([['a', 'c'], ['b']]);
    expect(groups.map((g) => g.conditionVariantIds)).toEqual([['v2'], ['v1']]);
    expect(new Set(groups.map((g) => g.key)).size).toBe(2);
  });

  it('an empty set is a group of its own, apart from outcomes that name variants', () => {
    expect(idsOf(groupOutcomes([o('a', 'major'), o('b', 'major', ['v1'])]))).toEqual([['a'], ['b']]);
  });

  it('partly overlapping sets are different sets (no merging, nothing dropped)', () => {
    expect(idsOf(groupOutcomes([o('a', 'major', ['v1', 'v2']), o('b', 'minor', ['v2', 'v3'])]))).toEqual([['a'], ['b']]);
  });

  it('within a group: exclusive, major, minor, trace, mixture component, unspecified, then the stored order', () => {
    const stored = [o('u', 'unspecified'), o('m2', 'minor'), o('x', 'exclusive'), o('t', 'trace'), o('j1', 'major'), o('c', 'mixture_component'), o('j2', 'major'), o('m1', 'minor')];
    expect(idsOf(groupOutcomes(stored))).toEqual([['x', 'j1', 'j2', 'm2', 'm1', 't', 'c', 'u']]);
  });

  it('a selectivity this rule does not know goes last and keeps the stored order', () => {
    expect(idsOf(groupOutcomes([o('z', 'strange'), o('a', 'unspecified'), o('y', 'strange')]))).toEqual([['a', 'z', 'y']]);
  });

  it('nothing in, nothing out; every outcome is in exactly one group', () => {
    expect(groupOutcomes([])).toEqual([]);
    const stored = [o('a', 'major', ['v1']), o('b', 'minor'), o('c', 'trace', ['v1', 'v2']), o('d', 'minor', ['v1'])];
    expect(groupOutcomes(stored).flatMap((g) => g.outcomes.map((x) => x.id)).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('outcomeWordOf', () => {
  it('is the selectivity word, with the regiochemistry after a middle dot', () => {
    expect(outcomeWordOf('major', 'Saytzeff')).toBe('major · Saytzeff');
    expect(outcomeWordOf('mixture_component', 'para')).toBe('mixture component · para');
  });

  it('is the selectivity word alone without a regiochemistry (or an empty one)', () => {
    expect(outcomeWordOf('minor', undefined)).toBe('minor');
    expect(outcomeWordOf('minor', '  ')).toBe('minor');
  });

  it('is the regiochemistry alone when the selectivity has no word; null when neither', () => {
    expect(outcomeWordOf('unspecified', 'Hofmann')).toBe('Hofmann');
    expect(outcomeWordOf('unspecified', undefined)).toBeNull();
  });
});
