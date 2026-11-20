import { describe, expect, it } from 'vitest';
import { CHAIN_MAX_CHAINS, CHAIN_PATH_BUDGET, familyChains, familyEdgesOf, type FamilyEdge } from './chains';

const e = (from: string, to: string, n = 1): FamilyEdge => ({ from, to, reactionIds: Array.from({ length: n }, (_, i) => `${from}${to}${i}`) });
const names = (r: ReturnType<typeof familyChains>): string[] => (r.ok ? r.chains.map((c) => c.families.join('>')) : []);

describe('familyEdgesOf: the exam scope (step 8.2b-fix, E4)', () => {
  const pairs = [
    { from: 'a', to: 'b', candidates: [{ reactionId: 'in1' }, { reactionId: 'out1' }] },
    { from: 'b', to: 'c', candidates: [{ reactionId: 'out2' }] },
  ];
  const inside = (id: string): boolean => id.startsWith('in');
  it('keeps only the reactions inside the scope, and drops an arrow left with none', () => {
    expect(familyEdgesOf(pairs, new Set(), inside)).toEqual([{ from: 'a', to: 'b', reactionIds: ['in1'] }]);
  });
  it('no scope function: every reaction counts (All exams)', () => {
    expect(familyEdgesOf(pairs, new Set()).map((edge) => edge.reactionIds)).toEqual([['in1', 'out1'], ['out2']]);
  });
});

describe('familyEdgesOf', () => {
  it('drops within-family pairs, the excluded family and empty pairs; reactions once each, sorted', () => {
    const edges = familyEdgesOf(
      [
        { from: 'a', to: 'a', candidates: [{ reactionId: 'r1' }] },
        { from: 'a', to: 'u', candidates: [{ reactionId: 'r2' }] },
        { from: 'a', to: 'b', candidates: [{ reactionId: 'r4' }, { reactionId: 'r3' }, { reactionId: 'r4' }] },
        { from: 'b', to: 'c', candidates: [] },
      ],
      new Set(['u']),
    );
    expect(edges).toEqual([{ from: 'a', to: 'b', reactionIds: ['r3', 'r4'] }]);
  });
});

describe('familyChains: up to 5 steps, the count (step C5)', () => {
  const longEdges = [e('a', 'b'), e('b', 'c'), e('c', 'd'), e('d', 'x'), e('x', 'z'), e('a', 'z'), e('a', 'm'), e('m', 'z')];
  it('finds a 5-step chain only when the limit allows it, shortest first', () => {
    expect(names(familyChains(longEdges, 'a', 'z', { maxSteps: 3 }))).toEqual(['a>z', 'a>m>z']);
    expect(names(familyChains(longEdges, 'a', 'z', { maxSteps: 5 }))).toEqual(['a>z', 'a>m>z', 'a>b>c>d>x>z']);
  });
  it('says how many chains exist when fewer are shown (never a silent cut)', () => {
    const edges = Array.from({ length: 23 }, (_, i) => `m${i}`).flatMap((m) => [e('a', m), e(m, 'z')]);
    const r = familyChains(edges, 'a', 'z');
    expect(r.ok && r.chains.length).toBe(CHAIN_MAX_CHAINS);
    expect(r.ok && r.total).toBe(23);
  });
  it('stays inside the path budget at 5 steps and says it may be incomplete', () => {
    const layers = Array.from({ length: 6 }, (_, k) => Array.from({ length: 8 }, (_, i) => `L${k}n${i}`));
    const edges = [...(layers[0] ?? []).map((n) => e('a', n)), ...layers.slice(0, 5).flatMap((l, k) => l.flatMap((n) => (layers[k + 1] ?? []).map((m) => e(n, m)))), ...(layers[5] ?? []).map((n) => e(n, 'z'))];
    const r = familyChains(edges, 'a', 'z', { maxSteps: 5 });
    expect(r.ok && r.truncated).toBe(true);
    expect(r.ok && r.total).toBeLessThanOrEqual(CHAIN_PATH_BUDGET);
  });
});

describe('familyChains', () => {
  it('finds a direct chain, and 2 and 3 steps, fewest steps first', () => {
    const edges = [e('a', 'd'), e('a', 'b'), e('b', 'd'), e('b', 'c'), e('c', 'd')];
    expect(names(familyChains(edges, 'a', 'd'))).toEqual(['a>d', 'a>b>d', 'a>b>c>d']);
  });
  it('does not return a chain of 4 steps', () => {
    const edges = [e('a', 'b'), e('b', 'c'), e('c', 'd'), e('d', 'x')];
    expect(familyChains(edges, 'a', 'x')).toEqual({ ok: true, chains: [], total: 0, truncated: false });
  });
  it('returns at most 5 chains', () => {
    const edges = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'].flatMap((m) => [e('a', m), e(m, 'z')]);
    const r = familyChains(edges, 'a', 'z');
    expect(r.ok && r.chains.length).toBe(CHAIN_MAX_CHAINS);
  });
  it('orders equal lengths by the weakest step (more reactions first), then by name', () => {
    const edges = [e('a', 'x', 5), e('x', 'z', 1), e('a', 'y', 3), e('y', 'z', 3), e('a', 'w', 3), e('w', 'z', 3)];
    expect(names(familyChains(edges, 'a', 'z'))).toEqual(['a>w>z', 'a>y>z', 'a>x>z']);
  });
  it('uses the names for the last tie-break when given', () => {
    const edges = [e('a', 'p', 2), e('p', 'z', 2), e('a', 'q', 2), e('q', 'z', 2)];
    const r = familyChains(edges, 'a', 'z', { nameOf: (id) => ({ p: 'Zeta', q: 'Alpha' })[id] ?? id });
    expect(names(r)).toEqual(['a>q>z', 'a>p>z']);
  });
  it('a family appears once in a chain', () => {
    const edges = [e('a', 'b'), e('b', 'a'), e('b', 'z')];
    expect(names(familyChains(edges, 'a', 'z'))).toEqual(['a>b>z']);
  });
  it('refuses from = to with words, and says when there is no chain', () => {
    const same = familyChains([e('a', 'b')], 'a', 'a');
    expect(same.ok).toBe(false);
    expect(!same.ok && same.reason).toMatch(/different/);
    expect(familyChains([e('a', 'b')], 'b', 'a')).toEqual({ ok: true, chains: [], total: 0, truncated: false });
  });
  it('stops at the path budget and says the answer may be incomplete', () => {
    const layer = (p: string) => Array.from({ length: 40 }, (_, i) => `${p}${String(i).padStart(2, '0')}`);
    const edges: FamilyEdge[] = [...layer('b').map((x) => e('a', x)), ...layer('b').flatMap((x) => layer('c').map((y) => e(x, y)))];
    expect(CHAIN_PATH_BUDGET).toBeLessThan(40 + 40 * 40);
    expect(familyChains(edges, 'a', 'nowhere')).toEqual({ ok: true, chains: [], total: 0, truncated: true });
  });
});
