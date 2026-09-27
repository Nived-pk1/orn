/**
 * Precursor explorer projection (step 2.5): docs/GRAPH_SEMANTICS.md §5, §7, §9, §11.
 * ADV-002 (with INV-26), ADV-003, ADV-004, ADV-006, ADV-007 (widened), ADV-012 projection part, ADV-052, ADV-056.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_DEGREE_CAP, type Projection, type ProjectionRequest } from '..';
import type { CanonicalState, Relationship, RecordRef } from '../../schema';
import { ident, meta, rec as recOf } from '@/test-support/demo/kit';
import { contextOf, reaction, requestOf, sp, species, stateOf } from '@/test-support/graph-state';
import { checkProjection } from '@/test-support/projection-harness';
import { precursorExplorerProjection } from '.';

const ref = (r: { kind: RecordRef['kind']; id: string }): RecordRef => ({ kind: r.kind, id: r.id });

function precursor(state: CanonicalState, over: Partial<ProjectionRequest> = {}): Projection {
  return precursorExplorerProjection.build(contextOf(state, 1), requestOf('precursor_explorer', over));
}

function reverseOf(r1Slug: string, r2Slug: string): Relationship {
  return {
    id: ident<Relationship['id']>('rel', `${r1Slug}-${r2Slug}`),
    kind: 'relationship',
    type: 'reverse_of',
    from: recOf('reaction', r1Slug, 'rxn'),
    to: recOf('reaction', r2Slug, 'rxn'),
    reverseKind: 'synthetic',
    ...meta(),
  };
}

describe('backward basics', () => {
  const A = species('sp-a', 'A');
  const B = species('sp-b', 'B');
  const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
  const state = stateOf(A, B, r1);

  it('finds the producer and its reactant backward from the target; arrows still point forward, layout is reversed', () => {
    const p = precursor(state, { focus: [ref(sp('sp-b'))] });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['rxn_r1', 'spc_sp-a', 'spc_sp-b']);
    const consumes = p.edges.find((e) => e.semantic === 'consumes');
    const produces = p.edges.find((e) => e.semantic === 'produces');
    expect(consumes).toMatchObject({ from: 'spc_sp-a', to: 'rxn_r1', layoutDirection: 'reversed' });
    expect(produces).toMatchObject({ from: 'rxn_r1', to: 'spc_sp-b', layoutDirection: 'reversed' });
    expect(p.truncation).toBeNull();
  });

  it('the target is focus; discovered nodes are members', () => {
    const p = precursor(state, { focus: [ref(sp('sp-b'))] });
    expect(p.nodes.find((n) => n.id === 'spc_sp-b')?.role).toBe('focus');
    expect(p.nodes.find((n) => n.id === 'rxn_r1')?.role).toBe('member');
    expect(p.nodes.find((n) => n.id === 'spc_sp-a')?.role).toBe('member');
  });

  it('a substance never looks forward: focusing on the reactant alone finds nothing beyond it', () => {
    const p = precursor(state, { focus: [ref(sp('sp-a'))] });
    expect(p.nodes.map((n) => n.id)).toEqual(['spc_sp-a']);
    expect(p.edges).toEqual([]);
  });

  it('passes the projection harness (structure, INV-26, P-10)', () => {
    expect(checkProjection(precursorExplorerProjection, state, requestOf('precursor_explorer', { focus: [ref(sp('sp-b'))] }))).toEqual([]);
  });
});

describe('ADV-006 / ADV-048: a reaction reached backward reveals its full consumes and produces edges', () => {
  it('2 reactants -> 3 products: focusing on one product still reveals both reactants and all three products', () => {
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const C1 = species('sp-c1', 'C1');
    const C2 = species('sp-c2', 'C2');
    const C3 = species('sp-c3', 'C3');
    const r1 = reaction({
      slug: 'r1', name: 'R', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }, { ref: sp('sp-b'), role: 'reactant' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-c1') }, { ref: sp('sp-c2') }, { ref: sp('sp-c3') }] }],
    });
    const state = stateOf(A, B, C1, C2, C3, r1);
    const p = precursor(state, { focus: [ref(sp('sp-c1'))] });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['rxn_r1', 'spc_sp-a', 'spc_sp-b', 'spc_sp-c1', 'spc_sp-c2', 'spc_sp-c3']);
    expect(p.edges.filter((e) => e.semantic === 'consumes')).toHaveLength(2);
    expect(p.edges.filter((e) => e.semantic === 'produces')).toHaveLength(3);
  });
});

describe('ADV-003: A → B → C plus A → C: no transitive reduction', () => {
  it('both routes to A stay; A appears once but is reached by two distinct edges', () => {
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const C = species('sp-c', 'C');
    const ab = reaction({ slug: 'ab', name: 'AB', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const bc = reaction({ slug: 'bc', name: 'BC', scope: 'specific', participants: [{ ref: sp('sp-b'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-c') }] }] });
    const ac = reaction({ slug: 'ac', name: 'AC', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-c') }] }] });
    const state = stateOf(A, B, C, ab, bc, ac);
    const p = precursor(state, { focus: [ref(sp('sp-c'))] });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['rxn_ab', 'rxn_ac', 'rxn_bc', 'spc_sp-a', 'spc_sp-b', 'spc_sp-c']);
    expect(p.edges).toHaveLength(6);
    expect(new Set(p.edges.map((e) => e.id)).size).toBe(6);
    const fromAIntoReactions = p.edges.filter((e) => e.from === 'spc_sp-a' && (e.to === 'rxn_ab' || e.to === 'rxn_ac'));
    expect(fromAIntoReactions).toHaveLength(2);
  });
});

describe('ADV-002 (with INV-26) / ADV-007 widened: bundling and distinct selectivity styles', () => {
  it('one reaction with two outcomes producing the same target bundles into one bundle of 2, with distinct selectivity', () => {
    const A = species('sp-a', 'A');
    const X = species('sp-x', 'X');
    const r1 = reaction({
      slug: 'r1', name: 'R', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-x') }] }, { sel: 'minor', products: [{ ref: sp('sp-x') }] }],
    });
    const state = stateOf(A, X, r1);
    const p = precursor(state, { focus: [ref(sp('sp-x'))] });
    const produces = p.edges.filter((e) => e.semantic === 'produces');
    expect(produces).toHaveLength(2);
    expect(produces.map((e) => e.selectivity).sort()).toEqual(['major', 'minor']);
    expect(new Set(produces.map((e) => e.id)).size).toBe(2);
    expect(p.bundles).toHaveLength(1);
    expect(p.bundles[0]).toMatchObject({ from: 'rxn_r1', to: 'spc_sp-x', edgeIds: produces.map((e) => e.id).sort() });
  });
});

describe('ADV-004: ⇌ only between mirrored reverse_of edges', () => {
  it('a mirrored reverse_of pair gets both produces edges tagged', () => {
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const ab = reaction({ slug: 'ab', name: 'Forward', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant', primary: true }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const ba = reaction({ slug: 'ba', name: 'Backward', scope: 'specific', participants: [{ ref: sp('sp-b'), role: 'reactant', primary: true }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-a') }] }] });
    const rel = reverseOf('ab', 'ba');
    const state = stateOf(A, B, ab, ba, rel);
    const p = precursor(state, { focus: [ref(sp('sp-b'))] });
    const intoB = p.edges.find((e) => e.semantic === 'produces' && e.to === 'spc_sp-b');
    expect(intoB).toMatchObject({ relationshipId: rel.id, relationshipType: 'reverse_of' });
  });

  it('two reactions A→B and B→A with no reverse_of relationship: two plain edges, no ⇌', () => {
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const ab = reaction({ slug: 'ab', name: 'Forward', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const ba = reaction({ slug: 'ba', name: 'Backward', scope: 'specific', participants: [{ ref: sp('sp-b'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-a') }] }] });
    const state = stateOf(A, B, ab, ba);
    const p = precursor(state, { focus: [ref(sp('sp-b'))] });
    const intoB = p.edges.find((e) => e.semantic === 'produces' && e.to === 'spc_sp-b');
    expect(intoB?.relationshipId).toBeUndefined();
    expect(intoB?.relationshipType).toBeUndefined();
  });

  it('a reverse_of relationship whose substrates/products do not mirror gets no ⇌', () => {
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const C = species('sp-c', 'C');
    const D = species('sp-d', 'D');
    const ab = reaction({ slug: 'ab', name: 'AB', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const cd = reaction({ slug: 'cd', name: 'CD', scope: 'specific', participants: [{ ref: sp('sp-c'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-d') }] }] });
    const rel = reverseOf('ab', 'cd');
    const state = stateOf(A, B, C, D, ab, cd, rel);
    const p = precursor(state, { focus: [ref(sp('sp-b'))] });
    const intoB = p.edges.find((e) => e.semantic === 'produces' && e.to === 'spc_sp-b');
    expect(intoB?.relationshipId).toBeUndefined();
  });
});

describe('ADV-056: conditional reversibility alone never triggers ⇌', () => {
  it('reversibility.kind = reversible_under_other_conditions, no reverse_of relationship: plain one-way arrow', () => {
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const r1 = reaction({
      slug: 'r1', name: 'R', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }],
      reversibility: ['reversible_under_other_conditions'],
    });
    const state = stateOf(A, B, r1);
    const p = precursor(state, { focus: [ref(sp('sp-b'))] });
    const edge = p.edges.find((e) => e.semantic === 'produces');
    expect(edge?.relationshipId).toBeUndefined();
    expect(edge?.relationshipType).toBeUndefined();
  });
});

describe('ADV-052 / ADV-012 projection part: degree cap and overflow', () => {
  function producedByMany(count: number) {
    const target = species('target', 'Target');
    const reactants = Array.from({ length: count }, (_, i) => species(`r${i}`, `R${i}`));
    const reactions = Array.from({ length: count }, (_, i) =>
      reaction({ slug: `p${i}`, name: `P${i}`, scope: 'specific', participants: [{ ref: sp(`r${i}`), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('target') }] }] }));
    return stateOf(target, ...reactants, ...reactions);
  }

  it('25 producers: keeps the cap, collapses the rest into one overflow node; nothing dropped from the index', () => {
    const state = producedByMany(25);
    const p = precursor(state, { focus: [ref(sp('target'))] });
    const producesEdges = p.edges.filter((e) => e.semantic === 'produces');
    expect(producesEdges).toHaveLength(DEFAULT_DEGREE_CAP);
    const overflow = p.nodes.filter((n) => n.role === 'overflow');
    expect(overflow).toHaveLength(1);
    expect(overflow[0]?.hidden.incoming).toBe(25 - DEFAULT_DEGREE_CAP);
    expect(contextOf(state).indexes.productionsOf(ref(sp('target')))).toHaveLength(25);
    expect(p.truncation).toBeNull();
    expect(checkProjection(precursorExplorerProjection, state, requestOf('precursor_explorer', { focus: [ref(sp('target'))] }))).toEqual([]);
  });

  it('1,000 producers: the scene stays small (bundling/caps/overflow keep it well under the render budget)', () => {
    const state = producedByMany(1000);
    const p = precursor(state, { focus: [ref(sp('target'))] });
    expect(p.edges.filter((e) => e.semantic === 'produces')).toHaveLength(DEFAULT_DEGREE_CAP);
    const overflow = p.nodes.filter((n) => n.role === 'overflow');
    expect(overflow).toHaveLength(1);
    expect(overflow[0]?.hidden.incoming).toBe(1000 - DEFAULT_DEGREE_CAP);
    expect(p.nodes.length).toBeLessThan(30);
    expect(p.truncation).toBeNull();
  });

  it('ranks a scoped-in producer over an out-of-scope one, even out of name order', () => {
    const target = species('target', 'Target');
    const reactants = Array.from({ length: 13 }, (_, i) => species(`r${i}`, `R${i}`));
    const reactions = Array.from({ length: 13 }, (_, i) =>
      reaction({ slug: `p${i}`, name: `P${i}`, scope: 'specific', participants: [{ ref: sp(`r${i}`), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('target') }] }] }));
    const state = stateOf(target, ...reactants, ...reactions);
    const scopeOf = (r: RecordRef) => (r.id === 'rxn_p12' ? 'official' as const : 'outside' as const);
    const p = precursorExplorerProjection.build(contextOf(state, 1, scopeOf), requestOf('precursor_explorer', { focus: [ref(sp('target'))] }));
    const kept = p.edges.filter((e) => e.semantic === 'produces').map((e) => e.from);
    expect(kept).toContain('rxn_p12');
  });
});
