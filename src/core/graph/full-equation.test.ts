/** `fullEquationOf` (step 5.9a review, follow-up b): every reactant with its coefficient, every product with its role, the arrow text of the card. */
import { describe, expect, it } from 'vitest';
import { arrowTextOf, familyStudy, fullEquationOf, fullEquationsOfReaction, type FullEquation } from '.';
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
  it('Cannizzaro: 2 benzaldehyde on the left, both products with the outcome\'s word, NaOH over the arrow', () => {
    const [equation] = equations('rxn_benzaldehyde-cannizzaro');
    expect(equation?.reactants.map((t) => t.text)).toEqual(['2 Benzaldehyde']);
    // the word is the card's selectivity word of the outcome, not a role word
    expect(equation?.products.map((t) => [t.name, t.word])).toEqual([
      ['Benzyl alcohol', 'exclusive'],
      ['Sodium benzoate', 'exclusive'],
    ]);
    expect(equation?.text).toBe('2 Benzaldehyde → Benzyl alcohol (exclusive) + Sodium benzoate (exclusive)');
    expect(plain(equation?.arrow.above ?? [])).toContain('NaOH');
  });

  it('ethanol with conc. H2SO4: one equation per outcome, each with its own temperature and its byproduct (no word)', () => {
    const [ether, ethene] = equations('rxn_ethanol-conc-h2so4');
    // the main product carries the outcome's word (as on the card); the byproduct water states none
    expect(ether?.text).toBe('Ethanol → Diethyl ether (major) + Water');
    expect(ethene?.text).toBe('Ethanol → Ethene (major) + Water');
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

describe('the same species is not written twice (phone mode B, part 3, item b)', () => {
  const lindlar = demo.state.records.reaction['rxn_but-2-yne-lindlar' as ReactionId];
  if (lindlar === undefined) throw new Error('no Lindlar reaction');
  const context = (reaction: typeof lindlar) => ({
    schemes: [],
    describe: (ref: { readonly id: string }) => (ref.id === 'spc_hydrogen' ? { name: 'Hydrogen', formula: 'H₂' } : { name: ref.id }),
    shownAsNode: () => true,
    reaction,
  });

  it('Lindlar: hydrogen is a reactant on the left, so the H2 atmosphere is not repeated under the arrow; the card arrow still has it', () => {
    const [equation] = equations('rxn_but-2-yne-lindlar');
    expect(equation?.reactants.map((t) => t.name)).toContain('Hydrogen');
    expect(plain(equation?.arrow.below ?? [])).not.toMatch(/H2|H₂/);
    expect(plain(equation?.arrow.above ?? [])).toContain("Lindlar's catalyst"); // the catalyst is not a reactant: it stays
    const card = arrowTextOf(lindlar, { ...context(lindlar), conditionVariantIds: [], omitReactants: true });
    expect(plain(card.below)).toMatch(/H2/); // without the omission the arrow says it (the card's own arrow is unchanged)
  });

  it('a gas that is NOT a reactant stays under the arrow (a reactant with another formula omits nothing)', () => {
    const noHydrogen = { ...lindlar, participants: lindlar.participants.filter((p) => p.ref.id !== 'spc_hydrogen') };
    const text = arrowTextOf(noHydrogen, { ...context(noHydrogen), conditionVariantIds: [], omitReactants: true, omitFormulas: ['CO₂'] });
    expect(plain(text.below)).toMatch(/H2/);
  });

  it('a reagent that is the SAME record as a reactant is not repeated on the arrow; another reagent is', () => {
    const twice = {
      ...lindlar,
      participants: [
        ...lindlar.participants,
        { id: 'prt_twice', ref: { kind: 'species', id: 'spc_but-2-yne' }, role: 'reagent' },
      ],
    } as typeof lindlar;
    const withDuplicate = fullEquationOf(twice, twice.outcomes[0] as (typeof twice.outcomes)[number], { ...context(twice), schemes: [] });
    expect(plain([...withDuplicate.arrow.above, ...withDuplicate.arrow.below])).not.toContain('spc_but-2-yne');
    const kept = arrowTextOf(twice, { ...context(twice), conditionVariantIds: [], omitReactants: true });
    expect(plain(kept.above)).toContain('spc_but-2-yne'); // the card's arrow, with no omission, still writes it
  });
});

describe('the word of a product is the card\'s selectivity word (phone mode B, part 3, item c)', () => {
  it('for every product of every card of the demo families, the equation uses the card\'s word, and no role word appears', () => {
    let compared = 0;
    for (const hub of ['cls_alcohols', 'cls_alkenes', 'cls_aldehydes', 'cls_haloalkanes']) {
      const study = familyStudy(demo, hub);
      if (study === null) continue;
      for (const section of [study.reactionsOf, study.preparationOf]) {
        for (const group of section.groups) {
          for (const card of group.cards) {
            for (const outcome of card.outcomes) {
              const words = new Set(outcome.products.map((p) => p.selectivity));
              const inEquation = new Set((outcome.equation?.products ?? []).map((t) => t.word));
              for (const word of words) expect(inEquation.has(word), `${card.name}: ${String(word)}`).toBe(true);
              for (const term of outcome.equation?.products ?? []) expect(term.text).not.toMatch(/\((main|coproduct|byproduct)\)/);
              compared += 1;
            }
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(5);
  });

  it('an outcome with no selectivity states none: the term is the bare name', () => {
    const reaction = demo.state.records.reaction['rxn_but-2-yne-lindlar' as ReactionId];
    if (reaction === undefined) throw new Error('no reaction');
    const outcome = { ...(reaction.outcomes[0] as (typeof reaction.outcomes)[number]), selectivity: 'unspecified' as const };
    const equation = fullEquationOf(reaction, outcome, { schemes: [], describe: () => undefined, shownAsNode: () => true });
    expect(equation.products.map((t) => t.word)).toEqual([null]);
    expect(equation.products[0]?.text).not.toContain('(');
  });
});
