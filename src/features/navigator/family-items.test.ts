import { describe, expect, it } from 'vitest';
import { familyStudy, type FamilyStudy } from '@/core/graph';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import { cardKey, emptyTextOf, estimateOf, familyItems, groupKey, groupTitleOf, indexOfKey, noReactionsTextOf, titleOf } from './family-items';

const ctx = contextOf(demoState());
const study = (hub: string): FamilyStudy => familyStudy(ctx, hub) as FamilyStudy;

describe('familyItems', () => {
  const items = familyItems(study('cls_alcohols'));

  it('starts with the header, then each section with its groups and cards, in order', () => {
    expect(items[0]?.kind).toBe('header');
    expect(items.filter((i) => i.kind === 'section').map((i) => (i.kind === 'section' ? i.title : ''))).toEqual(['Reactions of Alcohols', 'Preparation of Alcohols']);
    // a card follows the group it belongs to, never another section's group
    let current = '';
    for (const item of items) {
      if (item.kind === 'group') current = item.key;
      if (item.kind === 'card') expect(current).toBe(groupKey(item.section, item.hubId));
    }
  });

  it('every item has a unique key, and the card keys are the ones the links use', () => {
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    const pcc = items.find((i) => i.kind === 'card' && i.card.name === 'Ethanol → ethanal (PCC)');
    expect(pcc?.key).toBe(cardKey('reactions_of', 'cls_aldehydes', pcc?.kind === 'card' ? pcc.card.reactionId : ''));
    expect(indexOfKey(items, pcc?.key ?? '')).toBeGreaterThan(0);
    expect(indexOfKey(items, 'nope')).toBe(-1);
  });

  it('the card count equals the cards of the study; nothing is dropped', () => {
    const s = study('cls_alcohols');
    const cards = [...s.reactionsOf.groups, ...s.preparationOf.groups].reduce((n, g) => n + g.cards.length, 0);
    expect(items.filter((i) => i.kind === 'card')).toHaveLength(cards);
  });

  it('an empty section is a sentence in words, not a blank', () => {
    const empty = familyItems(study('cls_alkanes'));
    expect(empty.filter((i) => i.kind === 'empty').map((i) => (i.kind === 'empty' ? i.text : ''))).toEqual([
      noReactionsTextOf('Alkanes'), // a family no reaction touches also says so as a whole (step 5.5d, item j)
      'No reactions start from Alkanes in this dataset',
      'No reactions make Alkanes in this dataset',
    ]);
    expect(empty.some((i) => i.kind === 'group')).toBe(false);
  });

  it('a family with no reactions says what it means and what to do; one with reactions says none of it', () => {
    const first = familyItems(study('cls_alkanes'))[1];
    expect(first).toMatchObject({ kind: 'empty', key: 'empty:family' });
    expect(noReactionsTextOf('Alkanes')).toMatch(/^Alkanes has no reactions in this dataset: none starts from it and none makes it\./);
    expect(noReactionsTextOf('Alkanes')).toMatch(/import reactions/);
    expect(familyItems(study('cls_alcohols')).some((i) => i.key === 'empty:family')).toBe(false);
  });

  it('titles are plain words', () => {
    expect(titleOf('reactions_of', 'X')).toBe('Reactions of X');
    expect(titleOf('preparation_of', 'X')).toBe('Preparation of X');
    expect(groupTitleOf('reactions_of', 'Y')).toBe('To Y');
    expect(groupTitleOf('preparation_of', 'Y')).toBe('From Y');
    expect(emptyTextOf('preparation_of', 'Z')).toBe('No reactions make Z in this dataset');
  });

  it('every item has a positive height guess, larger for a card with more outcomes', () => {
    for (const item of items) expect(estimateOf(item)).toBeGreaterThan(0);
    const cards = items.filter((i) => i.kind === 'card');
    const outcomes = (i: (typeof cards)[number]): number => (i.kind === 'card' ? i.card.outcomes.length : 0);
    const most = cards.reduce((a, b) => (outcomes(b) > outcomes(a) ? b : a));
    const fewest = cards.reduce((a, b) => (outcomes(b) < outcomes(a) ? b : a));
    expect(estimateOf(most)).toBeGreaterThanOrEqual(estimateOf(fewest));
  });
});
