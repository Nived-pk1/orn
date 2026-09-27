/**
 * Reaction explorer projection (step 2.4): docs/GRAPH_SEMANTICS.md §1, §7, §9 — the canonical bipartite
 * graph (never hub roll-up), condition-variant filtering, spectators/showAsNode, intermediates, stages.
 * ADV-008 graph part, ADV-024 graph part, ADV-027, ADV-051 graph part, ADV-054.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAVERSAL_LIMITS, graphEdgeId, type Projection, type ProjectionRequest } from '..';
import type { CanonicalState, ConditionVariantId, Reaction, RecordRef } from '../../schema';
import { contextOf, neverAsNode, reaction, reagent, requestOf, rg, sp, species, stateOf, type ScopeOf } from '@/test-support/graph-state';
import { checkProjection } from '@/test-support/projection-harness';
import { reactionExplorerProjection } from '.';

const rec = (ref: { kind: RecordRef['kind']; id: string }): RecordRef => ({ kind: ref.kind, id: ref.id });

function explore(state: CanonicalState, over: Partial<ProjectionRequest> = {}, scopeOf?: ScopeOf): Projection {
  return reactionExplorerProjection.build(contextOf(state, 1, scopeOf), requestOf('reaction_explorer', over));
}

describe('bipartite basics', () => {
  const A = species('sp-a', 'A');
  const B = species('sp-b', 'B');
  const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
  const state = stateOf(A, B, r1);

  it('draws substance and reaction nodes with consumes/produces edges, one per participant/product', () => {
    const p = explore(state, { focus: [rec(sp('sp-a'))] });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['rxn_r1', 'spc_sp-a', 'spc_sp-b']);
    expect(p.nodes.map((n) => n.kind).sort()).toEqual(['reaction', 'species', 'species']);
    const consumes = p.edges.find((e) => e.semantic === 'consumes');
    const produces = p.edges.find((e) => e.semantic === 'produces');
    expect(consumes).toMatchObject({ from: 'spc_sp-a', to: 'rxn_r1', reactionId: 'rxn_r1', participantId: 'prt_r1-1', conditionVariantIds: [] });
    expect(produces).toMatchObject({ from: 'rxn_r1', to: 'spc_sp-b', reactionId: 'rxn_r1', outcomeId: 'out_r1-1', productId: 'pdt_r1-1-1', selectivity: 'major', conditionVariantIds: [] });
    expect(consumes?.id).toBe(graphEdgeId({ view: 'reaction_explorer', from: 'spc_sp-a', to: 'rxn_r1', semantic: 'consumes', reactionId: 'rxn_r1' as never, participantId: 'prt_r1-1' as never }));
    expect(p.unanchoredReactionIds).toEqual([]);
    expect(p.truncation).toBeNull();
  });

  it('the seed is marked focus; discovered nodes are members', () => {
    const p = explore(state, { focus: [rec(sp('sp-a'))] });
    expect(p.nodes.find((n) => n.id === 'spc_sp-a')?.role).toBe('focus');
    expect(p.nodes.find((n) => n.id === 'rxn_r1')?.role).toBe('member');
  });

  it('focusing on the reaction itself reaches the same substances', () => {
    const p = explore(state, { focus: [{ kind: 'reaction', id: 'rxn_r1' }] });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['rxn_r1', 'spc_sp-a', 'spc_sp-b']);
  });

  it('an unknown seed is dropped, not a phantom node', () => {
    const p = explore(state, { focus: [{ kind: 'species', id: 'spc_missing' }] });
    expect(p.nodes).toEqual([]);
  });

  it('passes the projection harness (structure, INV-26, P-10)', () => {
    expect(checkProjection(reactionExplorerProjection, state, requestOf('reaction_explorer', { focus: [rec(sp('sp-a'))] }))).toEqual([]);
  });
});

describe('ADV-051: same compound twice in one reaction', () => {
  it('(a) reactant and product: two distinct edges, one node (self-loop shape)', () => {
    const A = species('sp-a', 'A');
    const r1 = reaction({ slug: 'r1', name: 'Self', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-a') }] }] });
    const state = stateOf(A, r1);
    const p = explore(state, { focus: [rec(sp('sp-a'))] });
    expect(p.nodes.map((n) => n.id)).toEqual(['rxn_r1', 'spc_sp-a']);
    expect(p.edges).toHaveLength(2);
    expect(new Set(p.edges.map((e) => e.id)).size).toBe(2);
    expect(p.edges.map((e) => e.semantic).sort()).toEqual(['consumes', 'produces']);
  });

  it('(b) twice as reactant: two participations, two consumes edges, one node', () => {
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const r1 = reaction({
      slug: 'r1', name: 'Double', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }, { ref: sp('sp-a'), role: 'reactant' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }],
    });
    const state = stateOf(A, B, r1);
    const p = explore(state, { focus: [rec(sp('sp-a'))] });
    const consumes = p.edges.filter((e) => e.semantic === 'consumes');
    expect(consumes).toHaveLength(2);
    expect(new Set(consumes.map((e) => e.participantId)).size).toBe(2);
    expect(p.nodes.filter((n) => n.id === 'spc_sp-a')).toHaveLength(1);
    expect(contextOf(state).indexes.participationsOf(rec(sp('sp-a')))).toHaveLength(2);
    expect(p.bundles).toHaveLength(1);
    expect(p.bundles[0]).toMatchObject({ from: 'spc_sp-a', to: 'rxn_r1', edgeIds: consumes.map((e) => e.id).sort() });
  });
});

describe('ADV-024: one reagent, two reactions, different outcomes', () => {
  it('the reagent node appears once with a consumes edge to each reaction', () => {
    const substrate = species('sub', 'Substrate');
    const koh = reagent('koh', 'KOH', { families: ['base'] });
    const prodS = species('prod-s', 'ProdS');
    const prodE = species('prod-e', 'ProdE');
    const aq = reaction({
      slug: 'aq', name: 'SN2', scope: 'specific',
      participants: [{ ref: sp('sub'), role: 'reactant' }, { ref: rg('koh'), role: 'reagent', phase: 'aq' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('prod-s') }] }],
    });
    const alc = reaction({
      slug: 'alc', name: 'E2', scope: 'specific',
      participants: [{ ref: sp('sub'), role: 'reactant' }, { ref: rg('koh'), role: 'reagent', phase: 'alc' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('prod-e') }] }],
    });
    const state = stateOf(substrate, koh, prodS, prodE, aq, alc);
    const p = explore(state, { focus: [rec(rg('koh'))] });
    expect(p.nodes.filter((n) => n.id === 'rgt_koh')).toHaveLength(1);
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['rgt_koh', 'rxn_alc', 'rxn_aq', 'spc_prod-e', 'spc_prod-s', 'spc_sub']);
    const fromKoh = p.edges.filter((e) => e.from === 'rgt_koh');
    expect(fromKoh.map((e) => e.to).sort()).toEqual(['rxn_alc', 'rxn_aq']);
    expect(new Set(fromKoh.map((e) => e.participantId)).size).toBe(2);
  });
});

describe('ADV-027 / ADV-053: showAsNode:never and spectators are never nodes or edges', () => {
  it('water (showAsNode: never) is excluded but stays indexed', () => {
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const water = species('water', 'Water');
    const r1 = reaction({
      slug: 'r1', name: 'Hydrolysis', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }, { ref: sp('water'), role: 'reactant' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }, { ref: sp('water') }] }],
    });
    const state = stateOf(A, B, water, neverAsNode(rec(sp('water')), 'water'), r1);
    const p = explore(state, { focus: [rec(sp('sp-a'))] });
    expect(p.nodes.map((n) => n.id)).not.toContain('spc_water');
    expect(p.edges.some((e) => e.from === 'spc_water' || e.to === 'spc_water')).toBe(false);
    expect(contextOf(state).indexes.participationsOf(rec(sp('water')))).toHaveLength(1);
    expect(contextOf(state).indexes.productionsOf(rec(sp('water')))).toHaveLength(1);
  });

  it('a spectator makes no node or edge, yet stays indexed', () => {
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const salt = species('salt', 'Salt');
    const r1 = reaction({
      slug: 'r1', name: 'R', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }, { ref: sp('salt'), role: 'spectator' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }],
    });
    const state = stateOf(A, B, salt, r1);
    const p = explore(state, { focus: [rec(sp('sp-a'))] });
    expect(p.nodes.map((n) => n.id)).not.toContain('spc_salt');
    expect(contextOf(state).indexes.participationsOf(rec(sp('salt')))).toHaveLength(1);
  });
});

describe('ADV-008: condition-variant filter', () => {
  const A = species('sp-a', 'A');
  const B = species('sp-b', 'B');
  const C = species('sp-c', 'C');
  const D = species('sp-d', 'D');
  const r1 = reaction({
    slug: 'r1', name: 'Variant', scope: 'specific',
    participants: [{ ref: sp('sp-a'), role: 'reactant' }, { ref: sp('sp-b'), role: 'catalyst' }],
    variants: [{ label: '413 K' }, { label: '443 K', members: [1] }],
    outcomes: [{ sel: 'major', variants: [0], products: [{ ref: sp('sp-c') }] }, { sel: 'minor', variants: [1], products: [{ ref: sp('sp-d') }] }],
  });
  const state = stateOf(A, B, C, D, r1);
  const variant = (n: 1 | 2): ConditionVariantId => `cvr_r1-${n}` as ConditionVariantId;

  it('with no variant selected, everything is shown and edges carry the variant IDs', () => {
    const p = explore(state, { focus: [rec(sp('sp-a'))] });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['rxn_r1', 'spc_sp-a', 'spc_sp-b', 'spc_sp-c', 'spc_sp-d']);
    expect(p.edges.find((e) => e.from === 'spc_sp-b')?.conditionVariantIds).toEqual([variant(2)]);
    expect(p.edges.find((e) => e.to === 'spc_sp-c')?.conditionVariantIds).toEqual([variant(1)]);
    expect(p.edges.find((e) => e.to === 'spc_sp-a')).toBeUndefined();
  });

  it('selecting 413 K keeps the common participant and its outcome, drops the 443 K-only ones', () => {
    const p = explore(state, { focus: [rec(sp('sp-a'))], conditionVariantId: variant(1) });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['rxn_r1', 'spc_sp-a', 'spc_sp-c']);
  });

  it('selecting 443 K keeps the variant-scoped catalyst and its outcome, drops the other', () => {
    const p = explore(state, { focus: [rec(sp('sp-a'))], conditionVariantId: variant(2) });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['rxn_r1', 'spc_sp-a', 'spc_sp-b', 'spc_sp-d']);
  });

  it('different variant selections get different cache keys', () => {
    const none = explore(state, { focus: [rec(sp('sp-a'))] });
    const first = explore(state, { focus: [rec(sp('sp-a'))], conditionVariantId: variant(1) });
    const second = explore(state, { focus: [rec(sp('sp-a'))], conditionVariantId: variant(2) });
    expect(new Set([none.key, first.key, second.key]).size).toBe(3);
  });

  it('passes the projection harness under every variant selection', () => {
    for (const cv of [undefined, variant(1), variant(2)]) {
      expect(checkProjection(reactionExplorerProjection, state, requestOf('reaction_explorer', { focus: [rec(sp('sp-a'))], conditionVariantId: cv }))).toEqual([]);
    }
  });
});

describe('ADV-054: intermediates are stored on the reaction, never graph nodes or edges', () => {
  it('an intermediate produces nothing in the graph but stays on the record', () => {
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const carbocation = species('carbocation', 'Carbocation');
    const r1 = reaction({
      slug: 'r1', name: 'R', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }],
      intermediates: [{ intKind: 'carbocation', ref: sp('carbocation') }],
    });
    const state = stateOf(A, B, carbocation, r1);
    const p = explore(state, { focus: [rec(sp('sp-a'))] });
    expect(p.nodes.map((n) => n.id)).not.toContain('spc_carbocation');
    expect(p.edges.some((e) => e.from === 'spc_carbocation' || e.to === 'spc_carbocation')).toBe(false);
    expect(p.edges).toHaveLength(2);
    const stored = contextOf(state).indexes.get('rxn_r1') as Reaction;
    expect(stored.intermediates).toHaveLength(1);
    expect(stored.intermediates[0]).toMatchObject({ intermediateKind: 'carbocation', ref: sp('carbocation') });
  });
});

describe('stages: a staged reaction behaves like any other for the bipartite graph', () => {
  it('participants from every stage all get consumes edges', () => {
    const mgbr = species('mgbr', 'CH3MgBr');
    const ketone = species('ketone', 'Propanone');
    const h3o = reagent('h3o', 'H3O+', { families: ['acid'] });
    const alcohol = species('alcohol', '2-methylpropan-2-ol');
    const r1 = reaction({
      slug: 'r1', name: 'Grignard', scope: 'specific',
      participants: [{ ref: sp('mgbr'), role: 'reactant' }, { ref: sp('ketone'), role: 'reactant' }, { ref: rg('h3o'), role: 'workup_reagent' }],
      stages: [{ kind: 'reaction', members: [0, 1] }, { kind: 'workup', members: [2] }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('alcohol') }] }],
    });
    const state = stateOf(mgbr, ketone, h3o, alcohol, r1);
    const p = explore(state, { focus: [{ kind: 'reaction', id: 'rxn_r1' }] });
    const consumes = p.edges.filter((e) => e.semantic === 'consumes');
    expect(consumes.map((e) => e.from).sort()).toEqual(['rgt_h3o', 'spc_ketone', 'spc_mgbr']);
    expect(checkProjection(reactionExplorerProjection, state, requestOf('reaction_explorer', { focus: [{ kind: 'reaction', id: 'rxn_r1' }] }))).toEqual([]);
  });
});

describe('limits (INV-22)', () => {
  it('maxDepth truncates a chain of reactions, never silently', () => {
    const chainLen = 5;
    const speciesRecords = Array.from({ length: chainLen + 1 }, (_, i) => species(`s${i}`, `S${i}`));
    const reactions = Array.from({ length: chainLen }, (_, i) =>
      reaction({ slug: `c${i}`, name: `C${i}`, scope: 'specific', participants: [{ ref: sp(`s${i}`), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp(`s${i + 1}`) }] }] }));
    const state = stateOf(...speciesRecords, ...reactions);
    const p = explore(state, { focus: [rec(sp('s0'))], limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxDepth: 2 } });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['rxn_c0', 'spc_s0', 'spc_s1'].sort());
    expect(p.truncation?.reason).toBe('max_depth');
  });
});
