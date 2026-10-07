/**
 * Navigator projection (step 2.3): ADV-001, 014, 015, 046, 047, 048, 053 and the rules of
 * docs/GRAPH_SEMANTICS.md §3 (hub choice, stated versus inferred, Unclassified, Unanchored), limits (INV-22)
 * and INV-14 (no presentation records → the chemistry still projects).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAVERSAL_LIMITS, graphEdgeId, type Projection, type ProjectionRequest } from '..';
import type { AnyRecord, CanonicalState, RecordRef } from '../../schema';
import { anchorOn, chemClass, cl, contextOf, neverAsNode, reaction, reagent, requestOf, rg, sp, species, stateOf, type ScopeOf } from '@/test-support/graph-state';
import { reversedState } from '@/test-support/projection-harness';
import { navigatorProjection, UNCLASSIFIED_HUB_ID } from '.';

type Ref = ReturnType<typeof sp> | ReturnType<typeof cl>;
const rec = (ref: Ref): RecordRef => ({ kind: ref.kind, id: ref.id });

function nav(state: CanonicalState, over: Partial<ProjectionRequest> = {}, scopeOf?: ScopeOf): Projection {
  return navigatorProjection.build(contextOf(state, 1, scopeOf), requestOf('navigator', over));
}

interface Rx {
  readonly slug: string;
  readonly reactants: readonly Ref[];
  readonly products: readonly Ref[];
  readonly extra?: Parameters<typeof reaction>[0]['participants'];
  readonly primary?: number;
}
function rx({ slug, reactants, products, extra = [], primary }: Rx): AnyRecord {
  return reaction({
    slug,
    name: `Reaction ${slug}`,
    scope: 'specific',
    participants: [...reactants.map((ref, i) => ({ ref, role: 'reactant' as const, ...(primary === i ? { primary: true } : {}) })), ...extra],
    outcomes: [{ sel: 'major', products: products.map((ref) => ({ ref })) }],
  });
}

const hubA = chemClass('hub-a', 'Hub A', 'compound_class');
const hubB = chemClass('hub-b', 'Hub B', 'compound_class');
const hubC = chemClass('hub-c', 'Hub C', 'compound_class');
const anchors = [anchorOn(rec(cl('hub-a')), 'hub-a'), anchorOn(rec(cl('hub-b')), 'hub-b'), anchorOn(rec(cl('hub-c')), 'hub-c')];
const inA = (body: string) => species(body, body, { classes: ['hub-a'] });
const inB = (body: string) => species(body, body, { classes: ['hub-b'] });
const inC = (body: string) => species(body, body, { classes: ['hub-c'] });
const ids = (p: Projection): string[] => p.nodes.map((n) => n.id);

describe('ADV-001: A → B, one reaction', () => {
  const state = stateOf(hubA, hubB, ...anchors.slice(0, 2), inA('sp-a'), inB('sp-b'), rx({ slug: 'r1', reactants: [sp('sp-a')], products: [sp('sp-b')] }));

  it('yields one edge between the two hubs with a stable, hash-derived ID', () => {
    const p = nav(state);
    expect(p.edges).toHaveLength(1);
    const [edge] = p.edges;
    expect(edge).toMatchObject({ from: 'cls_hub-a', to: 'cls_hub-b', semantic: 'transforms_to', reactionId: 'rxn_r1', participantId: 'prt_r1-1', outcomeId: 'out_r1-1', productId: 'pdt_r1-1-1', layoutDirection: 'forward', selectivity: 'major' });
    expect(edge?.id).toBe(graphEdgeId({ view: 'navigator', from: 'cls_hub-a', to: 'cls_hub-b', semantic: 'transforms_to', reactionId: 'rxn_r1' as never, outcomeId: 'out_r1-1' as never, productId: 'pdt_r1-1-1' as never, participantId: 'prt_r1-1' as never }));
    expect(nav(state).edges[0]?.id).toBe(edge?.id);
    expect(p.unanchoredReactionIds).toEqual([]);
    expect(p.truncation).toBeNull();
  });

  it('shows hubs only (no species nodes) and draws class attachment as inferred', () => {
    const p = nav(state);
    expect(ids(p)).toEqual(['cls_hub-a', 'cls_hub-b']);
    expect(p.edges[0]?.inferred).toBe(true);
  });

  it('attachment through an anchored record referenced directly is stated', () => {
    const direct = stateOf(anchorOn(rec(sp('sp-a')), 'sp-a'), anchorOn(rec(sp('sp-b')), 'sp-b'), species('sp-a', 'A'), species('sp-b', 'B'), rx({ slug: 'r1', reactants: [sp('sp-a')], products: [sp('sp-b')] }));
    const p = nav(direct);
    expect(p.edges[0]).toMatchObject({ from: 'spc_sp-a', to: 'spc_sp-b', inferred: false });
    expect(p.nodes.map((n) => n.kind)).toEqual(['species', 'species']);
  });
});

describe('ADV-046 / ADV-047: divergent and convergent reactions', () => {
  const direct = (...bodies: string[]) => [...bodies.map((b) => species(b, b)), ...bodies.map((b) => anchorOn(rec(sp(b)), b))];

  it('ADV-046: A → B and A → C by separate reactions give two edges from A; A appears once', () => {
    const p = nav(stateOf(...direct('sp-a', 'sp-b', 'sp-c'), rx({ slug: 'r1', reactants: [sp('sp-a')], products: [sp('sp-b')] }), rx({ slug: 'r2', reactants: [sp('sp-a')], products: [sp('sp-c')] })));
    expect(p.edges.map((e) => [e.from, e.to, e.reactionId])).toEqual(expect.arrayContaining([['spc_sp-a', 'spc_sp-b', 'rxn_r1'], ['spc_sp-a', 'spc_sp-c', 'rxn_r2']]));
    expect(p.edges).toHaveLength(2);
    expect(ids(p).filter((id) => id === 'spc_sp-a')).toHaveLength(1);
  });

  it('ADV-047: A → C and B → C give two edges into C; C appears once', () => {
    const p = nav(stateOf(...direct('sp-a', 'sp-b', 'sp-c'), rx({ slug: 'r1', reactants: [sp('sp-a')], products: [sp('sp-c')] }), rx({ slug: 'r2', reactants: [sp('sp-b')], products: [sp('sp-c')] })));
    expect(p.edges.map((e) => e.to)).toEqual(['spc_sp-c', 'spc_sp-c']);
    expect(new Set(p.edges.map((e) => e.from))).toEqual(new Set(['spc_sp-a', 'spc_sp-b']));
    expect(ids(p).filter((id) => id === 'spc_sp-c')).toHaveLength(1);
  });

  it('two reactions between the same hubs stay two edges (never merged, INV-26)', () => {
    const p = nav(stateOf(...direct('sp-a', 'sp-b'), rx({ slug: 'r1', reactants: [sp('sp-a')], products: [sp('sp-b')] }), rx({ slug: 'r2', reactants: [sp('sp-a')], products: [sp('sp-b')] })));
    expect(p.edges).toHaveLength(2);
    expect(new Set(p.edges.map((e) => e.id)).size).toBe(2);
  });

  it('ADV-002: two reactions between the same hubs bundle into one bundle of 2, edges never merged', () => {
    const p = nav(stateOf(...direct('sp-a', 'sp-b'), rx({ slug: 'r1', reactants: [sp('sp-a')], products: [sp('sp-b')] }), rx({ slug: 'r2', reactants: [sp('sp-a')], products: [sp('sp-b')] })));
    expect(p.bundles).toHaveLength(1);
    expect(p.bundles[0]).toMatchObject({ from: 'spc_sp-a', to: 'spc_sp-b', edgeIds: [...p.edges.map((e) => e.id)].sort() });
  });

  it('A → B and B → A stay two opposite edges; no reversibility is drawn', () => {
    const p = nav(stateOf(...direct('sp-a', 'sp-b'), rx({ slug: 'r1', reactants: [sp('sp-a')], products: [sp('sp-b')] }), rx({ slug: 'r2', reactants: [sp('sp-b')], products: [sp('sp-a')] })));
    expect(p.edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(['spc_sp-a>spc_sp-b', 'spc_sp-b>spc_sp-a']);
  });

  it('a product that rolls up to the substrate hub is a self-loop arrow, not dropped', () => {
    const p = nav(stateOf(hubA, anchors[0] as AnyRecord, inA('sp-a'), inA('sp-b'), rx({ slug: 'r1', reactants: [sp('sp-a')], products: [sp('sp-b')] })));
    expect(p.edges).toHaveLength(1);
    expect(p.edges[0]).toMatchObject({ from: 'cls_hub-a', to: 'cls_hub-a' });
  });
});

describe('ADV-048: A + B → C', () => {
  const state = stateOf(hubA, hubB, hubC, ...anchors, inA('sp-a'), inB('sp-b'), inC('sp-c'), rx({ slug: 'r1', reactants: [sp('sp-a'), sp('sp-b')], products: [sp('sp-c')] }));

  it('draws one arrow from the carried substrate (the first reactant) to C; the co-reactant is a label, not a node', () => {
    const p = nav(state);
    expect(p.edges).toHaveLength(1);
    expect(p.edges[0]).toMatchObject({ from: 'cls_hub-a', to: 'cls_hub-c', participantId: 'prt_r1-1' });
  });

  it('honours isPrimarySubstrate over array order', () => {
    const flagged = stateOf(hubA, hubB, hubC, ...anchors, inA('sp-a'), inB('sp-b'), inC('sp-c'), rx({ slug: 'r1', reactants: [sp('sp-a'), sp('sp-b')], products: [sp('sp-c')], primary: 1 }));
    expect(nav(flagged).edges[0]).toMatchObject({ from: 'cls_hub-b', to: 'cls_hub-c', participantId: 'prt_r1-2' });
  });

  it('the canonical graph keeps 2 consumes + 1 produces: one participation each for A and B, one production of C', () => {
    const { indexes } = contextOf(state);
    expect(indexes.participationsOf(rec(sp('sp-a')))).toHaveLength(1);
    expect(indexes.participationsOf(rec(sp('sp-b')))).toHaveLength(1);
    expect(indexes.productionsOf(rec(sp('sp-c')))).toHaveLength(1);
  });

  it('a reaction with 3 main products gives 3 arrows from the substrate hub; coproducts and byproducts give none', () => {
    const many = reaction({
      slug: 'r9',
      name: 'Many',
      scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }],
      outcomes: [{ sel: 'mixture_component', products: [{ ref: sp('sp-b') }, { ref: sp('sp-c') }, { ref: sp('sp-b') }, { ref: sp('sp-c'), role: 'coproduct' }, { ref: sp('sp-a'), role: 'byproduct' }] }],
    });
    const p = nav(stateOf(hubA, hubB, hubC, ...anchors, inA('sp-a'), inB('sp-b'), inC('sp-c'), many));
    expect(p.edges).toHaveLength(3);
    expect(p.edges.map((e) => e.productId).sort()).toEqual(['pdt_r9-1-1', 'pdt_r9-1-2', 'pdt_r9-1-3']);
  });
});

describe('ADV-053: participants with no visual node', () => {
  const water = species('water', 'Water');
  const salt = species('salt', 'Salt');
  const base = [hubA, hubB, anchors[0] as AnyRecord, anchors[1] as AnyRecord, inA('sp-a'), inB('sp-b'), water, salt];

  it('a spectator makes no node and no edge, yet stays indexed', () => {
    const state = stateOf(...base, rx({ slug: 'r1', reactants: [sp('sp-a')], products: [sp('sp-b')], extra: [{ ref: sp('salt'), role: 'spectator' }] }));
    const p = nav(state);
    expect(ids(p)).not.toContain('spc_salt');
    expect(p.edges).toHaveLength(1);
    expect(p.edges.some((e) => e.participantId === 'prt_r1-2')).toBe(false);
    expect(contextOf(state).indexes.participationsOf(rec(sp('salt')))).toEqual([{ reactionId: 'rxn_r1', participantId: 'prt_r1-2', role: 'spectator' }]);
  });

  it('a spectator is never the carried substrate, even when it is the only participant flagged primary', () => {
    const only = reaction({ slug: 'r1', name: 'R', scope: 'specific', participants: [{ ref: sp('salt'), role: 'spectator', primary: true }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const p = nav(stateOf(...base, only));
    expect(p.edges).toEqual([]);
    expect(p.unanchoredReactionIds).toEqual(['rxn_r1']);
  });

  it('showAsNode = never: not a hub, not a substrate, not a product node', () => {
    const state = stateOf(
      ...base,
      neverAsNode(rec(sp('water')), 'water'),
      anchorOn(rec(sp('water')), 'water'),
      reaction({ slug: 'r1', name: 'Hydrolysis', scope: 'specific', participants: [{ ref: sp('water'), role: 'reactant' }, { ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }, { ref: sp('water') }] }] }),
    );
    const p = nav(state);
    expect(ids(p)).not.toContain('spc_water');
    expect(p.edges).toHaveLength(1);
    expect(p.edges[0]).toMatchObject({ from: 'cls_hub-a', to: 'cls_hub-b', participantId: 'prt_r1-2' });
  });
});

describe('ADV-014: disconnected components and the Unanchored list', () => {
  const lone = species('lone', 'Lone');
  const loner = species('loner', 'Loner');
  const state = stateOf(
    hubA, hubB, anchors[0] as AnyRecord, anchors[1] as AnyRecord,
    inA('sp-a'), inB('sp-b'), lone, loner,
    rx({ slug: 'r1', reactants: [sp('sp-a')], products: [sp('sp-b')] }),
    rx({ slug: 'r2', reactants: [sp('lone')], products: [sp('loner')] }),
    rx({ slug: 'r3', reactants: [], products: [sp('sp-b')] }),
    reaction({ slug: 'r4', name: 'Only byproducts', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b'), role: 'byproduct' }] }] }),
    rx({ slug: 'r5', reactants: [sp('lone')], products: [sp('sp-b')] }),
  );
  const p = nav(state);

  it('lists every reaction that reaches no anchored hub, sorted, and hides nothing', () => {
    expect(p.unanchoredReactionIds).toEqual(['rxn_r2', 'rxn_r3', 'rxn_r4']);
  });

  it('still draws hub-less reactions on the Unclassified hub; a reaction touching a real hub is not unanchored', () => {
    const unclassified = p.nodes.find((n) => n.id === UNCLASSIFIED_HUB_ID);
    expect(unclassified).toMatchObject({ kind: 'virtual', role: 'unclassified', flags: ['unanchored'] });
    const r2 = p.edges.filter((e) => e.reactionId === 'rxn_r2');
    expect(r2).toHaveLength(1);
    expect(r2[0]).toMatchObject({ from: UNCLASSIFIED_HUB_ID, to: UNCLASSIFIED_HUB_ID, inferred: false });
    const r5 = p.edges.filter((e) => e.reactionId === 'rxn_r5');
    expect(r5[0]).toMatchObject({ from: UNCLASSIFIED_HUB_ID, to: 'cls_hub-b' });
    expect(p.unanchoredReactionIds).not.toContain('rxn_r5');
  });

  it('every reaction is accounted for: it has an arrow or is listed as unanchored', () => {
    const drawn = new Set(p.edges.map((e) => e.reactionId));
    for (const id of Object.keys(state.records.reaction)) expect(drawn.has(id as never) || p.unanchoredReactionIds.includes(id as never), id).toBe(true);
  });

  it('with no presentation records at all (INV-14) the chemistry still projects onto Unclassified', () => {
    const bare = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), rx({ slug: 'r1', reactants: [sp('sp-a')], products: [sp('sp-b')] }));
    const q = nav(bare);
    expect(ids(q)).toEqual([UNCLASSIFIED_HUB_ID]);
    expect(q.edges).toHaveLength(1);
    expect(q.unanchoredReactionIds).toEqual(['rxn_r1']);
  });

  it('a dataset with nothing produces an empty projection, not an Unclassified node', () => {
    const q = nav(stateOf());
    expect(q).toMatchObject({ nodes: [], edges: [], unanchoredReactionIds: [], truncation: null });
  });

  it('an anchor whose target is missing is ignored, not a phantom node', () => {
    const q = nav(stateOf(anchorOn(rec(cl('hub-a')), 'hub-a')));
    expect(q.nodes).toEqual([]);
  });
});

describe('ADV-015: a species in several classes', () => {
  const two = (over: Partial<Parameters<typeof species>[2]>) => species('sp-x', 'X', over);
  const product = inB('sp-b');
  const build = (...records: AnyRecord[]) => stateOf(hubB, anchors[1] as AnyRecord, product, ...records, rx({ slug: 'r1', reactants: [sp('sp-x')], products: [sp('sp-b')] }));
  const hub1 = chemClass('hub-1', 'One', 'compound_class');
  const hub2 = chemClass('hub-2', 'Two', 'compound_class');
  const anchored = (...bodies: string[]) => bodies.map((b) => anchorOn(rec(cl(b)), b));

  it('picks the lowest class ID among equally near anchored classes, whatever the listing order', () => {
    for (const classes of [['hub-2', 'hub-1'], ['hub-1', 'hub-2']]) {
      const p = nav(build(hub1, hub2, ...anchored('hub-1', 'hub-2'), two({ classes })));
      expect(p.edges[0]).toMatchObject({ from: 'cls_hub-1', inferred: true });
    }
  });

  it('prefers the nearest anchored ancestor over a lower-ID farther one', () => {
    const child = chemClass('mid-c', 'Mid', 'compound_class', { parents: ['hub-1'] });
    const p = nav(build(hub1, hub2, child, ...anchored('hub-1', 'hub-2'), two({ classes: ['mid-c', 'hub-2'] })));
    expect(p.edges[0]).toMatchObject({ from: 'cls_hub-2', inferred: true });
    const q = nav(build(hub1, hub2, child, ...anchored('hub-1'), two({ classes: ['mid-c', 'hub-2'] })));
    expect(q.edges[0]).toMatchObject({ from: 'cls_hub-1', inferred: true });
  });

  it('an anchored species is its own stated hub even when its classes are anchored too', () => {
    const p = nav(build(hub1, ...anchored('hub-1'), anchorOn(rec(sp('sp-x')), 'sp-x'), anchorOn(rec(sp('sp-b')), 'sp-b'), two({ classes: ['hub-1'] })));
    expect(p.edges[0]).toMatchObject({ from: 'spc_sp-x', inferred: false });
  });

  it('an anchored class is its own hub; an unanchored class climbs to its parent', () => {
    const child = chemClass('mid-c', 'Mid', 'compound_class', { parents: ['hub-1'] });
    const generic = reaction({ slug: 'r1', name: 'G', scope: 'generic', participants: [{ ref: cl('mid-c'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: cl('hub-b') }] }] });
    const p = nav(stateOf(hubB, hub1, child, ...anchored('hub-1', 'hub-b'), generic));
    expect(p.edges[0]).toMatchObject({ from: 'cls_hub-1', to: 'cls_hub-b', inferred: true });
  });

  it('a cycle in class parents terminates and falls back to Unclassified', () => {
    const c1 = chemClass('cyc-1', 'C1', 'compound_class', { parents: ['cyc-2'] });
    const c2 = chemClass('cyc-2', 'C2', 'compound_class', { parents: ['cyc-1'] });
    const p = nav(build(c1, c2, two({ classes: ['cyc-1'] })));
    expect(p.edges[0]?.from).toBe(UNCLASSIFIED_HUB_ID);
  });

  it('a reagent participant resolves through its own classes like any substance', () => {
    const agent = reagent('rg-x', 'Agent', { families: ['oxidant'], classes: ['hub-1'] });
    const rxn = reaction({ slug: 'r1', name: 'R', scope: 'specific', participants: [{ ref: rg('rg-x'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const p = nav(stateOf(hubB, hub1, anchors[1] as AnyRecord, ...anchored('hub-1'), product, agent, rxn));
    expect(p.edges[0]).toMatchObject({ from: 'cls_hub-1', to: 'cls_hub-b', inferred: true });
  });
});

describe('filters, limits and edge data', () => {
  const base = [hubA, hubB, anchors[0] as AnyRecord, anchors[1] as AnyRecord, inA('sp-a'), inB('sp-b')];
  const two = stateOf(...base, rx({ slug: 'r1', reactants: [sp('sp-a')], products: [sp('sp-b')] }), rx({ slug: 'r2', reactants: [sp('sp-a')], products: [sp('sp-b')] }));

  it('the scope filter hides reactions outside the chosen scopes and reads scope from the context', () => {
    const scopeOf: ScopeOf = (ref) => (ref.id === 'rxn_r1' ? 'official' : 'outside');
    const p = nav(two, { filters: { scopes: ['official'], topicIds: [], reagentFamilies: [] } }, scopeOf);
    expect(p.edges.map((e) => e.reactionId)).toEqual(['rxn_r1']);
    expect(p.unanchoredReactionIds).toEqual([]);
  });

  it('the text filter matches folded reaction names', () => {
    const p = nav(two, { filters: { scopes: [], topicIds: [], reagentFamilies: [], text: 'REACTION r2' } });
    expect(p.edges.map((e) => e.reactionId)).toEqual(['rxn_r2']);
  });

  it('carries selectivity and condition-variant IDs from the outcome (ADV-008 graph part)', () => {
    const variant = reaction({
      slug: 'r1', name: 'V', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }],
      variants: [{ label: '413 K' }, { label: '443 K' }],
      outcomes: [{ sel: 'major', variants: [0], products: [{ ref: sp('sp-b') }] }, { sel: 'minor', variants: [1], products: [{ ref: sp('sp-b') }] }],
    });
    const p = nav(stateOf(...base, variant));
    expect(p.edges.map((e) => [e.selectivity, e.conditionVariantIds])).toEqual(expect.arrayContaining([['major', ['cvr_r1-1']], ['minor', ['cvr_r1-2']]]));
    expect(p.edges).toHaveLength(2);
  });

  // Step 5.4c (approved semantic change): maxEdges bounds drawn PATHS (pairs), not raw arrows. One pair of two
  // arrows under maxEdges 1 is drawn as one edge inside a bundle that knows its total: nothing is hidden.
  it('INV-22 (step 5.4c): maxEdges bounds drawn pairs; one pair under maxEdges 1 is a bundle of 2 with one edge and no truncation', () => {
    const p = nav(two, { limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxEdges: 1 } });
    expect(p.edges).toHaveLength(1);
    expect(p.bundles.map((b) => [b.edgeIds.length, b.total])).toEqual([[1, 2]]);
    expect(p.truncation).toBeNull();
    expect(p.nodes.every((n) => n.hidden.outgoing === 0 && n.hidden.incoming === 0)).toBe(true);
  });

  it('INV-22 (step 5.4c): pairs beyond maxEdges are counted exactly on the hubs and in the truncation', () => {
    const three = stateOf(...base, hubC, anchors[2] as AnyRecord, inC('sp-c'),
      rx({ slug: 'r1', reactants: [sp('sp-a')], products: [sp('sp-b')] }), rx({ slug: 'r2', reactants: [sp('sp-a')], products: [sp('sp-b')] }),
      rx({ slug: 'r3', reactants: [sp('sp-a')], products: [sp('sp-c')] }), rx({ slug: 'r4', reactants: [sp('sp-b')], products: [sp('sp-c')] }));
    const p = nav(three, { limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxEdges: 2 } });
    expect(p.edges).toHaveLength(2);
    expect(p.truncation).toEqual({ reason: 'max_edges', hiddenNodeEstimate: 0, hiddenPairs: 1, hiddenEdges: 1 });
    expect(p.nodes.find((n) => n.id === 'cls_hub-b')?.hidden).toEqual({ outgoing: 1, incoming: 0 });
    expect(p.nodes.find((n) => n.id === 'cls_hub-c')?.hidden).toEqual({ outgoing: 0, incoming: 1 });
  });

  it('INV-22: maxNodes hides whole hubs (and the arrows to them), never silently', () => {
    const p = nav(two, { limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: 1 } });
    expect(p.nodes).toHaveLength(1);
    expect(p.edges).toEqual([]);
    expect(p.truncation).toEqual({ reason: 'max_nodes', hiddenNodeEstimate: 1, hiddenPairs: 1, hiddenEdges: 2 });
  });

  it('an aborted request reports it', () => {
    const controller = new AbortController();
    controller.abort();
    const p = nav(two, { limits: { ...DEFAULT_TRAVERSAL_LIMITS, signal: controller.signal } });
    expect(p.truncation?.reason).toBe('aborted');
  });

  it('flags hubs: review_required, no_structure, has_caveat sources', () => {
    const flagged = stateOf(anchorOn(rec(sp('sp-a')), 'sp-a'), species('sp-a', 'A', { status: 'review_required', reasons: ['check'] }));
    expect(nav(flagged).nodes[0]?.flags).toEqual(['review_required', 'no_structure']);
  });

  it('the same request on reordered records is byte-identical', () => {
    expect(JSON.stringify(nav(reversedState(two)))).toBe(JSON.stringify(nav(two)));
  });
});
