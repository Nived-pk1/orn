/** The inspector's one pure view of the map selection (step 8.2b-fix, S1 to S3): each kind of selection, the arrow's words, the bucket's rows. */
import { describe, expect, it } from 'vitest';
import { UNCLASSIFIED_HUB_ID } from '@/core/graph';
import { anchorOn, chemClass, cl, contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import type { AnyRecord } from '@/core/schema';
import { mapInspectorView, NOT_IN_A_FAMILY } from './map-inspector-view';

const step = (slug: string, from: string, product: string): AnyRecord =>
  reaction({ slug, name: `R ${slug}`, scope: 'specific', participants: [{ ref: sp(from), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp(product) }] }] });
const state = stateOf(
  chemClass('amines', 'Amines', 'compound_class'), anchorOn({ kind: 'class', id: cl('amines').id }, 'amines'),
  chemClass('alkynes', 'Alkynes', 'compound_class'), anchorOn({ kind: 'class', id: cl('alkynes').id }, 'alkynes'),
  species('a1', 'A one', { classes: ['amines'] }), species('b1', 'B one', { classes: ['alkynes'] }),
  species('loner', 'Loner'), species('other', 'Other'),
  step('r1', 'a1', 'loner'), step('r2', 'a1', 'loner'), step('r3', 'loner', 'b1'), step('r4', 'a1', 'b1'), step('r5', 'a1', 'other'), step('r6', 'other', 'b1'), step('r7', 'loner', 'b1'),
);
const snapshot = () => {
  const context = contextOf(state);
  return { state, indexes: context.indexes };
};
const AMINES = cl('amines').id;
const ALKYNES = cl('alkynes').id;

describe('mapInspectorView', () => {
  it('none is the empty state', () => {
    expect(mapInspectorView({ kind: 'none' }, snapshot(), 'study')).toEqual({ kind: 'empty' });
  });
  it('a record (a family or anything opened) is shown as that record', () => {
    expect(mapInspectorView({ kind: 'class', id: AMINES }, snapshot(), 'study')).toEqual({ kind: 'record', ref: { kind: 'class', id: AMINES } });
  });
  it('an arrow between two families: the arrow chip, "From → To", both ends as cards, its reactions as rows', () => {
    const view = mapInspectorView({ kind: 'arrow', from: AMINES, to: ALKYNES }, snapshot(), 'study');
    if (view.kind !== 'arrow') throw new Error('not an arrow view');
    expect(view.chip).toBe('Arrow');
    expect(view.title).toBe('Amines → Alkynes');
    expect(view.from).toMatchObject({ id: AMINES, name: 'Amines', bucket: false });
    expect(view.to).toMatchObject({ id: ALKYNES, name: 'Alkynes', bucket: false });
    expect(view.reactions.map((row) => row.id)).toEqual(['rxn_r4']);
    expect(view.count).toBe('1 reaction');
  });
  it('an arrow into the bucket names it in words, never "Unclassified"', () => {
    const view = mapInspectorView({ kind: 'arrow', from: AMINES, to: UNCLASSIFIED_HUB_ID }, snapshot(), 'study');
    if (view.kind !== 'arrow') throw new Error('not an arrow view');
    expect(view.title).toBe(`Amines → ${NOT_IN_A_FAMILY}`);
    expect(view.to.bucket).toBe(true);
    expect(view.reactions.map((row) => row.id)).toEqual(['rxn_r1', 'rxn_r2', 'rxn_r5']);
    expect(view.count).toBe('3 reactions');
  });
  it('an arrow out of the bucket', () => {
    const view = mapInspectorView({ kind: 'arrow', from: UNCLASSIFIED_HUB_ID, to: ALKYNES }, snapshot(), 'study');
    if (view.kind !== 'arrow') throw new Error('not an arrow view');
    expect(view.title).toBe(`${NOT_IN_A_FAMILY} → Alkynes`);
    expect(view.from.bucket).toBe(true);
    expect(view.reactions.map((row) => row.id)).toEqual(['rxn_r3', 'rxn_r6', 'rxn_r7']);
  });
  it('an arrow that does not exist any more shows the empty state, never another subject', () => {
    expect(mapInspectorView({ kind: 'arrow', from: ALKYNES, to: AMINES }, snapshot(), 'study')).toEqual({ kind: 'empty' });
  });
  it('the bucket: chip, title, lead, one row per compound with made-from and goes-on-to chips, most reactions first then name', () => {
    const view = mapInspectorView({ kind: 'bucket' }, snapshot(), 'study');
    if (view.kind !== 'bucket') throw new Error('not a bucket view');
    expect(view.chip).toBe(NOT_IN_A_FAMILY);
    expect(view.title).toBe('Compounds not in a family yet');
    expect(view.lead).toBe('These compounds appear in reactions, but no family covers them yet.');
    expect(view.rows.map((row) => [row.name, row.reactions])).toEqual([['Loner', 4], ['Other', 2]]);
    const loner = view.rows[0];
    expect(loner?.madeFrom).toEqual([{ id: AMINES, name: 'Amines', count: 2 }]);
    expect(loner?.goesOn).toEqual([{ id: ALKYNES, name: 'Alkynes', count: 2 }]);
    expect(view.rows[1]?.madeFrom).toEqual([{ id: AMINES, name: 'Amines', count: 1 }]);
    expect(view.rows[1]?.goesOn).toEqual([{ id: ALKYNES, name: 'Alkynes', count: 1 }]);
  });
  it('Studio adds the authors line, Study does not', () => {
    const study = mapInspectorView({ kind: 'bucket' }, snapshot(), 'study');
    const studio = mapInspectorView({ kind: 'bucket' }, snapshot(), 'studio');
    expect(study.kind === 'bucket' && study.authorsLine).toBeUndefined();
    expect(studio.kind === 'bucket' && studio.authorsLine).toBe('Give these compounds a family in the content data');
  });
});
