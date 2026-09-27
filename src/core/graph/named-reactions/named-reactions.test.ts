/**
 * Named-reactions projection (step 2.6): docs/GRAPH_SEMANTICS.md §7 — family DAG + reactions via index.
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalState, NamedReaction, RecordRef } from '../../schema';
import { ident, meta } from '@/test-support/demo/kit';
import { contextOf, reaction, requestOf, sp, species, stateOf } from '@/test-support/graph-state';
import { checkProjection } from '@/test-support/projection-harness';
import { namedReactionsProjection } from '.';
import type { Projection, ProjectionRequest } from '..';

const ref = (r: { kind: RecordRef['kind']; id: string }): RecordRef => ({ kind: r.kind, id: r.id });

function namedReaction(body: string, name: string, parents: readonly string[] = []): NamedReaction {
  return {
    id: ident<NamedReaction['id']>('nrx', body),
    kind: 'named_reaction',
    name,
    aliases: [],
    parentIds: parents.map((p) => ident<NamedReaction['id']>('nrx', p)),
    conceptIds: [],
    prerequisiteConceptIds: [],
    ...meta(),
  };
}

function explore(state: CanonicalState, over: Partial<ProjectionRequest> = {}): Projection {
  return namedReactionsProjection.build(contextOf(state, 1), requestOf('named_reactions', over));
}

describe('family DAG', () => {
  const parent = namedReaction('friedel-crafts', 'Friedel–Crafts');
  const child = namedReaction('friedel-crafts-acylation', 'Friedel–Crafts acylation', ['friedel-crafts']);
  const state = stateOf(parent, child);

  it('climbing from the child finds its parent (membership, child → parent)', () => {
    const p = explore(state, { focus: [ref({ kind: 'named_reaction', id: 'nrx_friedel-crafts-acylation' })] });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['nrx_friedel-crafts', 'nrx_friedel-crafts-acylation']);
    expect(p.edges).toHaveLength(1);
    expect(p.edges[0]).toMatchObject({ from: 'nrx_friedel-crafts-acylation', to: 'nrx_friedel-crafts', semantic: 'membership' });
  });

  it('focusing on the parent finds its child (the same DAG, other direction)', () => {
    const p = explore(state, { focus: [ref({ kind: 'named_reaction', id: 'nrx_friedel-crafts' })] });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['nrx_friedel-crafts', 'nrx_friedel-crafts-acylation']);
    expect(p.edges).toHaveLength(1);
    expect(p.edges[0]).toMatchObject({ from: 'nrx_friedel-crafts-acylation', to: 'nrx_friedel-crafts' });
  });

  it('the seed is focus; the rest are members', () => {
    const p = explore(state, { focus: [ref({ kind: 'named_reaction', id: 'nrx_friedel-crafts' })] });
    expect(p.nodes.find((n) => n.id === 'nrx_friedel-crafts')?.role).toBe('focus');
    expect(p.nodes.find((n) => n.id === 'nrx_friedel-crafts-acylation')?.role).toBe('member');
  });

  it('passes the projection harness (structure, INV-26, P-10)', () => {
    expect(checkProjection(namedReactionsProjection, state, requestOf('named_reactions', { focus: [ref({ kind: 'named_reaction', id: 'nrx_friedel-crafts' })] }))).toEqual([]);
  });
});

describe('reactions via the named-reaction index', () => {
  it('a reaction that names the family shows up as a member (the reaction is recoverable from edge.from, not a reactionId field)', () => {
    const family = namedReaction('williamson', 'Williamson ether synthesis');
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const r1 = reaction({ slug: 'r1', name: 'Ether synthesis', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }], named: ['williamson'] });
    const state = stateOf(family, A, B, r1);
    const p = explore(state, { focus: [ref({ kind: 'named_reaction', id: 'nrx_williamson' })] });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['nrx_williamson', 'rxn_r1']);
    expect(p.edges[0]).toMatchObject({ from: 'rxn_r1', to: 'nrx_williamson', semantic: 'membership' });
    expect(p.edges[0]?.reactionId).toBeUndefined();
  });

  it('a reaction naming two families gets two independent membership edges, no INV-26 collision', () => {
    const familyA = namedReaction('williamson', 'Williamson ether synthesis');
    const familyB = namedReaction('wurtz', 'Wurtz reaction');
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const r1 = reaction({ slug: 'r1', name: 'R', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }], named: ['williamson', 'wurtz'] });
    const state = stateOf(familyA, familyB, A, B, r1);
    const p = explore(state, { focus: [ref({ kind: 'named_reaction', id: 'nrx_williamson' }), ref({ kind: 'named_reaction', id: 'nrx_wurtz' })] });
    const fromR1 = p.edges.filter((e) => e.from === 'rxn_r1');
    expect(fromR1).toHaveLength(2);
    expect(new Set(fromR1.map((e) => e.id)).size).toBe(2);
    expect(checkProjection(namedReactionsProjection, state, requestOf('named_reactions', { focus: [ref({ kind: 'named_reaction', id: 'nrx_williamson' }), ref({ kind: 'named_reaction', id: 'nrx_wurtz' })] }))).toEqual([]);
  });

  it('a reaction is a dead end: its own participants/products never appear here', () => {
    const family = namedReaction('williamson', 'Williamson ether synthesis');
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const r1 = reaction({ slug: 'r1', name: 'Ether synthesis', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }], named: ['williamson'] });
    const state = stateOf(family, A, B, r1);
    const p = explore(state, { focus: [ref({ kind: 'named_reaction', id: 'nrx_williamson' })] });
    expect(p.nodes.map((n) => n.id)).not.toContain('spc_sp-a');
    expect(p.nodes.map((n) => n.id)).not.toContain('spc_sp-b');
  });

  it('a reaction seed (not a named reaction) is dropped, not a phantom node', () => {
    const family = namedReaction('williamson', 'Williamson ether synthesis');
    const state = stateOf(family);
    const p = explore(state, { focus: [{ kind: 'reaction', id: 'rxn_missing' }] });
    expect(p.nodes).toEqual([]);
  });
});
