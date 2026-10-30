/**
 * Overview counts count CARDS (7.3a C3): in one pair (or one node's list) an example whose general reaction is in the same pair is not
 * counted; the folded examples are counted apart for "(+ n examples)". Tests written first (seen red: the functions took no lookup).
 */
import { describe, expect, it } from 'vitest';
import type { NavigatorCandidate } from '../../indexes/contracts';
import type { ExampleLookup } from '../family/examples';
import { examplesInPair, nodeReactionCounts, reactionsOf, type Pair } from './pairs';

const cand = (reactionId: string, outcomeId = 'out_1'): NavigatorCandidate => ({ reactionId, outcomeId }) as unknown as NavigatorCandidate;
const world: Record<string, { of?: string; generic?: boolean }> = { g: { generic: true }, e1: { of: 'g' }, e2: { of: 'g' }, plain: {} };
const lookup: ExampleLookup = { instanceOf: (id) => world[id]?.of, isGeneric: (id) => world[id]?.generic === true, sortKey: (id) => id };

describe('pair counts', () => {
  it('counts distinct cards; an example in the pair of its general reaction is folded', () => {
    const candidates = [cand('g'), cand('g', 'out_2'), cand('e1'), cand('e2'), cand('plain')];
    expect(reactionsOf(candidates, lookup)).toBe(2);
    expect(examplesInPair(candidates, lookup)).toBe(2);
  });
  it('an example whose general reaction is not in the pair is a card', () => {
    const candidates = [cand('e1'), cand('plain')];
    expect(reactionsOf(candidates, lookup)).toBe(2);
    expect(examplesInPair(candidates, lookup)).toBe(0);
  });
  it('without a lookup the count is the distinct reactions, as before', () => {
    expect(reactionsOf([cand('g'), cand('e1')])).toBe(2);
  });
});

describe('node counts', () => {
  const pair = (from: string, to: string, ids: string[]): Pair => ({ from, to, candidates: ids.map((id) => cand(id)) });
  it('out, in and loops count cards; the examples are counted apart', () => {
    const counts = nodeReactionCounts([pair('a', 'b', ['g', 'e1', 'plain']), pair('a', 'a', ['e2'])], lookup);
    expect(counts.get('a')).toMatchObject({ out: 2, loops: 1, outAll: 2, outExamples: 1 });
    expect(counts.get('b')).toMatchObject({ in: 2, inAll: 2, inExamples: 1 });
  });
  it('the same ids as before without a lookup', () => {
    expect(nodeReactionCounts([pair('a', 'b', ['g', 'e1'])]).get('a')).toMatchObject({ out: 2, outAll: 2 });
  });
});
