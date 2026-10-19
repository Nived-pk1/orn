/**
 * Outcome groups on the family card (outcome groups step, part 2): the demo's reactions with several outcomes and small hand-made states.
 * One group per condition-variant set; the arrow, the heading and the equation once per group; the word with and without regiochemistry;
 * a coproduct or byproduct several outcomes share is written once, matched by record, never by name.
 */
import { describe, expect, it } from 'vitest';
import { familyStudy, type FamilyCard, type FamilyStudy } from '..';
import { demoState } from '@/test-support/app-boot-kit';
import { anchorOn, chemClass, cl, contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import type { AnyRecord, RecordRef } from '../../schema';
import { headingOf } from './groups';

const demo = contextOf(demoState());
const cardIn = (hub: string, group: string, name: string): FamilyCard => {
  const study = familyStudy(demo, hub) as FamilyStudy;
  const found = study.reactionsOf.groups.find((g) => g.name === group)?.cards.find((c) => c.name.includes(name));
  if (found === undefined) throw new Error(`no card ${name} in ${group}`);
  return found;
};
const words = (card: FamilyCard): (string | null)[][] => card.groups.map((g) => g.outcomes.map((o) => o.word));
const plain = (parts: readonly { readonly text: string }[]): string => parts.map((p) => p.text).join(' ');

describe('the demo cards with several outcomes', () => {
  it('(R)-2-bromobutane + alc. KOH: ONE group, major then minor, each word with its regiochemistry, one arrow and one equation', () => {
    const card = cardIn('cls_haloalkanes', 'Alkenes', 'alc. KOH');
    expect(card.groups).toHaveLength(1);
    const group = card.groups[0];
    expect(group?.outcomes.map((o) => o.products.map((p) => p.selectivity))).toEqual([['major'], ['minor']]);
    expect(words(card)).toEqual([['major · Saytzeff', 'minor · Hofmann']]);
    expect(plain(group?.arrowText.above ?? [])).toContain('KOH');
    const equation = group?.equation;
    expect(equation?.reactants.map((t) => t.name)).toEqual(['(R)-2-bromobutane']);
    expect(equation?.products.map((t) => [t.name, t.word, t.regiochemistry])).toEqual([
      ['But-2-ene', 'major', 'Saytzeff'],
      ['But-1-ene', 'minor', 'Hofmann'],
    ]);
    expect(equation?.text).toBe('(R)-2-bromobutane with alc. KOH, heat, basic medium gives But-2-ene (major) and But-1-ene (minor)');
  });

  it('propene + HBr: one group; the major (Markovnikov) first, whatever the stored order', () => {
    const card = cardIn('cls_alkenes', 'Haloalkanes', 'Propene + HBr');
    expect(words(card).length).toBe(Math.min(1, words(card).length));
    const peroxide = cardIn('cls_alkenes', 'Haloalkanes', 'peroxide');
    expect(words(peroxide)).toEqual([['major · anti-Markovnikov', 'minor · Markovnikov']]);
    expect(words(card)).toEqual([['major · Markovnikov', 'minor · anti-Markovnikov']]);
  });

  it('the aldol reaction: TWO groups (one variant each), each with its own arrow and heading', () => {
    const card = cardIn('cls_aldehydes', 'Aldehydes', 'Aldol');
    expect(card.groups.map((g) => g.conditionVariantIds)).toEqual([['cvr_ethanal-aldol-1'], ['cvr_ethanal-aldol-2']]);
    // the reaction has no stage, so its arrow states no condition: the heading is the variant's own label
    expect(card.groups.map((g) => g.heading)).toEqual(['Base-catalysed (dilute NaOH, cold)', 'Acid-catalysed']);
    expect(card.groups.map((g) => plain(g.arrowText.above))).toEqual([expect.stringContaining('NaOH'), expect.not.stringContaining('NaOH')]);
    // one outcome in each group: the word is the selectivity word alone
    expect(words(card)).toEqual([['major'], ['major']]);
    expect(card.groups.map((g) => g.equation?.outcomeIds.length)).toEqual([1, 1]);
  });
});

describe('outcome groups on small states', () => {
  const rec = (r: { kind: RecordRef['kind']; id: string }): RecordRef => ({ kind: r.kind, id: r.id });
  const hubs = ['hub-a', 'hub-b'].flatMap((h) => [chemClass(h, h, 'compound_class'), anchorOn(rec(cl(h)), h)]) as AnyRecord[];
  const members = ['hub-a', 'hub-b'].flatMap((h) => [1, 2, 3].map((n) => species(`${h}-${n}`, `${h}-${n}`, { classes: [h] }))) as AnyRecord[];
  // two species that are NOT the same record but have the same name
  const waters = [species('water-1', 'Water', {}), species('water-2', 'Water', {})] as AnyRecord[];
  const v = (label: string, kelvin: number) => ({ label, params: { temperature: { kind: 'value' as const, value: kelvin, unit: 'K' as const } } });
  const rx = (over: Partial<Parameters<typeof reaction>[0]>): AnyRecord =>
    reaction({ slug: 'x1', name: 'X one', scope: 'specific', participants: [{ ref: sp('hub-a-1'), role: 'reactant' }], stages: [{ kind: 'reaction', members: [0] }], outcomes: [], ...over });
  const cardOf = (...records: AnyRecord[]): FamilyCard => {
    const study = familyStudy(contextOf(stateOf(...hubs, ...members, ...waters, ...records)), 'cls_hub-a') as FamilyStudy;
    return study.reactionsOf.groups[0]?.cards[0] as FamilyCard;
  };

  it('two disjoint variants: two groups headed by their conditions in words ("At 413 K"), a measured value after "At"', () => {
    const card = cardOf(
      rx({
        variants: [v('413 K', 413), v('443 K', 443)],
        outcomes: [
          { variants: [0], sel: 'major', products: [{ ref: sp('hub-b-1') }] },
          { variants: [1], sel: 'major', products: [{ ref: sp('hub-b-2') }] },
        ],
      }),
    );
    expect(card.groups.map((g) => g.heading)).toEqual(['At 413 K', 'At 443 K']);
    expect(card.groups.map((g) => plain(g.arrowText.below))).toEqual(['413 K', '443 K']);
  });

  it('a group of all variants (empty set) apart from a named one; the empty one is headed "In all variants"', () => {
    const card = cardOf(
      rx({
        variants: [v('413 K', 413)],
        outcomes: [
          { sel: 'major', products: [{ ref: sp('hub-b-1') }] },
          { variants: [0], sel: 'minor', products: [{ ref: sp('hub-b-2') }] },
        ],
      }),
    );
    expect(card.groups.map((g) => g.key)).toEqual(['', 'cvr_x1-1']);
    expect(card.groups.map((g) => g.heading)).toEqual(['In all variants', 'At 413 K']);
  });

  it('the group order inside a card is the schema order (a minor stored first is still second)', () => {
    const card = cardOf(
      rx({
        outcomes: [
          { sel: 'minor', regio: 'Hofmann', products: [{ ref: sp('hub-b-1') }] },
          { sel: 'unspecified', products: [{ ref: sp('hub-b-3') }] },
          { sel: 'major', regio: 'Saytzeff', products: [{ ref: sp('hub-b-2') }] },
        ],
      }),
    );
    expect(card.groups).toHaveLength(1);
    expect(words(card)).toEqual([['major · Saytzeff', 'minor · Hofmann', null]]);
    expect(card.groups[0]?.equation?.products.map((t) => t.name)).toEqual(['hub-b-2', 'hub-b-1', 'hub-b-3']);
  });

  it('a byproduct that several outcomes share (the same species ID) is written ONCE, after all the main products', () => {
    const card = cardOf(
      rx({
        outcomes: [
          { sel: 'major', products: [{ ref: sp('hub-b-1') }, { ref: sp('water-1'), role: 'byproduct' }] },
          { sel: 'minor', products: [{ ref: sp('hub-b-2') }, { ref: sp('water-1'), role: 'byproduct' }] },
        ],
      }),
    );
    const terms = card.groups[0]?.equation?.products ?? [];
    expect(terms.map((t) => [t.name, t.role])).toEqual([
      ['hub-b-1', null],
      ['hub-b-2', null],
      ['Water', 'byproduct'],
    ]);
    expect(card.groups[0]?.equation?.text).toMatch(/gives hub-b-1 \(major\), hub-b-2 \(minor\) and Water \(byproduct\)$/);
  });

  it('a species with the same NAME but another ID is a different species and is written as well', () => {
    const card = cardOf(
      rx({
        outcomes: [
          { sel: 'major', products: [{ ref: sp('hub-b-1') }, { ref: sp('water-1'), role: 'byproduct' }] },
          { sel: 'minor', products: [{ ref: sp('hub-b-2') }, { ref: sp('water-2'), role: 'byproduct' }] },
        ],
      }),
    );
    expect((card.groups[0]?.equation?.products ?? []).filter((t) => t.name === 'Water')).toHaveLength(2);
  });

  it('"both exclusive" still holds inside one outcome of a group', () => {
    const card = cardOf(
      rx({
        outcomes: [
          { sel: 'exclusive', products: [{ ref: sp('hub-b-1') }, { ref: sp('hub-b-2') }] },
          { sel: 'minor', products: [{ ref: sp('hub-b-3') }] },
        ],
      }),
    );
    expect(card.groups[0]?.equation?.products.map((t) => [t.name, t.word, t.quantifier])).toEqual([
      ['hub-b-1', null, null],
      ['hub-b-2', 'exclusive', 'both'],
      ['hub-b-3', 'minor', null],
    ]);
  });

  it('one outcome: the word has no regiochemistry and the equation is the one-outcome equation, as before the groups', () => {
    const card = cardOf(rx({ outcomes: [{ sel: 'major', regio: 'substitution', products: [{ ref: sp('hub-b-1') }, { ref: sp('water-1'), role: 'byproduct' }] }] }));
    expect(card.groups).toHaveLength(1);
    expect(words(card)).toEqual([['major']]);
    expect(card.groups[0]?.equation?.products.map((t) => t.regiochemistry)).toEqual([null, null]);
    expect(card.groups[0]?.equation?.text).toBe('hub-a-1 → hub-b-1 (major) + Water (byproduct)');
  });

  it('a regiochemistry without a selectivity word is the word alone', () => {
    const card = cardOf(
      rx({
        outcomes: [
          { sel: 'unspecified', regio: 'ortho', products: [{ ref: sp('hub-b-1') }] },
          { sel: 'unspecified', regio: 'para', products: [{ ref: sp('hub-b-2') }] },
        ],
      }),
    );
    expect(words(card)).toEqual([['ortho', 'para']]);
  });
});

describe('headingOf', () => {
  const arrow = (...conditions: string[]) => ({ above: [], below: conditions.map((text) => ({ text, kind: 'condition' as const })) });

  it('says "At" before a measured value only', () => {
    expect(headingOf(arrow('413 K'), [])).toBe('At 413 K');
    expect(headingOf(arrow('0–5 °C', 'acidic medium'), [])).toBe('At 0–5 °C, acidic medium');
    expect(headingOf(arrow('−10 to 5 °C'), [])).toBe('At −10 to 5 °C');
    expect(headingOf(arrow('cold', 'basic medium'), [])).toBe('cold, basic medium');
  });

  it('falls back to the variants\' labels, then to "In all variants"; never empty', () => {
    expect(headingOf(arrow(), ['Acid-catalysed', 'Heated'])).toBe('Acid-catalysed / Heated');
    expect(headingOf(arrow(), [])).toBe('In all variants');
  });
});
