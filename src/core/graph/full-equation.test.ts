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
    // the word is the outcome's, so it is written once, after the last main product (phone mode C review, item 5)
    expect(equation?.products.map((t) => [t.name, t.word, t.quantifier])).toEqual([
      ['Benzyl alcohol', null, null],
      ['Sodium benzoate', 'exclusive', 'both'],
    ]);
    expect(equation?.text).toBe('2 Benzaldehyde → Benzyl alcohol + Sodium benzoate (both exclusive)');
    expect(plain(equation?.arrow.above ?? [])).toContain('NaOH');
  });

  it('ethanol with conc. H2SO4: one equation per outcome, each with its own temperature and its byproduct (its role word, no selectivity word)', () => {
    const [ether, ethene] = equations('rxn_ethanol-conc-h2so4');
    // the main product carries the outcome's word (as on the card); the byproduct water states its role instead
    expect(ether?.text).toBe('Ethanol → Diethyl ether (major) + Water (byproduct)');
    expect(ethene?.text).toBe('Ethanol → Ethene (major) + Water (byproduct)');
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

describe('a product that is not a main product says its role (phone mode C, part 3)', () => {
  it('every product of every demo reaction: a main product has the selectivity word only, a coproduct or byproduct has its role word and no selectivity word', () => {
    const seen = new Set<string>();
    for (const reaction of Object.values(demo.state.records.reaction)) {
      for (const equation of equations(reaction.id)) {
        const outcome = reaction.outcomes.find((o) => o.id === equation.outcomeId);
        expect(outcome).toBeDefined();
        (outcome?.products ?? []).forEach((product, index) => {
          const term = equation.products[index];
          if (product.role === 'main') {
            expect(term?.text).not.toMatch(/\((coproduct|byproduct|main)\)/);
          } else {
            seen.add(product.role);
            expect(term?.word).toBeNull();
            expect(term?.text.endsWith(` (${product.role})`)).toBe(true);
          }
        });
      }
    }
    expect([...seen].sort()).toEqual(['byproduct', 'coproduct']);
  });
});

describe('an outcome with several main products words its selectivity once (phone mode C review, item 5)', () => {
  it('every demo outcome with 2+ main products: exactly one term carries the word, it is the last main product, and the quantifier matches the count', () => {
    let compared = 0;
    for (const reaction of Object.values(demo.state.records.reaction)) {
      for (const equation of equations(reaction.id)) {
        const outcome = reaction.outcomes.find((o) => o.id === equation.outcomeId);
        const mains = (outcome?.products ?? []).flatMap((p, i) => (p.role === 'main' ? [i] : []));
        if (mains.length < 2) continue;
        compared += 1;
        const last = mains[mains.length - 1] as number;
        const quantifier = mains.length === 2 ? 'both' : 'all';
        equation.products.forEach((term, i) => {
          if (!mains.includes(i)) {
            expect(term.quantifier).toBeNull();
            return;
          }
          if (i === last && term.word !== null) {
            expect(term.quantifier).toBe(quantifier);
            expect(term.text.endsWith(` (${quantifier} ${term.word})`)).toBe(true);
          } else {
            expect(term.word).toBeNull();
            expect(term.quantifier).toBeNull();
            expect(term.text).not.toContain('(');
          }
        });
      }
    }
    expect(compared).toBeGreaterThan(0);
  });

  it('three main products: "all"; one main product keeps today\'s form; non-main products keep their role words after it', () => {
    const reaction = demo.state.records.reaction['rxn_benzaldehyde-cannizzaro' as ReactionId];
    if (reaction === undefined) throw new Error('no reaction');
    const base = reaction.outcomes[0] as (typeof reaction.outcomes)[number];
    const [first, second] = base.products as [(typeof base.products)[number], (typeof base.products)[number]];
    const named = (p: typeof first, n: string): typeof first => ({ ...p, originalText: n });
    const written = (products: typeof base.products): string =>
      fullEquationOf(reaction, { ...base, products }, { schemes: [], describe: () => undefined, shownAsNode: () => true }).text.split(' → ')[1] ?? '';
    expect(written([named(first, 'A'), named(second, 'B'), named(first, 'C')])).toBe('A + B + C (all exclusive)');
    expect(written([named(first, 'A')])).toBe('A (exclusive)');
    expect(written([named(first, 'A'), named(second, 'B'), { ...named(first, 'W'), role: 'byproduct' }])).toBe('A + B (both exclusive) + W (byproduct)');
  });
});

describe('the word of a product is the card\'s selectivity word (phone mode B, part 3, item c)', () => {
  it('for every product of every card of the demo families, the equation uses the card\'s word, and a main product shows no role word', () => {
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
              for (const term of outcome.equation?.products ?? []) expect(term.text).not.toMatch(/\(main\)/);
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

describe('what the textbook equation needs of a term (equation step, part 5)', () => {
  it('every term names the record behind it (`ref`) and describes it (`substance`), on the left and on the right', () => {
    for (const reaction of Object.values(demo.state.records.reaction)) {
      for (const equation of equations(reaction.id)) {
        for (const term of [...equation.reactants, ...equation.products]) {
          expect(term.ref.id, `${reaction.id}: ${term.name}`).toBeTruthy();
          expect(['species', 'class', 'reagent']).toContain(term.ref.kind);
          expect(term.substance.name).toBeTruthy();
          expect(term.substance.kind).toBe(demo.state.records[term.ref.kind][term.ref.id as never] === undefined ? 'missing' : term.ref.kind);
        }
      }
    }
  });

  it('Cannizzaro: benzaldehyde is a species with a structure and its entered formula; the refs are the participants\' own', () => {
    const [equation] = equations('rxn_benzaldehyde-cannizzaro');
    const reaction = demo.state.records.reaction['rxn_benzaldehyde-cannizzaro' as ReactionId];
    const reactant = reaction?.participants.find((p) => p.role === 'reactant');
    expect(equation?.reactants[0]?.ref).toEqual(reactant?.ref);
    expect(equation?.reactants[0]?.substance).toMatchObject({ kind: 'species', name: 'Benzaldehyde' });
    expect(equation?.reactants[0]?.substance.structure).toBeDefined();
    expect(equation?.products.map((t) => t.ref.id)).toEqual(reaction?.outcomes[0]?.products.map((p) => p.ref.id));
  });

  it('a species of the demo that has a structure and a formula carries both (the rule decides what to show)', () => {
    const terms = Object.values(demo.state.records.reaction).flatMap((r) => equations(r.id).flatMap((e) => [...e.reactants, ...e.products]));
    expect(terms.some((t) => t.substance.structure !== undefined && t.substance.formula !== undefined)).toBe(true);
  });

  it('`equilibrium` says whether the reaction is stored as an equilibrium (and only then)', () => {
    let seen = 0;
    for (const reaction of Object.values(demo.state.records.reaction)) {
      for (const equation of equations(reaction.id)) {
        expect(equation.equilibrium, reaction.id).toBe(reaction.reversibility.kind === 'equilibrium');
        if (equation.equilibrium) seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('a record that is gone is a `missing` substance named by its ID', () => {
    const reaction = demo.state.records.reaction['rxn_benzaldehyde-cannizzaro' as ReactionId];
    if (reaction === undefined) throw new Error('missing fixture');
    const gone = { ...demo.state, records: { ...demo.state.records, species: {} } };
    const [equation] = fullEquationsOfReaction(gone, demo.indexes, reaction);
    expect(equation?.reactants[0]?.substance).toEqual({ kind: 'missing', name: equation?.reactants[0]?.name });
  });
});
