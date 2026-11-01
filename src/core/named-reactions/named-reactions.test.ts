/**
 * 7.4 Part C: the named-reaction list (text on name and aliases, exam scope, sort, empty records apart) and a named reaction's page
 * (family, reactions with examples folded, mechanisms reached through the reactions, caveats). Pure and derived.
 */
import { describe, expect, it } from 'vitest';
import type { AnyRecord } from '@/core/schema';
import { concept, sp, species } from '@/test-support/demo/kit';
import { reaction } from '@/test-support/demo/reaction-kit';
import { contextOf, stateOf } from '@/test-support/graph-state';
import { caveatOn, mechanismRecord, mechStep, mechVariant, namedReaction, nrxRef } from '@/test-support/named-kit';
import { filterNamedReactions, namedReactionPage } from './index';

const rxn = (slug: string, name: string, extra: Partial<Parameters<typeof reaction>[0]> = {}) =>
  reaction({ slug, name, scope: 'specific', participants: [{ ref: sp('subs'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('prod') }] }], ...extra });

const fc = namedReaction('fc', 'Friedel–Crafts reaction', { aliases: ['Friedel Crafts'] });
const fca = namedReaction('fca', 'Friedel–Crafts acylation', { parents: ['fc'], aliases: ['FC acylation'], summary: 'An acyl group adds to an arene.', concepts: ['eas'], prerequisites: ['acyl'] });
const cannizzaro = namedReaction('can', 'Cannizzaro reaction', { aliases: ['Cannizzaro'], summary: 'Disproportionation.' });
const aldol = namedReaction('ald', 'aldol reaction', { notes: 'Notes only.' });
const blank = namedReaction('blank', 'Blank reaction');
const mech = mechanismRecord('m1', 'Aldol mechanism', [mechVariant('v1', 'Base', [mechStep('s1')])]);
const general = rxn('gen', 'General acylation', { named: ['fca'], scope: 'generic', mechanisms: ['m1'] });
const example = rxn('ex', 'Benzene acylation', { named: ['fca'], instanceOf: 'gen' });
const can1 = rxn('can1', 'Benzaldehyde Cannizzaro', { named: ['can'] });
const base: AnyRecord[] = [fc, fca, cannizzaro, aldol, blank, mech, general, example, can1, concept('eas', 'Electrophilic aromatic substitution', 'reaction_type'), concept('acyl', 'Acyl chlorides', 'reaction_type'), species('subs', 'Substrate'), species('prod', 'Product')];

function build(...more: AnyRecord[]) {
  const state = stateOf(...base, ...more);
  return { state, indexes: contextOf(state).indexes };
}

describe('filterNamedReactions', () => {
  const { state, indexes } = build();
  const none = { text: '' };

  it('lists the written records by folded name, then id; the empty ones come apart', () => {
    const list = filterNamedReactions(state, indexes, none);
    expect(list.rows.map((r) => r.name)).toEqual(['aldol reaction', 'Cannizzaro reaction', 'Friedel–Crafts acylation', 'Friedel–Crafts reaction']);
    expect(list.empty.map((r) => r.name)).toEqual(['Blank reaction']);
    expect(list.total).toBe(5);
  });

  it('a record with notes only counts as written; a parent counts the reactions of its family', () => {
    const list = filterNamedReactions(state, indexes, none);
    expect(list.rows.find((r) => r.id === 'nrx_ald')).toMatchObject({ reactions: 0 });
    expect(list.rows.find((r) => r.id === 'nrx_fc')).toMatchObject({ reactions: 2 });
    expect(list.rows.find((r) => r.id === 'nrx_fca')).toMatchObject({ reactions: 2, parents: [{ id: 'nrx_fc', name: 'Friedel–Crafts reaction' }], hasMechanism: true, aliases: ['FC acylation'] });
    expect(list.rows.find((r) => r.id === 'nrx_can')).toMatchObject({ reactions: 1, hasMechanism: false });
  });

  it('text matches the name and the aliases, folded', () => {
    expect(filterNamedReactions(state, indexes, { text: 'fc acyl' }).rows.map((r) => r.id)).toEqual(['nrx_fca']);
    expect(filterNamedReactions(state, indexes, { text: 'FRIEDEL' }).rows.map((r) => r.id)).toEqual(['nrx_fca', 'nrx_fc']);
    expect(filterNamedReactions(state, indexes, { text: 'cannizaro' }).rows).toEqual([]);
    expect(filterNamedReactions(state, indexes, { text: 'blank' }).empty.map((r) => r.id)).toEqual(['nrx_blank']);
  });

  it('with an exam scope a record is kept when one of its reactions is not outside it; empty records are hidden', () => {
    const outside = (id: string): boolean => id === 'rxn_can1' || id === 'rxn_gen';
    const list = filterNamedReactions(state, indexes, { text: '', outside });
    expect(list.rows.map((r) => r.id)).toEqual(['nrx_fca', 'nrx_fc']); // fca still has `ex`
    expect(list.empty).toEqual([]);
    expect(filterNamedReactions(state, indexes, { text: '', outside: () => true }).rows).toEqual([]);
  });
});

describe('namedReactionPage', () => {
  const cav = caveatOn('c1', 'Acylation caveat', [nrxRef('fca')]);
  const cavOnReaction = caveatOn('c2', 'Reaction caveat', [{ kind: 'reaction', id: 'rxn_ex' } as never]);
  const { state, indexes } = build(cav, cavOnReaction);

  it('has the family, the concepts and the reactions with the examples folded under the general one', () => {
    const page = namedReactionPage(state, indexes, 'nrx_fca');
    expect(page).toBeDefined();
    expect(page?.parents).toEqual([{ id: 'nrx_fc', name: 'Friedel–Crafts reaction' }]);
    expect(page?.concepts).toEqual([{ id: 'cpt_eas', name: 'Electrophilic aromatic substitution' }]);
    expect(page?.prerequisites.map((c) => c.name)).toEqual(['Acyl chlorides']);
    expect(page?.reactions.reactions).toEqual(['rxn_gen']);
    expect(page?.reactions.examplesOf.get('rxn_gen')).toEqual(['rxn_ex']);
    expect(page?.reactions.count).toBe(2);
  });

  it('the parent lists its children and the reactions of the family below it', () => {
    const page = namedReactionPage(state, indexes, 'nrx_fc');
    expect(page?.children).toEqual([{ id: 'nrx_fca', name: 'Friedel–Crafts acylation' }]);
    expect(page?.reactions.count).toBe(2);
    expect(page?.mechanisms).toEqual([{ id: 'mec_m1', name: 'Aldol mechanism' }]);
  });

  it('reaches its mechanisms through its reactions', () => {
    expect(namedReactionPage(state, indexes, 'nrx_fca')?.mechanisms).toEqual([{ id: 'mec_m1', name: 'Aldol mechanism' }]);
    expect(namedReactionPage(state, indexes, 'nrx_can')?.mechanisms).toEqual([]);
  });

  it('caveats: its own and those of its reactions, each once, by title', () => {
    expect(namedReactionPage(state, indexes, 'nrx_fca')?.caveats.map((c) => c.title)).toEqual(['Acylation caveat', 'Reaction caveat']);
    expect(namedReactionPage(state, indexes, 'nrx_can')?.caveats).toEqual([]);
  });

  it('an unknown id has no page', () => {
    expect(namedReactionPage(state, indexes, 'nrx_nope')).toBeUndefined();
  });
});
