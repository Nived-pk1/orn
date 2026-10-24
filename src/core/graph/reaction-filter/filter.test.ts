/**
 * The reaction filter (step 7.1a, ADR-042 E2-E4): every dimension alone, AND across dimensions and OR within one, the "Used as" groups (a
 * spectator never matches; direct references only), the exam-scope marking and hiding with its count, the facets (each option counted with
 * its OWN dimension ignored), an empty filter = every reaction, and a deterministic order. Over a small state made here.
 */
import { describe, expect, it } from 'vitest';
import { indexEngine } from '../../indexes';
import { UNCLASSIFIED_HUB_ID } from '../navigator/hubs';
import { anchorOn, chemClass, cl, reaction, sp, species, stateOf, rg, reagent } from '@/test-support/graph-state';
import type { AnyRecord } from '../../schema';
import { buildReactionFilterInput, filterReactions, type ReactionFilter } from '.';

const ETHANOL = sp('ethanol');
const ETHANAL = sp('ethanal');
const ETHENE = sp('ethene');
const LOOSE = sp('loose');
const PCC = rg('pcc');
const ACID = rg('acid');

const records: AnyRecord[] = [
  chemClass('alcohols', 'Alcohols', 'functional_group'),
  chemClass('aldehydes', 'Aldehydes', 'functional_group'),
  chemClass('alkenes', 'Alkenes', 'functional_group'),
  species('ethanol', 'Ethanol', { classes: ['alcohols'] }),
  species('ethanal', 'Ethanal', { classes: ['aldehydes'] }),
  species('ethene', 'Ethene', { classes: ['alkenes'] }),
  species('loose', 'Loose end'),
  reagent('pcc', 'PCC', { families: [] }),
  reagent('acid', 'Sulfuric acid', { families: [] }),
  anchorOn(cl('alcohols'), 'alcohols'),
  anchorOn(cl('aldehydes'), 'aldehydes'),
  anchorOn(cl('alkenes'), 'alkenes'),
  reaction({
    slug: 'oxid',
    name: 'Oxidation of ethanol',
    scope: 'specific',
    types: ['oxidation'],
    participants: [
      { ref: ETHANOL, role: 'reactant', primary: true },
      { ref: PCC, role: 'reagent' },
    ],
    outcomes: [{ sel: 'exclusive', products: [{ ref: ETHANAL }] }],
  }),
  reaction({
    slug: 'dehyd',
    name: 'Dehydration of ethanol',
    scope: 'specific',
    types: ['dehydration'],
    named: ['dehyd'],
    participants: [
      { ref: ETHANOL, role: 'reactant', primary: true },
      { ref: ACID, role: 'catalyst' },
      { ref: LOOSE, role: 'spectator' },
    ],
    outcomes: [{ sel: 'exclusive', products: [{ ref: ETHENE }] }],
  }),
  reaction({
    slug: 'hydr',
    name: 'Hydration of ethene',
    scope: 'specific',
    types: ['addition', 'dehydration'],
    status: 'review_required',
    reasons: ['check'],
    participants: [
      { ref: ETHENE, role: 'reactant', primary: true },
      { ref: ACID, role: 'catalyst' },
    ],
    outcomes: [{ sel: 'exclusive', products: [{ ref: ETHANOL }, { ref: LOOSE, role: 'coproduct' }] }],
  }),
  reaction({
    slug: 'odd',
    name: 'Résumé of a loose end',
    aliases: ['Zeta rule'],
    scope: 'specific',
    participants: [{ ref: LOOSE, role: 'reactant', primary: true }],
    outcomes: [{ sel: 'exclusive', products: [{ ref: ETHANAL }] }],
  }),
];
const state = stateOf(...records);
const input = buildReactionFilterInput({ state, indexes: indexEngine.build(state, 1) });
const ids = (filter: ReactionFilter, scope?: Parameters<typeof filterReactions>[2]): string[] => filterReactions(input, filter, scope).rows.map((row) => row.id);
const ALL = ['rxn_dehyd', 'rxn_hydr', 'rxn_odd', 'rxn_oxid'];

describe('an empty filter', () => {
  it('is every reaction, in folded-name then ID order, with the total and nothing hidden', () => {
    const result = filterReactions(input, {}, undefined);
    expect(result.rows.map((row) => row.id)).toEqual(['rxn_dehyd', 'rxn_hydr', 'rxn_oxid', 'rxn_odd']); // dehydration, hydration, oxidation, resume
    expect(result.total).toBe(4);
    expect(result.hiddenByScope).toBe(0);
    expect(ids({})).toEqual(ids({ substanceIds: [], fromFamilyIds: [], text: '  ' }));
  });
  it('is deterministic', () => {
    expect(JSON.stringify(filterReactions(input, { typeIds: ['cpt_dehydration'] }, undefined))).toBe(JSON.stringify(filterReactions(input, { typeIds: ['cpt_dehydration'] }, undefined)));
  });
});

describe('each dimension alone', () => {
  it('From and To family: the family page\'s own sets (a substrate with no class is Unclassified)', () => {
    expect(ids({ fromFamilyIds: ['cls_alcohols'] }).sort()).toEqual(['rxn_dehyd', 'rxn_oxid']);
    expect(ids({ toFamilyIds: ['cls_alcohols'] })).toEqual(['rxn_hydr']);
    expect(ids({ fromFamilyIds: [UNCLASSIFIED_HUB_ID] })).toEqual(['rxn_odd']);
    const row = filterReactions(input, {}, undefined).rows.find((one) => one.id === 'rxn_odd');
    expect(row).toMatchObject({ fromFamilyIds: [UNCLASSIFIED_HUB_ID], toFamilyIds: ['cls_aldehydes'] });
  });
  it('Reaction type: the reaction\'s own types', () => {
    expect(ids({ typeIds: ['cpt_dehydration'] }).sort()).toEqual(['rxn_dehyd', 'rxn_hydr']);
  });
  it('Named reaction', () => {
    expect(ids({ namedReactionIds: ['nrx_dehyd'] })).toEqual(['rxn_dehyd']);
  });
  it('Review status', () => {
    expect(ids({ reviewStatuses: ['review_required'] })).toEqual(['rxn_hydr']);
  });
  it('Name: folded text in the name and the aliases (case and accents ignored)', () => {
    expect(ids({ text: 'HYDRATION' }).sort()).toEqual(['rxn_dehyd', 'rxn_hydr']);
    expect(ids({ text: 'resume' })).toEqual(['rxn_odd']);
    expect(ids({ text: 'zeta' })).toEqual(['rxn_odd']);
    expect(ids({ text: 'nothing like this' })).toEqual([]);
  });
});

describe('Substance and "Used as"', () => {
  it('Starting material: role reactant only', () => {
    expect(ids({ substanceIds: ['spc_ethanol'], usedAs: 'reactant' }).sort()).toEqual(['rxn_dehyd', 'rxn_oxid']);
  });
  it('On the arrow: reagent, catalyst, solvent, initiator, promoter, additive, workup reagent', () => {
    expect(ids({ substanceIds: ['rgt_acid'], usedAs: 'arrow' }).sort()).toEqual(['rxn_dehyd', 'rxn_hydr']);
    expect(ids({ substanceIds: ['rgt_pcc'], usedAs: 'arrow' })).toEqual(['rxn_oxid']);
    expect(ids({ substanceIds: ['rgt_pcc'], usedAs: 'reactant' })).toEqual([]);
  });
  it('Product: every product role, a coproduct too', () => {
    expect(ids({ substanceIds: ['spc_ethanol'], usedAs: 'product' })).toEqual(['rxn_hydr']);
    expect(ids({ substanceIds: ['spc_loose'], usedAs: 'product' })).toEqual(['rxn_hydr']);
  });
  it('Any: reactant, arrow or product; a SPECTATOR never matches, not even under Any', () => {
    expect(ids({ substanceIds: ['spc_loose'], usedAs: 'any' }).sort()).toEqual(['rxn_hydr', 'rxn_odd']);
    expect(ids({ substanceIds: ['spc_loose'] }).sort()).toEqual(['rxn_hydr', 'rxn_odd']); // Any is the default
    expect(ids({ substanceIds: ['spc_loose'], usedAs: 'arrow' })).toEqual([]); // in rxn_dehyd only as a spectator
  });
  it('direct references only: a class does not stand for its species, a species not for its class', () => {
    expect(ids({ substanceIds: ['cls_alcohols'] })).toEqual([]);
    expect(ids({ substanceIds: ['cls_alcohols', 'spc_ethene'], usedAs: 'reactant' })).toEqual(['rxn_hydr']);
  });
});

describe('AND across dimensions, OR within one', () => {
  it('values inside a dimension are alternatives', () => {
    expect(ids({ typeIds: ['cpt_oxidation', 'cpt_addition'] }).sort()).toEqual(['rxn_hydr', 'rxn_oxid']);
    expect(ids({ substanceIds: ['rgt_pcc', 'rgt_acid'], usedAs: 'arrow' }).sort()).toEqual(['rxn_dehyd', 'rxn_hydr', 'rxn_oxid']);
  });
  it('dimensions all have to hold', () => {
    expect(ids({ typeIds: ['cpt_dehydration'], fromFamilyIds: ['cls_alcohols'] })).toEqual(['rxn_dehyd']);
    expect(ids({ typeIds: ['cpt_dehydration'], fromFamilyIds: ['cls_alcohols'], text: 'hydration of ethene' })).toEqual([]);
  });
});

describe('exam scope', () => {
  const scope = (ref: { id: string }) => (ref.id === 'rxn_dehyd' ? ('outside' as const) : ('official' as const));
  it('by default nothing is hidden; an outside reaction is only marked', () => {
    const result = filterReactions(input, {}, scope);
    expect(result.rows).toHaveLength(4);
    expect(result.rows.filter((row) => row.outside).map((row) => row.id)).toEqual(['rxn_dehyd']);
    expect(result.hiddenByScope).toBe(0);
  });
  it('"Only <exam version>" hides them and says how many', () => {
    const result = filterReactions(input, { onlyInScope: true }, scope);
    expect(result.rows.map((row) => row.id)).toEqual(['rxn_hydr', 'rxn_oxid', 'rxn_odd']);
    expect(result.hiddenByScope).toBe(1);
    expect(result.total).toBe(4);
  });
  it('the hidden count is of the reactions the OTHER filters let through', () => {
    expect(filterReactions(input, { onlyInScope: true, typeIds: ['cpt_oxidation'] }, scope).hiddenByScope).toBe(0);
    expect(filterReactions(input, { onlyInScope: true, typeIds: ['cpt_dehydration'] }, scope)).toMatchObject({ hiddenByScope: 1 });
  });
  it('with no exam chosen, Only does nothing and nothing is marked', () => {
    const result = filterReactions(input, { onlyInScope: true }, undefined);
    expect(result.rows).toHaveLength(4);
    expect(result.rows.some((row) => row.outside)).toBe(false);
  });
});

describe('facets (E4)', () => {
  const count = (list: readonly { id: string; count: number }[], id: string): number | undefined => list.find((one) => one.id === id)?.count;
  it('count each option with its OWN dimension ignored and every other dimension applied', () => {
    const { facets } = filterReactions(input, { typeIds: ['cpt_oxidation'], fromFamilyIds: ['cls_alcohols'] }, undefined);
    // type facets ignore the type filter: from alcohols = dehyd (dehydration) + oxid (oxidation)
    expect(count(facets.type, 'cpt_dehydration')).toBe(1);
    expect(count(facets.type, 'cpt_oxidation')).toBe(1);
    expect(count(facets.type, 'cpt_addition')).toBeUndefined(); // 0 matches and not selected: not listed
    // from-family facets ignore the from filter: oxidation only
    expect(count(facets.fromFamily, 'cls_alcohols')).toBe(1);
    expect(count(facets.fromFamily, 'cls_alkenes')).toBeUndefined();
  });
  it('a selected option with 0 matches is still listed, with 0', () => {
    const { facets } = filterReactions(input, { typeIds: ['cpt_addition'], fromFamilyIds: ['cls_alcohols'] }, undefined);
    expect(count(facets.type, 'cpt_addition')).toBe(0);
    expect(count(facets.fromFamily, 'cls_alcohols')).toBe(0);
  });
  it('substance facets follow "Used as" and ignore the chosen substances', () => {
    const { facets } = filterReactions(input, { usedAs: 'arrow' }, undefined);
    expect(count(facets.substance, 'rgt_acid')).toBe(2);
    expect(count(facets.substance, 'rgt_pcc')).toBe(1);
    expect(count(facets.substance, 'spc_ethanol')).toBeUndefined();
  });
  it('are of the reactions the exam scope lets through', () => {
    const scope = (ref: { id: string }) => (ref.id === 'rxn_dehyd' ? ('outside' as const) : ('official' as const));
    expect(count(filterReactions(input, { onlyInScope: true }, scope).facets.type, 'cpt_dehydration')).toBe(1);
    expect(count(filterReactions(input, {}, scope).facets.type, 'cpt_dehydration')).toBe(2);
  });
});

describe('totals', () => {
  it('ALL is what the input holds', () => {
    expect(ids({}).sort()).toEqual(ALL);
  });
});
