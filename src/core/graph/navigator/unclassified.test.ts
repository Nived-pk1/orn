/** The compounds that lead nowhere yet (step 8.2a, D5): which products sit in no family, and how many reactions lead to each. */
import { describe, expect, it } from 'vitest';
import type { AnyRecord } from '../../schema';
import { anchorOn, chemClass, cl, contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import { unclassifiedProducts } from './unclassified';

const hubA = chemClass('hub-a', 'Hub A', 'compound_class');
const members = ['a1', 'a2'].map((n) => species(n, n, { classes: ['hub-a'] }));
const to = (slug: string, from: string, product: string): AnyRecord =>
  reaction({ slug, name: `R ${slug}`, scope: 'specific', participants: [{ ref: sp(from), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp(product) }] }] });
const state = stateOf(
  hubA, anchorOn({ kind: 'class', id: cl('hub-a').id }, 'hub-a'), ...members, species('loner', 'Loner'), species('other', 'Other'),
  to('r1', 'a1', 'loner'), to('r2', 'a2', 'loner'), to('r3', 'a1', 'other'), to('r4', 'a1', 'a2'), to('r5', 'a1', 'loner'),
);

describe('unclassifiedProducts', () => {
  it('lists each product that is in no family with its distinct reactions, most first, and leaves family products out', () => {
    const rows = unclassifiedProducts(contextOf(state).indexes);
    expect(rows.map((row) => [row.ref.id, row.reactions])).toEqual([['spc_loner', 3], ['spc_other', 1]]);
    expect(rows[0]?.reactionIds).toEqual(['rxn_r1', 'rxn_r2', 'rxn_r5']);
  });

  it('no family-less product: nothing', () => {
    expect(unclassifiedProducts(contextOf(stateOf(hubA, anchorOn({ kind: 'class', id: cl('hub-a').id }, 'hub-a'), ...members, to('r4', 'a1', 'a2'))).indexes)).toEqual([]);
  });
});
