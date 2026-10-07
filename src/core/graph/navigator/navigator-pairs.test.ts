/**
 * Navigator overview per ordered hub PAIR (step 5.4c; docs/GRAPH_SEMANTICS.md §11): totals after the filters,
 * bundles that know their size, admission of pairs by (total descending, from, to), the two-pass edge budget,
 * ranking inside a pair, self pairs, exact `hidden`, determinism. INV-22, INV-26.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_DEGREE_CAP, DEFAULT_TRAVERSAL_LIMITS, type Projection, type ProjectionRequest } from '..';
import type { AnyRecord, CanonicalState, RecordRef } from '../../schema';
import { anchorOn, chemClass, cl, contextOf, reaction, requestOf, sp, species, stateOf } from '@/test-support/graph-state';
import { checkInv26, checkStructure, reversedState } from '@/test-support/projection-harness';
import { navigatorProjection } from '.';

const rec = (ref: { kind: RecordRef['kind']; id: string }): RecordRef => ({ kind: ref.kind, id: ref.id });
const HUBS = ['hub-a', 'hub-b', 'hub-c', 'hub-d'] as const;
type Hub = (typeof HUBS)[number];
const classes = HUBS.flatMap((h) => [chemClass(h, h, 'compound_class'), anchorOn(rec(cl(h)), h)]) as AnyRecord[];
const members = HUBS.flatMap((h) => [1, 2, 3].map((n) => species(`${h}-${n}`, `${h}-${n}`, { classes: [h] }))) as AnyRecord[];
const chem = (...more: AnyRecord[]): CanonicalState => stateOf(...classes, ...members, ...more);

function rx(slug: string, from: Hub, to: Hub, sel: 'exclusive' | 'major' | 'minor' | 'trace' | 'unspecified' = 'major', text = `Reaction ${slug}`): AnyRecord {
  return reaction({
    slug, name: text, scope: 'specific',
    participants: [{ ref: sp(`${from}-1`), role: 'reactant' }],
    outcomes: [{ sel, products: [{ ref: sp(`${to}-2`) }] }],
  });
}
const many = (prefix: string, n: number, from: Hub, to: Hub, sel: 'major' | 'minor' | 'trace' = 'major'): AnyRecord[] =>
  Array.from({ length: n }, (_, i) => rx(`${prefix}${String(i).padStart(3, '0')}`, from, to, sel));

const limits = (maxEdges: number, maxNodes = DEFAULT_TRAVERSAL_LIMITS.maxNodes): ProjectionRequest['limits'] => ({ ...DEFAULT_TRAVERSAL_LIMITS, maxEdges, maxNodes });
function nav(state: CanonicalState, over: Partial<ProjectionRequest> = {}): Projection {
  const request = requestOf('navigator', over);
  const p = navigatorProjection.build(contextOf(state), request);
  expect([...checkStructure(p, request, state, 1), ...checkInv26(p, state)]).toEqual([]);
  return p;
}
const bundleOf = (p: Projection, from: string, to: string) => p.bundles.find((b) => b.from === from && b.to === to);
const A = 'cls_hub-a';
const B = 'cls_hub-b';
const C = 'cls_hub-c';
const D = 'cls_hub-d';

describe('totals and bundles', () => {
  const state = chem(...many('ab', 5, 'hub-a', 'hub-b'), rx('ac', 'hub-a', 'hub-c'));

  it('a bundle knows its FULL total even when fewer edges are drawn; a pair of one arrow is no bundle', () => {
    const p = nav(state, { limits: limits(2) });
    expect(p.edges).toHaveLength(2);
    expect(bundleOf(p, A, B)).toMatchObject({ total: 5 });
    expect(bundleOf(p, A, B)?.edgeIds).toHaveLength(1);
    expect(bundleOf(p, A, C)).toBeUndefined();
  });

  it('with room to spare every arrow of a small pair is drawn and total equals the drawn edges', () => {
    const p = nav(state);
    expect(p.edges).toHaveLength(6);
    expect(bundleOf(p, A, B)).toMatchObject({ total: 5 });
    expect(bundleOf(p, A, B)?.edgeIds).toHaveLength(5);
    expect(p.truncation).toBeNull();
  });

  it('the totals follow the request filters', () => {
    const p = nav(state, { filters: { scopes: [], topicIds: [], reagentFamilies: [], text: 'reaction ab00' } });
    expect(bundleOf(p, A, B)).toMatchObject({ total: 5 });
    const one = nav(state, { filters: { scopes: [], topicIds: [], reagentFamilies: [], text: 'reaction ab001' } });
    expect(one.bundles).toEqual([]);
    expect(one.edges).toHaveLength(1);
  });

  it('a pair larger than the degree cap draws the cap and keeps its total', () => {
    const p = nav(chem(...many('x', 20, 'hub-a', 'hub-b')));
    expect(p.edges).toHaveLength(DEFAULT_DEGREE_CAP);
    expect(bundleOf(p, A, B)).toMatchObject({ total: 20 });
    expect(p.truncation).toBeNull();
  });
});

describe('admission of pairs', () => {
  // Totals: A->B 3, B->C 2, C->D 2, A->C 1, D->A 1.
  const state = chem(...many('ab', 3, 'hub-a', 'hub-b'), ...many('bc', 2, 'hub-b', 'hub-c'), ...many('cd', 2, 'hub-c', 'hub-d'), rx('ac', 'hub-a', 'hub-c'), rx('da', 'hub-d', 'hub-a'));

  it('keeps the largest pairs, then the smaller ones by from and to, and says exactly what is not shown', () => {
    const p = nav(state, { limits: limits(3) });
    expect(p.edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual([`${A}>${B}`, `${B}>${C}`, `${C}>${D}`]);
    expect(p.truncation).toEqual({ reason: 'max_edges', hiddenNodeEstimate: 0, hiddenPairs: 2, hiddenEdges: 2 });
    expect(p.nodes.find((n) => n.id === A)?.hidden).toEqual({ outgoing: 1, incoming: 1 });
    expect(p.nodes.find((n) => n.id === C)?.hidden).toEqual({ outgoing: 0, incoming: 1 });
    expect(p.nodes.find((n) => n.id === D)?.hidden).toEqual({ outgoing: 1, incoming: 0 });
  });

  it('is independent of record IDs and insertion order: the same data in reverse gives the same projection', () => {
    expect(JSON.stringify(nav(reversedState(state), { limits: limits(3) }))).toBe(JSON.stringify(nav(state, { limits: limits(3) })));
  });

  it('every pair is admitted when maxEdges covers the pairs, even if not every arrow is drawn: no truncation', () => {
    const p = nav(state, { limits: limits(5) });
    expect(p.edges).toHaveLength(5);
    expect(p.truncation).toBeNull();
    expect(bundleOf(p, A, B)).toMatchObject({ total: 3 });
    expect(bundleOf(p, A, B)?.edgeIds).toHaveLength(1);
  });

  it('gives the spare edge budget to the smallest pairs first', () => {
    // 5 pairs, maxEdges 6: one spare edge. The smallest pair that can take one is B->C (2), before A->B (3).
    const p = nav(state, { limits: limits(6) });
    expect(bundleOf(p, B, C)?.edgeIds).toHaveLength(2);
    expect(bundleOf(p, C, D)?.edgeIds).toHaveLength(1);
    expect(bundleOf(p, A, B)?.edgeIds).toHaveLength(1);
  });

  it('maxNodes hides whole hubs: pairs to them are counted as not shown', () => {
    const p = nav(state, { limits: limits(800, 2) });
    expect(p.nodes.map((n) => n.id)).toEqual([A, B]);
    expect(p.edges).toHaveLength(3);
    expect(p.truncation).toEqual({ reason: 'max_nodes', hiddenNodeEstimate: 2, hiddenPairs: 4, hiddenEdges: 6 });
    expect(p.nodes.find((n) => n.id === B)?.hidden).toEqual({ outgoing: 2, incoming: 0 });
  });
});

describe('ranking inside a pair', () => {
  it('draws the best selectivity first, then the lowest reaction ID', () => {
    const state = chem(rx('r1', 'hub-a', 'hub-b', 'trace'), rx('r2', 'hub-a', 'hub-b', 'minor'), rx('r3', 'hub-a', 'hub-b', 'unspecified'), rx('r4', 'hub-a', 'hub-b', 'exclusive'), rx('r5', 'hub-a', 'hub-b', 'major'));
    const drawn = (maxEdges: number): (string | undefined)[] => nav(state, { limits: limits(maxEdges) }).edges.map((e) => e.reactionId).sort();
    expect(drawn(1)).toEqual(['rxn_r4']);
    expect(drawn(2)).toEqual(['rxn_r4', 'rxn_r5']);
    expect(drawn(4)).toEqual(['rxn_r3', 'rxn_r4', 'rxn_r5', 'rxn_r2'].sort());
  });
});

describe('a hub onto itself', () => {
  it('is an ordinary pair with from === to, bundled with its total, and not unanchored', () => {
    const state = chem(rx('s1', 'hub-a', 'hub-a'), rx('s2', 'hub-a', 'hub-a'), rx('s3', 'hub-a', 'hub-a'), rx('out1', 'hub-a', 'hub-b'));
    const p = nav(state);
    const loop = bundleOf(p, A, A);
    expect(loop).toMatchObject({ total: 3 });
    expect(p.edges.filter((e) => e.from === A && e.to === A)).toHaveLength(3);
    expect(p.unanchoredReactionIds).toEqual([]);
  });
});

describe('Unclassified', () => {
  it('is a node of its own pairs and counts as hidden like any hub', () => {
    const loose = [species('loose', 'loose'), species('loose2', 'loose2')] as AnyRecord[];
    const fromLoose = reaction({ slug: 'l1', name: 'Reaction l1', scope: 'specific', participants: [{ ref: sp('loose'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('hub-a-2') }] }] });
    const state = stateOf(...classes, ...members, ...loose, fromLoose, ...many('ab', 2, 'hub-a', 'hub-b'));
    const p = nav(state, { limits: limits(1) });
    expect(p.edges).toHaveLength(1);
    expect(p.truncation).toMatchObject({ reason: 'max_edges', hiddenPairs: 1, hiddenEdges: 1 });
    expect(p.nodes.find((n) => n.id === 'virtual:unclassified:hub')?.hidden).toEqual({ outgoing: 1, incoming: 0 });
  });
});
