/**
 * Step 8.5 M2 (ADR-038, decision D2 and its reviewer-approved extension): which side of "before -> after" each species of a step is on.
 * reactant, reagent, catalyst -> before; product, leaving_group -> after; an intermediate or transition state is before when it holds an
 * atom of an electron movement and is not made only of atoms the before side already shows (then it is what the step makes), else after.
 */
import { describe, expect, it } from 'vitest';
import { STEP_SPECIES_ROLES } from '../schema';
import { movementAtoms, stepSides, type SideSpecies } from './sides';

const one = (role: SideSpecies['role'], maps: readonly number[]): SideSpecies => ({ role, maps });

describe('stepSides: the fixed roles', () => {
  it.each([
    ['reactant', 'before'],
    ['reagent', 'before'],
    ['catalyst', 'before'],
    ['product', 'after'],
    ['leaving_group', 'after'],
  ] as const)('%s is on the %s side, whatever atoms the movements name', (role, side) => {
    const sides = stepSides([one(role, [1, 2])], new Set([1, 2]));
    expect(sides[side]).toEqual([0]);
    expect(sides[side === 'before' ? 'after' : 'before']).toEqual([]);
  });

  it('every role of the schema is placed on exactly one side (a new role fails here)', () => {
    for (const role of STEP_SPECIES_ROLES) {
      const sides = stepSides([one(role, [1])], new Set([1]));
      expect(sides.before.length + sides.after.length, role).toBe(1);
    }
  });
});

describe('stepSides: intermediates and transition states', () => {
  it.each(['intermediate', 'transition_state'] as const)('a %s with no atom of any movement is after', (role) => {
    expect(stepSides([one('reactant', [1, 2]), one(role, [5, 6])], new Set([1, 2]))).toEqual({ before: [0], after: [1] });
  });

  it.each(['intermediate', 'transition_state'] as const)('a %s that holds a movement atom the before side does not show is before', (role) => {
    expect(stepSides([one(role, [3, 4, 5]), one('reactant', [6, 7, 8])], new Set([5, 6]))).toEqual({ before: [0, 1], after: [] });
  });

  it('an intermediate made only of atoms the before side shows is what the step makes: after (the demo: the enolate after hydroxide took the hydrogen)', () => {
    const sides = stepSides([one('reagent', [1]), one('reactant', [2, 3, 4, 5]), one('intermediate', [3, 4, 5]), one('product', [1, 2])], new Set([1, 2, 3, 4, 5]));
    expect(sides).toEqual({ before: [0, 1], after: [2, 3] });
  });

  it('two intermediates: the smaller is before, the one that holds it and the reactant is after, in any order they are written', () => {
    const enolate = one('intermediate', [3, 4, 5]);
    const aldolate = one('intermediate', [3, 4, 5, 6, 7, 8]);
    const ethanal = one('reactant', [6, 7, 8]);
    const movements = new Set([3, 4, 5, 7, 8]);
    expect(stepSides([enolate, ethanal, aldolate], movements)).toEqual({ before: [0, 1], after: [2] });
    expect(stepSides([aldolate, ethanal, enolate], movements)).toEqual({ before: [1, 2], after: [0] });
  });

  it('a species with no map numbers holds no atom: an intermediate without maps is after', () => {
    expect(stepSides([one('reactant', [1]), one('intermediate', [])], new Set([1]))).toEqual({ before: [0], after: [1] });
  });

  it('empty sides: no species, only products, only reactants', () => {
    expect(stepSides([], new Set())).toEqual({ before: [], after: [] });
    expect(stepSides([one('product', [1])], new Set())).toEqual({ before: [], after: [0] });
    expect(stepSides([one('reactant', [1])], new Set())).toEqual({ before: [0], after: [] });
  });

  it('keeps the written order within a side and is the same answer every time', () => {
    const species = [one('product', [1]), one('reactant', [2]), one('catalyst', [3]), one('leaving_group', [4])];
    expect(stepSides(species, new Set())).toEqual({ before: [1, 2], after: [0, 3] });
    expect(stepSides(species, new Set())).toEqual(stepSides(species, new Set()));
  });
});

describe('movementAtoms', () => {
  it('collects the atom of an atom, lone pair or radical site and both atoms of a bond site, from both ends of every movement', () => {
    expect([
      ...movementAtoms([
        { from: { kind: 'lone_pair', atom: 1 }, to: { kind: 'bond', atoms: [1, 2] }, electrons: 2 },
        { from: { kind: 'radical', atom: 7 }, to: { kind: 'atom', atom: 9 }, electrons: 1 },
      ]),
    ].sort((a, b) => a - b)).toEqual([1, 2, 7, 9]);
    expect(movementAtoms([]).size).toBe(0);
  });
});
