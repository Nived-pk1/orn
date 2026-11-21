/** The chain cards of "From A to B" (step 8.3b, B2.1): not chosen = title and one summary line; chosen = also its step rows; one chosen at a time. */
import { describe, expect, it } from 'vitest';
import { chainCardsOf, chainCountWords } from './chain-card';

const name = (id: string): string => ({ a: 'Alkenes', b: 'Alcohols', c: 'Aldehydes' })[id] ?? id;
const chains = [
  { families: ['a', 'c'], steps: [{ from: 'a', to: 'c' }] },
  { families: ['a', 'b', 'c'], steps: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] },
];
const reactions = (from: string, to: string): number => (from === 'a' && to === 'b' ? 1 : from === 'b' && to === 'c' ? 3 : 1);

describe('chainCardsOf', () => {
  it('a card that is not chosen has the chain title and one summary line, and no step rows', () => {
    const cards = chainCardsOf(chains, 1, { nameOf: name, reactionsOf: reactions });
    expect(cards[0]).toEqual({ key: 'a>c', title: 'Alkenes → Aldehydes', summary: '1 step · 1 reaction', chosen: false, steps: undefined });
  });
  it('the chosen card shows its steps, each with its ends and its reaction count', () => {
    const cards = chainCardsOf(chains, 1, { nameOf: name, reactionsOf: reactions });
    expect(cards[1]?.chosen).toBe(true);
    expect(cards[1]?.title).toBe('Alkenes → Alcohols → Aldehydes');
    expect(cards[1]?.summary).toBe('2 steps · 4 reactions');
    expect(cards[1]?.steps).toEqual([
      { from: 'a', to: 'b', title: 'Alkenes → Alcohols', reactions: 1 },
      { from: 'b', to: 'c', title: 'Alcohols → Aldehydes', reactions: 3 },
    ]);
  });
  it('exactly one card is chosen; the first by default; an index out of range falls back to the first', () => {
    expect(chainCardsOf(chains, 0, { nameOf: name, reactionsOf: reactions }).map((c) => c.chosen)).toEqual([true, false]);
    expect(chainCardsOf(chains, 9, { nameOf: name, reactionsOf: reactions }).map((c) => c.chosen)).toEqual([true, false]);
    expect(chainCardsOf(chains, -1, { nameOf: name, reactionsOf: reactions }).map((c) => c.chosen)).toEqual([true, false]);
  });
  it('no chains: no cards', () => {
    expect(chainCardsOf([], 0, { nameOf: name, reactionsOf: reactions })).toEqual([]);
  });
});

describe('chainCountWords (step T, K1)', () => {
  it('says the total, and which ones are shown when some are left out', () => {
    expect(chainCountWords(6, 6)).toBe('6 chains');
    expect(chainCountWords(1, 1)).toBe('1 chain');
    expect(chainCountWords(5, 6)).toBe('6 chains, the 5 shortest shown');
  });
});
