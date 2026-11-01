/**
 * 7.3c C1-C3: the reagent list (filter, family counts, exam scope), what uses a reagent (per profile, distinct reactions, examples folded) and the
 * words for "how it is used". Pure and derived: nothing is stored.
 */
import { describe, expect, it } from 'vitest';
import type { AnyRecord, CanonicalState } from '@/core/schema';
import { conditions, ident, reagent, rg, sp, species } from '@/test-support/demo/kit';
import { reaction } from '@/test-support/demo/reaction-kit';
import { contextOf, stateOf } from '@/test-support/graph-state';
import { filterReagents, howUsedWords, reagentUsage } from './index';

const profile = (body: string, label: string, aliases: string[] = []) => ({ id: ident<never>('rpf', body), label, aliases, parameters: conditions({}) });
const rxn = (slug: string, name: string, participants: Parameters<typeof reaction>[0]['participants'], extra: Partial<Parameters<typeof reaction>[0]> = {}) =>
  reaction({ slug, name, scope: 'specific', participants, outcomes: [{ sel: 'major', products: [{ ref: sp('prod') }] }], ...extra });

const koh = reagent('koh', 'Potassium hydroxide', { species: 'koh', families: ['base', 'nucleophile'], profiles: [profile('aq', 'Aqueous KOH', ['aq. KOH']), profile('alc', 'Alcoholic KOH', ['alc. KOH']), profile('unused', 'Molten KOH')] });
const kmno4 = reagent('kmno4', 'Potassium permanganate', { families: ['oxidant', 'test_reagent'], profiles: [profile('baeyer', "Baeyer's reagent", ['Cold dilute alkaline KMnO4'])] });
const pcc = reagent('pcc', 'PCC', { families: ['oxidant'] });
const mix = reagent('mix', 'Lindlar catalyst', { families: ['catalyst'], components: [{ ref: rg('pcc'), role: 'support' }] });
const spec = [species('koh', 'KOH'), species('prod', 'Product'), species('subs', 'Substrate')];

function build(...more: AnyRecord[]): { state: CanonicalState; indexes: ReturnType<typeof contextOf>['indexes'] } {
  const state = stateOf(koh, kmno4, pcc, mix, ...spec, ...more);
  return { state, indexes: contextOf(state).indexes };
}

describe('filterReagents (C1)', () => {
  const r1 = rxn('a1', 'Alpha', [{ ref: sp('subs'), role: 'reactant' }, { ref: rg('koh'), role: 'reagent', profile: 'alc' }]);
  const r2 = rxn('b1', 'Bravo', [{ ref: sp('subs'), role: 'reactant' }, { ref: rg('pcc'), role: 'reagent' }]);
  const { state, indexes } = build(r1, r2);
  const none = { text: '', families: [] as const };

  it('lists every reagent by folded name, then id, with its reaction and profile counts', () => {
    const list = filterReagents(state, indexes, none);
    expect(list.rows.map((r) => r.name)).toEqual(['Lindlar catalyst', 'PCC', 'Potassium hydroxide', 'Potassium permanganate']);
    expect(list.total).toBe(4);
    const row = list.rows.find((r) => r.id === 'rgt_koh');
    expect(row).toMatchObject({ reactions: 1, profiles: 3, backing: { kind: 'species', id: 'spc_koh', name: 'KOH' } });
    expect(list.rows.find((r) => r.id === 'rgt_mix')?.backing).toEqual({ kind: 'mixture', parts: [{ id: 'rgt_pcc', kind: 'reagent', name: 'PCC', role: 'support' }] });
  });

  it('finds by names, aliases and profile labels and aliases, folded', () => {
    expect(filterReagents(state, indexes, { ...none, text: 'BAEYER' }).rows.map((r) => r.id)).toEqual(['rgt_kmno4']);
    expect(filterReagents(state, indexes, { ...none, text: 'alc. koh' }).rows.map((r) => r.id)).toEqual(['rgt_koh']);
    expect(filterReagents(state, indexes, { ...none, text: 'potassium' }).rows.map((r) => r.id)).toEqual(['rgt_koh', 'rgt_kmno4']);
    expect(filterReagents(state, indexes, { ...none, text: 'zzz' }).rows).toEqual([]);
  });

  it('several families mean any of; facet counts ignore the family choice but follow the name box', () => {
    const list = filterReagents(state, indexes, { text: '', families: ['base', 'catalyst'] });
    expect(list.rows.map((r) => r.id)).toEqual(['rgt_mix', 'rgt_koh']);
    expect(list.familyCounts.oxidant).toBe(2);
    expect(list.familyCounts.base).toBe(1);
    expect(list.familyCounts.solvent).toBe(0);
    const typed = filterReagents(state, indexes, { text: 'potassium', families: [] });
    expect(typed.familyCounts.oxidant).toBe(1);
    expect(typed.familyCounts.catalyst).toBe(0);
  });

  it('an exam scope keeps the reagents with at least one in-scope reaction', () => {
    const outside = (id: string): boolean => id === 'rxn_a1';
    const list = filterReagents(state, indexes, { ...none, outside });
    expect(list.rows.map((r) => r.id)).toEqual(['rgt_pcc']);
    expect(list.familyCounts.base).toBe(0);
    expect(filterReagents(state, indexes, none).rows).toHaveLength(4);
  });
});

describe('reagentUsage (C2)', () => {
  const generic = rxn('g1', 'Generic elimination', [{ ref: sp('subs'), role: 'reactant' }, { ref: rg('koh'), role: 'reagent', profile: 'alc', phase: 'alc' }], { scope: 'generic' });
  const example = rxn('e1', 'Example elimination', [{ ref: sp('subs'), role: 'reactant' }, { ref: rg('koh'), role: 'reagent', profile: 'alc' }], { instanceOf: 'g1' });
  const aq = rxn('q1', 'Aqueous one', [{ ref: sp('subs'), role: 'reactant' }, { ref: rg('koh'), role: 'reagent', profile: 'aq', phase: 'aq', strength: 'dilute' }]);
  const twice = rxn(
    't1',
    'Two ways',
    [
      { ref: sp('subs'), role: 'reactant' },
      { ref: rg('koh'), role: 'reagent', profile: 'aq' },
      { ref: rg('koh'), role: 'workup_reagent', qty: { text: '2 M' } },
    ],
    { stages: [{ kind: 'reaction', members: [0, 1] }, { kind: 'workup', members: [2] }] },
  );
  const bare = rxn('z1', 'Without a profile', [{ ref: sp('subs'), role: 'reactant' }, { ref: rg('koh'), role: 'catalyst', dry: true }]);
  const { state, indexes } = build(generic, example, aq, twice, bare);
  const usage = reagentUsage(state, indexes, 'rgt_koh');

  it('one section per profile in the reagent order, then "no profile"; a profile with no reaction is still there', () => {
    expect(usage.sections.map((s) => s.profileId)).toEqual(['rpf_aq', 'rpf_alc', 'rpf_unused', null]);
    expect(usage.sections.map((s) => s.reactions.length)).toEqual([2, 1, 0, 2]);
    expect(usage.sections[2]?.profile?.label).toBe('Molten KOH');
  });

  it('inside a section examples fold under their general reaction, then folded name, then id', () => {
    const alc = usage.sections[1];
    expect(alc?.reactions).toEqual(['rxn_g1']);
    expect(alc?.examplesOf.get('rxn_g1')).toEqual(['rxn_e1']);
    expect(usage.sections[0]?.reactions).toEqual(['rxn_q1', 'rxn_t1']);
  });

  it('a reaction used two ways is in each section, and the total counts it once', () => {
    expect(usage.sections[3]?.reactions).toEqual(['rxn_t1', 'rxn_z1']);
    expect(usage.total).toBe(5);
  });

  it('carries the facts of each use: role, phase, strength, dry, quantity, stage (2+ stages only)', () => {
    const facts = (section: number, reactionId: string) => usage.sections[section]?.factsOf.get(reactionId);
    expect(facts(1, 'rxn_g1')).toEqual([{ role: 'reagent', phase: 'alc' }]);
    expect(facts(0, 'rxn_q1')).toEqual([{ role: 'reagent', phase: 'aq', strength: 'dilute' }]);
    expect(facts(0, 'rxn_t1')).toEqual([{ role: 'reagent', stage: { position: 1, of: 2 } }]);
    expect(facts(3, 'rxn_t1')).toEqual([{ role: 'workup_reagent', quantity: '2 M', stage: { position: 2, of: 2 } }]);
    expect(facts(3, 'rxn_z1')).toEqual([{ role: 'catalyst', dry: true }]);
  });

  it('partOf lists the reagents whose components include it', () => {
    expect(reagentUsage(state, indexes, 'rgt_pcc').partOf.map((p) => p.id)).toEqual(['rgt_mix']);
    expect(usage.partOf).toEqual([]);
  });

  it('an unknown reagent has nothing', () => {
    expect(reagentUsage(state, indexes, 'rgt_nope')).toEqual({ sections: [], total: 0, partOf: [] });
  });
});

describe('howUsedWords (C3)', () => {
  it('role first, then stage, then the modifiers after a dot', () => {
    expect(howUsedWords({ role: 'reagent', phase: 'alc' })).toBe('reagent · alcoholic');
    expect(howUsedWords({ role: 'catalyst', phase: 'aq', strength: 'dilute' })).toBe('catalyst · aqueous, dilute');
    expect(howUsedWords({ role: 'workup_reagent', stage: { position: 2, of: 2 } })).toBe('work-up reagent, stage 2');
    expect(howUsedWords({ role: 'solvent', dry: true, quantity: 'excess' })).toBe('solvent · dry, excess');
    expect(howUsedWords({ role: 'reagent' })).toBe('reagent');
    expect(howUsedWords({ role: 'workup_reagent', quantity: '2 M', stage: { position: 2, of: 3 } })).toBe('work-up reagent, stage 2 · 2 M');
  });
});
