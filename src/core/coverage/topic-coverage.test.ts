/**
 * 7.7 A: the ONE coverage rule. A topic's coverage in an exam version comes from the NEAREST topic (itself first, then its ancestors) that has
 * any entry in that version; when that topic has several entries the strongest wins (included > partial > excluded); none = not covered.
 * Written first (seen red: the module was absent).
 */
import { describe, expect, it } from 'vitest';
import { coverageOfTopic, strongestCoverage } from './topic-coverage';

const tree: Record<string, string | undefined> = { subj: undefined, chap: 'subj', sect: 'chap', deep: 'sect', other: 'subj' };
const parentOf = (id: string): string | undefined => tree[id];
const version = (...units: readonly (readonly [string, 'included' | 'partial' | 'excluded'])[][]) => ({
  units: units.map((rows) => ({ topicCoverage: rows.map(([topicId, coverage]) => ({ topicId, coverage })) })),
});

describe('coverageOfTopic', () => {
  it('a) the nearest topic with an entry decides: an explicit excluded subtopic beats an included chapter above it', () => {
    const map = strongestCoverage(version([['chap', 'included'], ['sect', 'excluded']]));
    expect(coverageOfTopic(map, 'sect', parentOf)).toBe('excluded');
    expect(coverageOfTopic(map, 'deep', parentOf)).toBe('excluded');
    expect(coverageOfTopic(map, 'chap', parentOf)).toBe('included');
  });

  it('a) the other way round: an included section under an excluded chapter is covered', () => {
    const map = strongestCoverage(version([['chap', 'excluded'], ['sect', 'partial']]));
    expect(coverageOfTopic(map, 'deep', parentOf)).toBe('partial');
    expect(coverageOfTopic(map, 'chap', parentOf)).toBe('excluded');
  });

  it('a) a topic with no entry inherits from its nearest listed ancestor', () => {
    const map = strongestCoverage(version([['chap', 'partial']]));
    expect(coverageOfTopic(map, 'deep', parentOf)).toBe('partial');
  });

  it('b) one topic with several entries (two units): included > partial > excluded, whatever the order', () => {
    expect(coverageOfTopic(strongestCoverage(version([['chap', 'excluded']], [['chap', 'partial']])), 'chap', parentOf)).toBe('partial');
    expect(coverageOfTopic(strongestCoverage(version([['chap', 'partial']], [['chap', 'excluded']])), 'chap', parentOf)).toBe('partial');
    expect(coverageOfTopic(strongestCoverage(version([['chap', 'partial']], [['chap', 'included']], [['chap', 'excluded']])), 'chap', parentOf)).toBe('included');
    expect(coverageOfTopic(strongestCoverage(version([['chap', 'excluded']], [['chap', 'excluded']])), 'chap', parentOf)).toBe('excluded');
  });

  it('c) no entry on the topic or any ancestor = not covered', () => {
    const map = strongestCoverage(version([['other', 'included']]));
    expect(coverageOfTopic(map, 'deep', parentOf)).toBeUndefined();
    expect(coverageOfTopic(map, 'other', parentOf)).toBe('included');
  });

  it('is bounded: a parent cycle ends instead of looping', () => {
    const loop = (id: string): string | undefined => (id === 'x' ? 'y' : 'x');
    expect(coverageOfTopic(strongestCoverage(version([['z', 'included']])), 'x', loop)).toBeUndefined();
  });
});
