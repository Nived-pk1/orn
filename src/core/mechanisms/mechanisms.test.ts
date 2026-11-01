/**
 * 7.4 Part C: the mechanism list (text on name and aliases, exam scope, sort, empty records apart, steps counted) and a mechanism's page
 * (variants with ordered steps in words, species roles, reactions with examples folded, caveats). Pure and derived.
 */
import { describe, expect, it } from 'vitest';
import type { AnyRecord } from '@/core/schema';
import { concept, sp, species } from '@/test-support/demo/kit';
import { reaction } from '@/test-support/demo/reaction-kit';
import { contextOf, stateOf } from '@/test-support/graph-state';
import { caveatOn, mecRef, mechanismRecord, mechStep, mechVariant } from '@/test-support/named-kit';
import { filterMechanisms, mechanismPage } from './index';

const rxn = (slug: string, name: string, extra: Partial<Parameters<typeof reaction>[0]> = {}) =>
  reaction({ slug, name, scope: 'specific', participants: [{ ref: sp('subs'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('prod') }] }], ...extra });

const aldol = mechanismRecord(
  'aldol',
  'Aldol addition',
  [
    mechVariant('base', 'Base-catalysed', [
      mechStep('b1', { title: 'Enolate forms', kinds: ['proton_transfer'], description: 'Hydroxide takes a proton.', species: [{ role: 'reagent', label: 'Hydroxide' }, { role: 'intermediate', label: 'Enolate' }], reversible: true }),
      mechStep('b2', { kinds: ['nucleophilic_attack', 'bond_formation'], species: [{ role: 'transition_state', label: 'TS' }], rds: true, event: 'New stereocentre' }),
    ], { applicability: 'In dilute alkali.', rateLaw: 'rate = k[enolate][aldehyde]' }),
    mechVariant('acid', 'Acid-catalysed', [mechStep('a1', { title: 'Protonation' })]),
  ],
  { aliases: ['Aldol'], classes: ['an'], summary: 'Two carbonyls join.', concepts: ['an'] },
);
const sn2 = mechanismRecord('sn2', 'SN2 substitution', [mechVariant('vc', 'Concerted', [mechStep('s1')])], { summary: 'One step.' });
const blank = mechanismRecord('blank', 'Blank mechanism', []);
const noSteps = mechanismRecord('nosteps', 'No-step mechanism', [], { summary: 'Written, but with no steps.' });
const general = rxn('gen', 'General aldol', { scope: 'generic', mechanisms: ['aldol'] });
const example = rxn('ex', 'Ethanal aldol', { instanceOf: 'gen', mechanisms: ['aldol'] });
const viaOutcome = rxn('out', 'Outcome-linked', { outcomes: [{ sel: 'major', products: [{ ref: sp('prod') }], mechanism: { id: 'sn2' } }] });
const base: AnyRecord[] = [aldol, sn2, blank, noSteps, general, example, viaOutcome, concept('an', 'Nucleophilic addition', 'mechanism_class'), species('subs', 'Substrate'), species('prod', 'Product')];

function build(...more: AnyRecord[]) {
  const state = stateOf(...base, ...more);
  return { state, indexes: contextOf(state).indexes };
}

describe('filterMechanisms', () => {
  const { state, indexes } = build();

  it('lists the written ones by folded name with classes in words, reactions and steps; empty ones come apart', () => {
    const list = filterMechanisms(state, indexes, { text: '' });
    expect(list.rows.map((r) => r.name)).toEqual(['Aldol addition', 'No-step mechanism', 'SN2 substitution']);
    expect(list.rows[0]).toMatchObject({ aliases: ['Aldol'], classes: ['Nucleophilic addition'], reactions: 2, steps: 3 });
    expect(list.rows.find((r) => r.id === 'mec_sn2')).toMatchObject({ reactions: 1, steps: 1 }); // through an outcome's link
    expect(list.empty.map((r) => r.name)).toEqual(['Blank mechanism']);
    expect(list.total).toBe(4);
  });

  it('a mechanism with a summary but no steps is written (empty = no text, no steps, no reactions)', () => {
    expect(filterMechanisms(state, indexes, { text: '' }).rows.some((r) => r.id === 'mec_nosteps')).toBe(true);
  });

  it('text matches the name and the aliases, folded', () => {
    expect(filterMechanisms(state, indexes, { text: 'ALDOL' }).rows.map((r) => r.id)).toEqual(['mec_aldol']);
    expect(filterMechanisms(state, indexes, { text: 'sn2' }).rows.map((r) => r.id)).toEqual(['mec_sn2']);
  });

  it('with an exam scope a mechanism is kept when one of its reactions is not outside it; empty records are hidden', () => {
    const list = filterMechanisms(state, indexes, { text: '', outside: (id) => id === 'rxn_out' });
    expect(list.rows.map((r) => r.id)).toEqual(['mec_aldol']);
    expect(list.empty).toEqual([]);
  });
});

describe('mechanismPage', () => {
  const cav = caveatOn('c1', 'Aldol caveat', [mecRef('aldol')]);
  const { state, indexes } = build(cav);

  it('has the classes as words, the concepts, and the variants with ordered, numbered steps in words', () => {
    const page = mechanismPage(state, indexes, 'mec_aldol');
    expect(page?.classes).toEqual([{ id: 'cpt_an', name: 'Nucleophilic addition', certainty: 'definite' }]);
    expect(page?.concepts).toEqual([{ id: 'cpt_an', name: 'Nucleophilic addition' }]);
    expect(page?.variants.map((v) => v.label)).toEqual(['Base-catalysed', 'Acid-catalysed']);
    const base1 = page?.variants[0];
    expect(base1).toMatchObject({ applicability: 'In dilute alkali.', rateLaw: 'rate = k[enolate][aldehyde]' });
    expect(base1?.steps.map((s) => s.number)).toEqual([1, 2]);
    expect(base1?.steps[0]).toMatchObject({ title: 'Enolate forms', kinds: ['proton transfer'], rateDetermining: false, reversible: true });
    expect(base1?.steps[0]?.species).toEqual([{ role: 'reagent', label: 'Hydroxide' }, { role: 'intermediate', label: 'Enolate' }]);
    expect(base1?.steps[1]).toMatchObject({ kinds: ['nucleophilic attack', 'bond formation'], rateDetermining: true, stereochemicalEvent: 'New stereocentre' });
    expect(base1?.steps[1]?.species[0]?.role).toBe('transition state');
  });

  it('reactions that use it have their examples folded; caveats and an unknown id', () => {
    const page = mechanismPage(state, indexes, 'mec_aldol');
    expect(page?.reactions.reactions).toEqual(['rxn_gen']);
    expect(page?.reactions.examplesOf.get('rxn_gen')).toEqual(['rxn_ex']);
    expect(page?.reactions.count).toBe(2);
    expect(page?.caveats.map((c) => c.title)).toEqual(['Aldol caveat']);
    expect(mechanismPage(state, indexes, 'mec_nope')).toBeUndefined();
  });
});
