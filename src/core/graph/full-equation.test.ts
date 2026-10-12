/** `fullEquationOf` (step 5.9a review, follow-up b): every reactant with its coefficient, every product with its role, the arrow text of the card. */
import { describe, expect, it } from 'vitest';
import { fullEquationsOfReaction, type FullEquation } from '.';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import type { ReactionId } from '../schema';

const demo = contextOf(demoState());
const equations = (id: string): readonly FullEquation[] => {
  const reaction = demo.state.records.reaction[id as ReactionId];
  if (reaction === undefined) throw new Error(`no reaction ${id}`);
  return fullEquationsOfReaction(demo.state, demo.indexes, reaction);
};
const plain = (parts: readonly { readonly text: string }[]): string => parts.map((p) => p.text).join(' ');

describe('fullEquationOf on the demo', () => {
  it('Cannizzaro: 2 benzaldehyde on the left, both products main, NaOH over the arrow', () => {
    const [equation] = equations('rxn_benzaldehyde-cannizzaro');
    expect(equation?.reactants.map((t) => t.text)).toEqual(['2 Benzaldehyde']);
    expect(equation?.products.map((t) => [t.name, t.role])).toEqual([
      ['Benzyl alcohol', 'main'],
      ['Sodium benzoate', 'main'],
    ]);
    expect(equation?.text).toBe('2 Benzaldehyde → Benzyl alcohol (main) + Sodium benzoate (main)');
    expect(plain(equation?.arrow.above ?? [])).toContain('NaOH');
  });

  it('ethanol with conc. H2SO4: one equation per outcome, each with its own temperature and its byproduct', () => {
    const [ether, ethene] = equations('rxn_ethanol-conc-h2so4');
    expect(ether?.text).toBe('Ethanol → Diethyl ether (main) + Water (byproduct)');
    expect(ethene?.text).toBe('Ethanol → Ethene (main) + Water (byproduct)');
    expect(plain(ether?.arrow.below ?? [])).toContain('413 K');
    expect(plain(ethene?.arrow.below ?? [])).toContain('443 K');
    expect(plain(ether?.arrow.below ?? [])).not.toContain('443 K');
  });

  it('a reactant nobody draws as a node (water) is a reactant of the equation, not a reagent over the arrow', () => {
    const hydrations = [...Object.values(demo.state.records.reaction)].filter((r) =>
      r.participants.some((p) => p.role === 'reactant' && p.ref.id === 'spc_water'),
    );
    expect(hydrations.length).toBeGreaterThan(0);
    for (const reaction of hydrations) {
      for (const equation of equations(reaction.id)) {
        expect(equation.reactants.map((t) => t.name)).toContain('Water');
        expect(plain([...equation.arrow.above, ...equation.arrow.below])).not.toMatch(/\bWater\b|H2O/);
      }
    }
  });

  it('is text only: no markup characters are added to any part', () => {
    for (const reaction of Object.values(demo.state.records.reaction)) {
      for (const equation of equations(reaction.id)) expect(equation.text).not.toMatch(/[<>]/);
    }
  });
});
