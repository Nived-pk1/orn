/**
 * Reagent explorer projection (step 2.6): docs/GRAPH_SEMANTICS.md §7 — one hop, reagent → reactions.
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalState, RecordRef } from '../../schema';
import { contextOf, reaction, reagent, requestOf, rg, sp, species, stateOf } from '@/test-support/graph-state';
import { checkProjection } from '@/test-support/projection-harness';
import { reagentExplorerProjection } from '.';
import type { Projection, ProjectionRequest } from '..';

const ref = (r: { kind: RecordRef['kind']; id: string }): RecordRef => ({ kind: r.kind, id: r.id });

function explore(state: CanonicalState, over: Partial<ProjectionRequest> = {}): Projection {
  return reagentExplorerProjection.build(contextOf(state, 1), requestOf('reagent_explorer', over));
}

describe('reagent explorer basics', () => {
  const koh = reagent('koh', 'KOH', { families: ['base'] });
  const sub = species('sub', 'Substrate');
  const prodA = species('prod-a', 'ProdA');
  const prodB = species('prod-b', 'ProdB');
  const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sub'), role: 'reactant' }, { ref: rg('koh'), role: 'reagent' }], outcomes: [{ sel: 'major', products: [{ ref: sp('prod-a') }] }] });
  const r2 = reaction({ slug: 'r2', name: 'R2', scope: 'specific', participants: [{ ref: sp('sub'), role: 'reactant' }, { ref: rg('koh'), role: 'reagent' }], outcomes: [{ sel: 'major', products: [{ ref: sp('prod-b') }] }] });
  const state = stateOf(koh, sub, prodA, prodB, r1, r2);

  it('finds every reaction that uses the reagent, via uses_reagent edges', () => {
    const p = explore(state, { focus: [ref(rg('koh'))] });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['rgt_koh', 'rxn_r1', 'rxn_r2']);
    expect(p.edges).toHaveLength(2);
    expect(p.edges.every((e) => e.semantic === 'uses_reagent' && e.to === 'rgt_koh')).toBe(true);
    expect(p.edges.map((e) => e.from).sort()).toEqual(['rxn_r1', 'rxn_r2']);
  });

  it('the seed reagent is focus; reactions are members', () => {
    const p = explore(state, { focus: [ref(rg('koh'))] });
    expect(p.nodes.find((n) => n.id === 'rgt_koh')?.role).toBe('focus');
    expect(p.nodes.find((n) => n.id === 'rxn_r1')?.role).toBe('member');
  });

  it('reactions are a dead end: nothing else is discovered from them', () => {
    const p = explore(state, { focus: [ref(rg('koh'))] });
    expect(p.nodes.map((n) => n.id)).not.toContain('spc_sub');
    expect(p.nodes.map((n) => n.id)).not.toContain('spc_prod-a');
  });

  it('a reaction seed (not a reagent) is dropped, not a phantom node', () => {
    const p = explore(state, { focus: [{ kind: 'reaction', id: 'rxn_r1' }] });
    expect(p.nodes).toEqual([]);
  });

  it('respects the standard filters (scope)', () => {
    const scopeOf = (r: RecordRef) => (r.id === 'rxn_r1' ? 'official' as const : 'outside' as const);
    const p = reagentExplorerProjection.build(contextOf(state, 1, scopeOf), requestOf('reagent_explorer', { focus: [ref(rg('koh'))], filters: { scopes: ['official'], topicIds: [], reagentFamilies: [] } }));
    expect(p.edges.map((e) => e.from)).toEqual(['rxn_r1']);
  });

  it('passes the projection harness (structure, INV-26, P-10)', () => {
    expect(checkProjection(reagentExplorerProjection, state, requestOf('reagent_explorer', { focus: [ref(rg('koh'))] }))).toEqual([]);
  });
});

describe('ADV-051-style: same reagent twice in one reaction', () => {
  it('two participations, two edges, one bundle of 2', () => {
    const koh = reagent('koh', 'KOH', { families: ['base'] });
    const sub = species('sub', 'Substrate');
    const prod = species('prod', 'Prod');
    const r1 = reaction({
      slug: 'r1', name: 'R1', scope: 'specific',
      participants: [{ ref: sp('sub'), role: 'reactant' }, { ref: rg('koh'), role: 'reagent' }, { ref: rg('koh'), role: 'reagent' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('prod') }] }],
    });
    const state = stateOf(koh, sub, prod, r1);
    const p = explore(state, { focus: [ref(rg('koh'))] });
    expect(p.edges).toHaveLength(2);
    expect(new Set(p.edges.map((e) => e.participantId)).size).toBe(2);
    expect(p.bundles).toHaveLength(1);
  });
});

describe('spectator reagent participation never qualifies', () => {
  it('no edge for a spectator reagent', () => {
    const koh = reagent('koh', 'KOH', { families: ['base'] });
    const sub = species('sub', 'Substrate');
    const prod = species('prod', 'Prod');
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sub'), role: 'reactant' }, { ref: rg('koh'), role: 'spectator' }], outcomes: [{ sel: 'major', products: [{ ref: sp('prod') }] }] });
    const state = stateOf(koh, sub, prod, r1);
    const p = explore(state, { focus: [ref(rg('koh'))] });
    expect(p.edges).toEqual([]);
    expect(contextOf(state).indexes.participationsOf(ref(rg('koh')))).toHaveLength(1);
  });
});
