/**
 * Backward move generation (docs/GRAPH_SEMANTICS.md §9): candidate reactants for one backward step,
 * side inputs, condition-variant intersection, and the class-membership inference rule.
 */
import { describe, expect, it } from 'vitest';
import { chemClass, cl, contextOf, neverAsNode, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import { must } from '@/test-support/state-fixture';
import type { RecordRef } from '@/core/schema';
import { backwardMovesInto, CLASS_LEVEL_MATCH_WARNING, sharedVariants } from '.';

const rec = (ref: { kind: RecordRef['kind']; id: string }): RecordRef => ({ kind: ref.kind, id: ref.id });
const NONE = new Set<string>();

describe('backwardMovesInto', () => {
  it('matches every exact reactant, each with the others as side inputs', () => {
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const C = species('sp-c', 'C');
    const D = species('sp-d', 'D');
    const r1 = reaction({
      slug: 'r1', name: 'R1', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }, { ref: sp('sp-b'), role: 'reactant' }, { ref: sp('sp-c'), role: 'reagent' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-d') }] }],
    });
    const ctx = contextOf(stateOf(A, B, C, D, r1));
    const moves = backwardMovesInto(ctx, rec(sp('sp-d')), NONE);
    expect(moves).toHaveLength(2);
    const byIn = new Map(moves.map((m) => [m.carriedIn.id, m]));
    expect(byIn.get('spc_sp-a')?.sideInputs.map((s) => s.id)).toEqual(['spc_sp-b', 'spc_sp-c']);
    expect(byIn.get('spc_sp-b')?.sideInputs.map((s) => s.id)).toEqual(['spc_sp-a', 'spc_sp-c']);
    for (const move of moves) {
      expect(move.inferred).toBe(false);
      expect(move.warnings).toEqual([]);
      expect(move.carriedOut).toEqual(rec(sp('sp-d')));
    }
  });

  it('only a main product is a valid backward target; a byproduct is not', () => {
    const A = species('sp-a', 'A');
    const D = species('sp-d', 'D');
    const E = species('sp-e', 'E');
    const r1 = reaction({
      slug: 'r1', name: 'R1', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-d') }, { ref: sp('sp-e'), role: 'byproduct' }] }],
    });
    const ctx = contextOf(stateOf(A, D, E, r1));
    expect(backwardMovesInto(ctx, rec(sp('sp-d')), NONE)).toHaveLength(1);
    expect(backwardMovesInto(ctx, rec(sp('sp-e')), NONE)).toEqual([]);
  });

  it('excludes reactions named in excludeReactionIds', () => {
    const A = species('sp-a', 'A');
    const D = species('sp-d', 'D');
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-d') }] }] });
    const ctx = contextOf(stateOf(A, D, r1));
    expect(backwardMovesInto(ctx, rec(sp('sp-d')), new Set(['rxn_r1']))).toEqual([]);
  });

  it('never carries a participant with entity_display showAsNode: never, and never lists it as a side input', () => {
    const A = species('sp-a', 'A');
    const W = species('sp-w', 'Water-like');
    const D = species('sp-d', 'D');
    const r1 = reaction({
      slug: 'r1', name: 'R1', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }, { ref: sp('sp-w'), role: 'reactant' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-d') }] }],
    });
    const ctx = contextOf(stateOf(A, W, D, r1, neverAsNode(rec(sp('sp-w')), 'water-like')));
    const moves = backwardMovesInto(ctx, rec(sp('sp-d')), NONE);
    expect(moves.map((m) => m.carriedIn.id)).toEqual(['spc_sp-a']);
    expect(moves[0]?.sideInputs).toEqual([]);
  });

  describe('class-membership inference', () => {
    const primaryAlcohols = chemClass('primary-alcohols', 'Primary alcohols', 'functional_group');
    const ethanol = species('ethanol', 'Ethanol', { classes: ['primary-alcohols'] });
    const propan1ol = species('propan-1-ol', 'Propan-1-ol', { classes: ['primary-alcohols'] });
    const aldehydes = chemClass('aldehydes', 'Aldehydes', 'functional_group');
    const generic = reaction({
      slug: 'generic-oxidation', name: '1° alcohol → aldehyde', scope: 'generic',
      participants: [{ ref: cl('primary-alcohols'), role: 'reactant' }],
      outcomes: [{ sel: 'exclusive', products: [{ ref: cl('aldehydes') }] }],
    });
    const state = stateOf(primaryAlcohols, ethanol, propan1ol, aldehydes, generic);
    const ctx = contextOf(state);

    it('a class-typed reactant yields one exact move (the class itself) and one inferred move per member species', () => {
      const moves = backwardMovesInto(ctx, rec(cl('aldehydes')), NONE);
      expect(moves).toHaveLength(3);
      const exact = moves.find((m) => m.carriedIn.kind === 'class');
      expect(exact?.inferred).toBe(false);
      expect(exact?.warnings).toEqual([]);
      const inferred = moves.filter((m) => m.inferred);
      expect(inferred.map((m) => m.carriedIn.id).sort()).toEqual(['spc_ethanol', 'spc_propan-1-ol']);
      for (const m of inferred) expect(m.warnings).toEqual([CLASS_LEVEL_MATCH_WARNING]);
    });

    it('an exact species reactant is never treated as inferred', () => {
      const A = species('sp-a', 'A');
      const D = species('sp-d', 'D');
      const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-d') }] }] });
      const moves = backwardMovesInto(contextOf(stateOf(A, D, r1)), rec(sp('sp-d')), NONE);
      expect(moves.every((m) => !m.inferred)).toBe(true);
    });
  });
});

describe('sharedVariants', () => {
  it('two common (unrestricted) sides share every variant (empty = common)', () => {
    const r = reaction({
      slug: 'r1', name: 'R1', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }, { ref: sp('sp-b'), role: 'reagent' }],
      variants: [{ label: 'v1' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-d') }] }],
    });
    expect(sharedVariants(r, must(r.participants[0]), must(r.outcomes[0]))).toEqual([]);
  });

  it('a variant-restricted participant against a common outcome: the participant wins', () => {
    const r = reaction({
      slug: 'r1', name: 'R1', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }, { ref: sp('sp-b'), role: 'reagent' }],
      variants: [{ label: 'v1', members: [0] }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-d') }] }],
    });
    expect(sharedVariants(r, must(r.participants[0]), must(r.outcomes[0]))).toEqual([must(r.conditionVariants[0]).id]);
  });

  it('a common participant against a variant-restricted outcome: the outcome wins', () => {
    const r = reaction({
      slug: 'r1', name: 'R1', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }],
      variants: [{ label: 'v1' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-d') }], variants: [0] }],
    });
    expect(sharedVariants(r, must(r.participants[0]), must(r.outcomes[0]))).toEqual([must(r.outcomes[0]).conditionVariantIds[0]]);
  });

  it('two restricted sides that overlap on one variant: only that variant is shared', () => {
    const r = reaction({
      slug: 'r1', name: 'R1', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }],
      variants: [{ label: 'v1', members: [0] }, { label: 'v2', members: [0] }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-d') }], variants: [0] }, { sel: 'major', products: [{ ref: sp('sp-e') }], variants: [1] }],
    });
    expect(sharedVariants(r, must(r.participants[0]), must(r.outcomes[0]))).toEqual([must(r.conditionVariants[0]).id]);
    expect(sharedVariants(r, must(r.participants[0]), must(r.outcomes[1]))).toEqual([must(r.conditionVariants[1]).id]);
  });

  it('two restricted sides with no overlap: a dead combination (null)', () => {
    const r = reaction({
      slug: 'r1', name: 'R1', scope: 'specific',
      participants: [{ ref: sp('sp-a'), role: 'reactant' }],
      variants: [{ label: 'v1', members: [0] }, { label: 'v2' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('sp-d') }], variants: [1] }],
    });
    expect(sharedVariants(r, must(r.participants[0]), must(r.outcomes[0]))).toBeNull();
  });
});
