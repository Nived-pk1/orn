/**
 * The Reactions view's words and bookkeeping (step 7.1b D1, D2, D5), pure: the count line, the chips, the option labels, and dropping a saved
 * filter's ids that name nothing any more.
 */
import { describe, expect, it } from 'vitest';
import { reactionCard, UNCLASSIFIED_HUB_ID } from '@/core/graph';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import { EMPTY_EXPLORER_FILTER } from '@/ui/state';
import { chipsOf, compactEquationOf, countLine, labelsOf, pruneFilter, toReactionFilter, USE_WORDS } from './model';

const ctx = contextOf(demoState());
const labels = labelsOf(ctx.state, ctx.indexes);
const some = (records: object): string => Object.keys(records)[0] as string;

describe('countLine', () => {
  it('unfiltered: "24 reactions" (singular for one)', () => {
    expect(countLine({ shown: 24, total: 24, filtered: false, hidden: 0, hiddenBy: undefined })).toBe('24 reactions');
    expect(countLine({ shown: 1, total: 1, filtered: false, hidden: 0, hiddenBy: undefined })).toBe('1 reaction');
  });
  it('filtered: "24 of 212 reactions"', () => {
    expect(countLine({ shown: 24, total: 212, filtered: true, hidden: 0, hiddenBy: undefined })).toBe('24 of 212 reactions');
    expect(countLine({ shown: 0, total: 212, filtered: true, hidden: 0, hiddenBy: undefined })).toBe('0 of 212 reactions');
  });
  it('with Only on: the hidden ones are counted in words', () => {
    expect(countLine({ shown: 24, total: 212, filtered: true, hidden: 5, hiddenBy: 'JEE Main' })).toBe('24 of 212 reactions (5 outside JEE Main hidden)');
    expect(countLine({ shown: 24, total: 212, filtered: true, hidden: 0, hiddenBy: 'JEE Main' })).toBe('24 of 212 reactions');
  });
});

describe('labels', () => {
  it('name a family by its record and Unclassified by its word; a type, a named reaction, a substance by their records', () => {
    expect(labels.family(UNCLASSIFIED_HUB_ID)).toBe('Unclassified');
    expect(labels.family('cls_alcohols')).toBe('Alcohols');
    const type = some(ctx.state.records.concept);
    expect(labels.type(type)).toBe((ctx.state.records.concept as Record<string, { name: string }>)[type]?.name);
    expect(labels.status('review_required')).toBe('Needs review');
    expect(labels.substance(some(ctx.state.records.species))).not.toBe(some(ctx.state.records.species));
  });
  it('an id that names nothing is shown as itself', () => {
    expect(labels.type('cpt_nowhere')).toBe('cpt_nowhere');
  });
});

describe('chips', () => {
  it('one removable chip per chosen value, named in words', () => {
    const type = some(ctx.state.records.concept);
    const filter = { ...EMPTY_EXPLORER_FILTER, typeIds: [type, 'cpt_other'], reviewStatuses: ['verified'], text: 'oxid', fromFamilyIds: ['cls_alcohols'] };
    const chips = chipsOf(filter, labels);
    expect(chips.map((c) => c.label)).toEqual(['From family: Alcohols', `Type: ${labels.type(type)}`, 'Type: cpt_other', 'Review status: Verified', 'Name: oxid']);
    expect(chips[0]?.removeName).toBe('Remove From family: Alcohols');
    expect(chips[1]?.without(filter).typeIds).toEqual(['cpt_other']);
    expect(chips[4]?.without(filter).text).toBe('');
  });
  it('"Used as" is a chip only when a substance is chosen and it is not Any', () => {
    const sub = some(ctx.state.records.species);
    expect(chipsOf({ ...EMPTY_EXPLORER_FILTER, usedAs: 'product' }, labels)).toEqual([]);
    const filter = { ...EMPTY_EXPLORER_FILTER, substanceIds: [sub], usedAs: 'product' as const };
    const chips = chipsOf(filter, labels);
    expect(chips.map((c) => c.label)).toEqual([`Substance: ${labels.substance(sub)}`, 'Used as: Product']);
    expect(chips[1]?.without(filter).usedAs).toBe('any');
    expect(USE_WORDS.reactant).toBe('Starting material');
  });
});

describe('pruneFilter', () => {
  it('drops ids that name nothing and says whether it did', () => {
    const type = some(ctx.state.records.concept);
    const sub = some(ctx.state.records.species);
    const kept = pruneFilter({ ...EMPTY_EXPLORER_FILTER, typeIds: [type], substanceIds: [sub], fromFamilyIds: ['cls_alcohols', UNCLASSIFIED_HUB_ID] }, ctx.state, ctx.indexes);
    expect(kept.dropped).toBe(false);
    const gone = pruneFilter({ ...EMPTY_EXPLORER_FILTER, typeIds: [type, 'cpt_gone'], substanceIds: ['spc_gone'], toFamilyIds: ['cls_gone'], namedReactionIds: ['nrx_gone'] }, ctx.state, ctx.indexes);
    expect(gone.dropped).toBe(true);
    expect(gone.filter).toMatchObject({ typeIds: [type], substanceIds: [], toFamilyIds: [], namedReactionIds: [] });
  });
});

describe('toReactionFilter', () => {
  it('maps the saved filter to the core filter', () => {
    expect(toReactionFilter({ ...EMPTY_EXPLORER_FILTER, typeIds: ['t'], usedAs: 'arrow', substanceIds: ['s'], onlyInScope: true, text: 'x' })).toMatchObject({ typeIds: ['t'], usedAs: 'arrow', substanceIds: ['s'], onlyInScope: true, text: 'x' });
  });
});

describe('compactEquationOf (step 7.2a, A3)', () => {
  const cards = Object.keys(ctx.state.records.reaction).flatMap((id) => {
    const card = reactionCard({ state: ctx.state, indexes: ctx.indexes, scopeOf: () => 'unmapped' }, id);
    return 'missing' in card ? [] : [card];
  });

  it('a reaction with several outcome groups names each group before its equation, so no two parts read the same', () => {
    const several = cards.filter((card) => card.groups.length > 1);
    expect(several.length).toBeGreaterThan(0);
    for (const card of several) {
      const parts = compactEquationOf(card.groups).split('; ');
      expect(parts).toHaveLength(card.groups.filter((g) => (g.equation?.text ?? '') !== '').length);
      card.groups.forEach((group, i) => expect(parts[i]).toBe(`${group.heading}: ${group.equation?.text ?? ''}`));
    }
  });

  it('a reaction with one group shows its equation alone (no heading to repeat)', () => {
    const one = cards.find((card) => card.groups.length === 1 && (card.groups[0]?.equation?.text ?? '') !== '');
    expect(one).toBeDefined();
    expect(compactEquationOf(one?.groups ?? [])).toBe(one?.groups[0]?.equation?.text);
  });

  it('a group without an equation is left out, and a group without a heading shows its equation alone', () => {
    const group = (heading: string, text: string | undefined) => ({ heading, equation: text === undefined ? undefined : { text } }) as never;
    expect(compactEquationOf([group('At 278 K', 'A → B'), group('At 293 K', undefined), group('', 'C → D')])).toBe('At 278 K: A → B; C → D');
  });
});
