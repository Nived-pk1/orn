/**
 * familyStudy (step 5.5b; ADR-037) on the demo dataset and on small hand-made states: the two sections, the groups and their order,
 * one card per (reaction, group), the "elsewhere" counts, the arrow text of the outcome's variants, counts and reaction types.
 */
import { describe, expect, it } from 'vitest';
import { familyStudy, UNCLASSIFIED_NAME, type FamilyCard, type FamilyStudy } from '..';
import { UNCLASSIFIED_HUB_ID } from '../navigator/hubs';
import { demoState } from '@/test-support/app-boot-kit';
import { anchorOn, chemClass, cl, contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import type { AnyRecord, RecordRef } from '../../schema';

const demo = contextOf(demoState());
const study = (hub: string): FamilyStudy => familyStudy(demo, hub) as FamilyStudy;
const cardOf = (s: FamilyStudy, section: 'reactionsOf' | 'preparationOf', group: string, name: string): FamilyCard => {
  const found = s[section].groups.find((g) => g.name === group)?.cards.find((c) => c.name.includes(name));
  if (found === undefined) throw new Error(`no card ${name} in ${group}`);
  return found;
};
const below = (card: FamilyCard): string[][] => card.outcomes.map((o) => o.arrowText.below.map((p) => p.text));

describe('familyStudy on the demo', () => {
  const alcohols = study('cls_alcohols');

  it('answers null for a record that is not a hub, and a value for Unclassified', () => {
    expect(familyStudy(demo, 'cls_nowhere')).toBeNull();
    expect(familyStudy(demo, UNCLASSIFIED_HUB_ID)?.name).toBe(UNCLASSIFIED_NAME);
  });

  it('Alcohols: header values', () => {
    expect(alcohols).toMatchObject({ hubId: 'cls_alcohols', name: 'Alcohols', formula: 'R–OH', counts: { reactionsOf: 6, preparationOf: 7, total: 13 } });
    expect(alcohols.reactionTypes[0]).toMatchObject({ name: 'Oxidation', count: 6 });
    const counts = alcohols.reactionTypes.map((t) => t.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('Alcohols: the 413 K variant is in the Ethers group, the 443 K variant in the Alkenes group, each card counting the other', () => {
    const ethers = cardOf(alcohols, 'reactionsOf', 'Ethers', 'Ethanol + conc. H₂SO₄');
    const alkenes = cardOf(alcohols, 'reactionsOf', 'Alkenes', 'Ethanol + conc. H₂SO₄');
    expect(ethers.reactionId).toBe(alkenes.reactionId);
    expect(below(ethers)).toEqual([['413 K']]);
    expect(below(alkenes)).toEqual([['443 K']]);
    expect(ethers.elsewhere).toEqual([{ hubId: 'cls_alkenes', name: 'Alkenes', outcomeCount: 1 }]);
    expect(alkenes.elsewhere).toEqual([{ hubId: 'cls_ethers', name: 'Ethers', outcomeCount: 1 }]);
    expect(ethers.key).not.toBe(alkenes.key);
  });

  it('Alcohols: PCC with ethanol gives ethanal; the card carries refs, the substrate and the products', () => {
    const pcc = cardOf(alcohols, 'reactionsOf', 'Aldehydes', 'Ethanol → ethanal (PCC)');
    expect(pcc.substrate).toMatchObject({ kind: 'species' });
    expect(pcc.outcomes).toHaveLength(1);
    const products = pcc.outcomes[0]?.products ?? [];
    expect(products).toHaveLength(1);
    expect(products[0]?.ref.kind).toBe('species');
    expect(demo.state.records.species[products[0]?.ref.id as string]?.names.canonical.toLowerCase()).toContain('ethanal');
    expect(below(pcc)).toEqual([['Dichloromethane', 'anhydrous']]);
    expect(pcc.elsewhere).toEqual([]);
  });

  it('groups are ordered with Unclassified last; cards by folded name', () => {
    for (const hub of [...demo.indexes.navigatorRollup().hubs.map((h) => h.id), UNCLASSIFIED_HUB_ID]) {
      const s = study(hub);
      for (const section of [s.reactionsOf, s.preparationOf]) {
        const ids = section.groups.map((g) => g.hubId);
        const last = ids.indexOf(UNCLASSIFIED_HUB_ID);
        if (last >= 0) expect(last).toBe(ids.length - 1);
        for (const group of section.groups) {
          const names = group.cards.map((c) => c.name.toLocaleLowerCase('en'));
          expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
        }
      }
    }
  });

  it('a reaction of a family into itself is in both sections, in the group of its own family (Aldehydes: the aldol reaction)', () => {
    const aldehydes = study('cls_aldehydes');
    const inReactions = cardOf(aldehydes, 'reactionsOf', 'Aldehydes', 'Aldol');
    const inPreparation = cardOf(aldehydes, 'preparationOf', 'Aldehydes', 'Aldol');
    expect(inReactions.reactionId).toBe(inPreparation.reactionId);
    expect(aldehydes.counts.total).toBe(aldehydes.counts.reactionsOf + aldehydes.counts.preparationOf - 1);
  });

  it('Unclassified is a family like the others: the Beckmann rearrangement is in both its sections', () => {
    const unclassified = study(UNCLASSIFIED_HUB_ID);
    expect(cardOf(unclassified, 'reactionsOf', UNCLASSIFIED_NAME, 'Beckmann').reactionId).toBe(cardOf(unclassified, 'preparationOf', UNCLASSIFIED_NAME, 'Beckmann').reactionId);
  });

  it('a family with no reactions has empty sections and zero counts (Alkanes)', () => {
    const alkanes = study('cls_alkanes');
    expect(alkanes.counts).toEqual({ reactionsOf: 0, preparationOf: 0, total: 0 });
    expect(alkanes.reactionsOf.groups).toEqual([]);
    expect(alkanes.preparationOf.groups).toEqual([]);
    expect(alkanes.madeFrom).toEqual([]);
    expect(alkanes.turnsInto).toEqual([]);
  });

  it('the partner strips count the reactions of each group', () => {
    expect(alcohols.turnsInto.map((p) => [p.name, p.reactionCount])).toEqual([
      ['Alkenes', 1],
      ['Haloalkanes', 1],
      ['Ethers', 1],
      ['Aldehydes', 3],
      ['Carboxylic acids', 1],
      [UNCLASSIFIED_NAME, 1],
    ]);
    expect(alcohols.madeFrom.reduce((sum, p) => sum + p.reactionCount, 0)).toBe(alcohols.counts.preparationOf);
  });

  it('is deterministic and a pure function of its inputs', () => {
    expect(familyStudy(demo, 'cls_alcohols')).toEqual(familyStudy(demo, 'cls_alcohols'));
  });
});

describe('familyStudy on small states', () => {
  const rec = (r: { kind: RecordRef['kind']; id: string }): RecordRef => ({ kind: r.kind, id: r.id });
  const classes = ['hub-a', 'hub-b'].flatMap((h) => [chemClass(h, h, 'compound_class'), anchorOn(rec(cl(h)), h)]) as AnyRecord[];
  const members = ['hub-a', 'hub-b'].flatMap((h) => [1, 2].map((n) => species(`${h}-${n}`, `${h}-${n}`, { classes: [h] }))) as AnyRecord[];
  const rx = (slug: string, name: string, from: string, outcomes: { sel: 'major' | 'minor' | 'unspecified'; to: string }[]): AnyRecord =>
    reaction({
      slug,
      name,
      scope: 'specific',
      participants: [{ ref: sp(`${from}-1`), role: 'reactant' }],
      outcomes: outcomes.map((o) => ({ sel: o.sel, products: [{ ref: sp(`${o.to}-2`) }] })),
    });

  it('words: unspecified has none; the others are the schema words', () => {
    const ctx = contextOf(stateOf(...classes, ...members, rx('x1', 'X one', 'hub-a', [{ sel: 'major', to: 'hub-b' }, { sel: 'minor', to: 'hub-b' }, { sel: 'unspecified', to: 'hub-b' }])));
    const card = (familyStudy(ctx, 'cls_hub-a') as FamilyStudy).reactionsOf.groups[0]?.cards[0] as FamilyCard;
    expect(card.outcomes.flatMap((o) => o.products.map((p) => p.selectivity))).toEqual(['major', 'minor', null]);
  });

  it('counts outcomes that go elsewhere per group, and orders cards by folded name then ID', () => {
    const ctx = contextOf(
      stateOf(
        ...classes,
        ...members,
        rx('x2', 'bravo', 'hub-a', [{ sel: 'major', to: 'hub-b' }, { sel: 'minor', to: 'hub-a' }, { sel: 'minor', to: 'hub-a' }]),
        rx('x1', 'Alpha', 'hub-a', [{ sel: 'major', to: 'hub-b' }]),
        rx('x3', 'alpha', 'hub-a', [{ sel: 'major', to: 'hub-b' }]),
      ),
    );
    const s = familyStudy(ctx, 'cls_hub-a') as FamilyStudy;
    const toB = s.reactionsOf.groups.find((g) => g.hubId === 'cls_hub-b');
    expect(toB?.cards.map((c) => c.name)).toEqual(['Alpha', 'alpha', 'bravo']);
    expect(toB?.cards[2]?.elsewhere).toEqual([{ hubId: 'cls_hub-a', name: 'hub-a', outcomeCount: 2 }]);
    expect(s.counts).toEqual({ reactionsOf: 3, preparationOf: 1, total: 3 });
  });
});
