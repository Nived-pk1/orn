/**
 * Navigator hub expansion (step 5.4c; docs/GRAPH_SEMANTICS.md §3, §11): members, direction, the member cap and
 * the overflow node (ADR-028), member to member pairs, Unclassified, the hub record that is not a member, collapse
 * by removing the entry, the node and edge budget, filters, determinism. INV-22, INV-26.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_DEGREE_CAP, DEFAULT_TRAVERSAL_LIMITS, type Projection, type ProjectionRequest } from '..';
import type { AnyRecord, CanonicalState, RecordRef } from '../../schema';
import { anchorOn, chemClass, cl, contextOf, reaction, requestOf, sp, species, stateOf } from '@/test-support/graph-state';
import { checkInv26, checkStructure, reversedState } from '@/test-support/projection-harness';
import { navigatorProjection, UNCLASSIFIED_HUB_ID } from '.';

const rec = (ref: { kind: RecordRef['kind']; id: string }): RecordRef => ({ kind: ref.kind, id: ref.id });
const A = 'cls_hub-a';
const B = 'cls_hub-b';
const classes: AnyRecord[] = [chemClass('hub-a', 'A', 'compound_class'), chemClass('hub-b', 'B', 'compound_class'), anchorOn(rec(cl('hub-a')), 'hub-a'), anchorOn(rec(cl('hub-b')), 'hub-b')];
const inHub = (hub: 'hub-a' | 'hub-b', body: string): AnyRecord => species(body, body, { classes: [hub] });
const sub = (n: number): string => `a${String(n).padStart(2, '0')}`;

function arrow(slug: string, from: string, to: string): AnyRecord {
  return reaction({ slug, name: `Reaction ${slug}`, scope: 'specific', participants: [{ ref: sp(from), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp(to) }] }] });
}
/** Hub A has `n` substrates a00.., each reacting to its own product in hub B, plus b-sink species. */
function fan(n: number, extra: readonly AnyRecord[] = []): CanonicalState {
  const subs = Array.from({ length: n }, (_, i) => inHub('hub-a', sub(i)));
  const prods = Array.from({ length: n }, (_, i) => inHub('hub-b', `b${String(i).padStart(2, '0')}`));
  const rx = Array.from({ length: n }, (_, i) => arrow(`f${String(i).padStart(2, '0')}`, sub(i), `b${String(i).padStart(2, '0')}`));
  return stateOf(...classes, ...subs, ...prods, ...rx, ...extra);
}
const open = (...entries: [string, 'out' | 'in' | 'both'][]): Partial<ProjectionRequest> => ({ expansion: { expanded: entries.map(([nodeId, direction]) => ({ nodeId, direction })), collapsedEdgeIds: [] } });

function nav(state: CanonicalState, over: Partial<ProjectionRequest> = {}): Projection {
  const request = requestOf('navigator', over);
  const p = navigatorProjection.build(contextOf(state), request);
  expect([...checkStructure(p, request, state, 1), ...checkInv26(p, state)]).toEqual([]);
  return p;
}
const members = (p: Projection): string[] => p.nodes.filter((n) => n.role === 'member').map((n) => n.id);
const pairsOf = (p: Projection): string[] => [...new Set(p.edges.filter((e) => e.semantic === 'transforms_to').map((e) => `${e.from}>${e.to}`))].sort();

describe('members and direction', () => {
  const state = fan(3);

  it('direction out: the substrates of the hub become member nodes with one inferred membership edge to the hub', () => {
    const p = nav(state, open([A, 'out']));
    expect(members(p)).toEqual(['spc_a00', 'spc_a01', 'spc_a02']);
    expect(p.nodes.find((n) => n.id === 'spc_a00')).toMatchObject({ role: 'member', depth: 1, kind: 'species' });
    const membership = p.edges.filter((e) => e.semantic === 'membership');
    expect(membership.map((e) => [e.from, e.to, e.inferred])).toEqual([['spc_a00', A, true], ['spc_a01', A, true], ['spc_a02', A, true]]);
    expect(membership.every((e) => e.reactionId === undefined)).toBe(true);
    expect(pairsOf(p)).toEqual([`spc_a00>${B}`, `spc_a01>${B}`, `spc_a02>${B}`]);
  });

  it('direction in on the same hub shows nothing: hub A only has substrates; hub B has the products', () => {
    expect(members(nav(state, open([A, 'in'])))).toEqual([]);
    const p = nav(state, open([B, 'in']));
    expect(members(p)).toEqual(['spc_b00', 'spc_b01', 'spc_b02']);
    expect(pairsOf(p)).toEqual([`${A}>spc_b00`, `${A}>spc_b01`, `${A}>spc_b02`]);
  });

  it('both: a hub that is both an end and a start shows members of both kinds; the other direction stays on the hub', () => {
    const twoWay = fan(2, [arrow('back', 'b00', 'a00')]);
    const out = nav(twoWay, open([B, 'out']));
    expect(members(out)).toEqual(['spc_b00']);
    const both = nav(twoWay, open([A, 'both'], [B, 'both']));
    expect(members(both)).toEqual(['spc_a00', 'spc_a01', 'spc_b00', 'spc_b01']);
    expect(pairsOf(both)).toEqual(['spc_a00>spc_b00', 'spc_a01>spc_b01', 'spc_b00>spc_a00']);
  });

  it('member to member: when the other end is a shown member of an expanded hub the pair runs between members', () => {
    const p = nav(state, open([A, 'out'], [B, 'in']));
    expect(pairsOf(p)).toEqual(['spc_a00>spc_b00', 'spc_a01>spc_b01', 'spc_a02>spc_b02']);
  });

  it('a member of one expanded hub keeps its arrows to a non-expanded hub on the hub node', () => {
    const p = nav(state, open([A, 'out']));
    expect(p.edges.filter((e) => e.semantic === 'transforms_to').every((e) => e.to === B)).toBe(true);
  });

  it('collapse is removing the entry: the projection equals the one without expansion, apart from the key', () => {
    const plain = nav(state);
    const again = nav(state, open());
    expect(JSON.stringify(again)).toBe(JSON.stringify(plain));
    expect({ ...nav(state, open([A, 'out'])), key: '' }).not.toEqual({ ...plain, key: '' });
  });

  it('an entry that names no hub is ignored and two entries for one hub are merged', () => {
    expect(JSON.stringify({ ...nav(state, open(['spc_a00', 'out'], ['cls_nowhere', 'both'])), key: '' })).toBe(JSON.stringify({ ...nav(state), key: '' }));
    const merged = nav(state, open([A, 'out'], [A, 'in']));
    expect(JSON.stringify({ ...merged, key: '' })).toBe(JSON.stringify({ ...nav(state, open([A, 'both'])), key: '' }));
  });

  it('the filters decide the members: a filtered-out reaction brings no member', () => {
    const p = nav(state, { ...open([A, 'out']), filters: { scopes: [], topicIds: [], reagentFamilies: [], text: 'reaction f01' } });
    expect(members(p)).toEqual(['spc_a01']);
  });
});

describe('the hub record is not a member', () => {
  it('a species anchored as a hub has no members: the substance that IS the hub stays the hub', () => {
    const state = stateOf(anchorOn(rec(sp('lone')), 'lone'), species('lone', 'lone'), species('other', 'other'), arrow('xr', 'lone', 'other'));
    const plain = nav(state);
    const p = nav(state, open(['spc_lone', 'both']));
    expect(members(p)).toEqual([]);
    expect(JSON.stringify({ ...p, key: '' })).toBe(JSON.stringify({ ...plain, key: '' }));
  });
});

describe('the member cap and the overflow node (ADR-028)', () => {
  const n = DEFAULT_DEGREE_CAP + 3;
  // a14 has two arrows, so it ranks first although its ID is last.
  const state = fan(n, [arrow('again', sub(n - 1), 'b00')]);

  it('shows the cap per hub and direction, ranked by number of arrows then ID; the rest stay in the hub pairs', () => {
    const p = nav(state, open([A, 'out']));
    expect(members(p)).toHaveLength(DEFAULT_DEGREE_CAP);
    expect(members(p)).toContain(`spc_${sub(n - 1)}`);
    expect(members(p)).not.toContain(`spc_${sub(DEFAULT_DEGREE_CAP)}`);
    const overflow = p.nodes.find((x) => x.role === 'overflow');
    expect(overflow).toMatchObject({ id: `virtual:overflow:${A}`, kind: 'virtual', hiddenMembers: 3, hidden: { outgoing: 3, incoming: 0 } });
    expect(p.edges.find((e) => e.semantic === 'overflow')).toMatchObject({ from: `virtual:overflow:${A}`, to: A });
    expect(p.edges.find((e) => e.semantic === 'overflow')).not.toHaveProperty('reactionId');
    expect(p.bundles.find((b) => b.from === A && b.to === B)?.total).toBe(3);
  });

  it('one overflow node per hub covers both directions', () => {
    const p = nav(state, open([A, 'both']));
    expect(p.nodes.filter((x) => x.role === 'overflow')).toHaveLength(1);
  });

  it('every arrow is somewhere: the drawn totals plus the hidden candidates equal the filtered candidates', () => {
    const p = nav(state, open([A, 'out']));
    const bundled = new Set(p.bundles.flatMap((b) => b.edgeIds));
    const drawn = p.bundles.reduce((s, b) => s + b.total, 0) + p.edges.filter((e) => e.semantic === 'transforms_to' && !bundled.has(e.id)).length;
    expect(drawn + (p.truncation?.hiddenEdges ?? 0)).toBe(n + 1);
  });
});

describe('Unclassified', () => {
  it('can be expanded like any hub', () => {
    const state = stateOf(...classes, species('l1', 'l1'), species('l2', 'l2'), inHub('hub-a', 'xa'), arrow('u1', 'l1', 'xa'), arrow('u2', 'l2', 'xa'));
    const p = nav(state, open([UNCLASSIFIED_HUB_ID, 'out']));
    expect(members(p)).toEqual(['spc_l1', 'spc_l2']);
    expect(p.edges.filter((e) => e.semantic === 'membership').every((e) => e.to === UNCLASSIFIED_HUB_ID && !e.inferred)).toBe(true);
    expect(pairsOf(p)).toEqual([`spc_l1>${A}`, `spc_l2>${A}`]);
  });
});

describe('budgets', () => {
  const state = fan(5);

  it('members use up maxNodes; a hub that does not fit is not expanded and the truncation says how many members', () => {
    const limits = { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: 4 };
    const p = nav(state, { ...open([A, 'out']), limits });
    expect(members(p)).toEqual([]);
    expect(p.truncation).toMatchObject({ reason: 'max_nodes', hiddenNodeEstimate: 5, hiddenPairs: 0, hiddenEdges: 0 });
    const fits = nav(state, { ...open([A, 'out']), limits: { ...limits, maxNodes: 7 } });
    expect(members(fits)).toHaveLength(5);
    expect(fits.truncation).toBeNull();
  });

  it('hubs are expanded in ID order: the first that does not fit stops the rest', () => {
    const limits = { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: 4 };
    // A needs 5 nodes and does not fit; B (5 products) must not be expanded either, whatever the entry order.
    const p = nav(state, { ...open([B, 'in'], [A, 'out']), limits });
    expect(members(p)).toEqual([]);
    expect(p.truncation).toMatchObject({ reason: 'max_nodes', hiddenNodeEstimate: 10 });
  });

  it('the membership edges count against maxEdges', () => {
    const p = nav(state, { ...open([A, 'out']), limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxEdges: 7 } });
    expect(p.edges).toHaveLength(7);
    expect(p.edges.filter((e) => e.semantic === 'membership')).toHaveLength(5);
    expect(p.truncation).toMatchObject({ reason: 'max_edges', hiddenPairs: 3, hiddenEdges: 3 });
  });

  it('a request that cannot hold the members says max_edges', () => {
    const p = nav(state, { ...open([A, 'out']), limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxEdges: 3 } });
    expect(members(p)).toEqual([]);
    expect(p.truncation).toMatchObject({ reason: 'max_edges', hiddenNodeEstimate: 5 });
  });
});

describe('determinism', () => {
  it('the same request on reordered records is byte-identical', () => {
    const state = fan(DEFAULT_DEGREE_CAP + 2);
    const request = open([A, 'both'], [B, 'both']);
    expect(JSON.stringify(nav(reversedState(state), request))).toBe(JSON.stringify(nav(state, request)));
  });
});
