/**
 * What one family-to-family arrow carries (step 8.2b, D): its distinct reactions and, when it is ONE reaction card, the reagent words the
 * reaction card writes over its arrow. An example folds under its general reaction as on the family page (`foldExamples`), so a general
 * reaction with its examples is one card. Read from the roll-up's pair table; a pair's words are computed when first asked for (only drawn
 * arrows are asked) and kept until the data changes. Derived, never stored.
 */
import { createReagentWords, exampleLookupOf, foldExamples } from '@/core/graph';
import type { NavigatorCandidate, ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState } from '@/core/schema';
import type { PairFacts } from './map-chips';

export interface PairFactsPorts {
  readonly store: { getState(): CanonicalState };
  readonly indexes: { current(): ReadonlyIndexes };
}

const KEY_SEPARATOR = '\u0000';

export function createPairFacts(ports: PairFactsPorts): (from: string, to: string) => PairFacts | undefined {
  let seen: { readonly state: CanonicalState; readonly indexes: ReadonlyIndexes } | undefined;
  let pairs = new Map<string, readonly NavigatorCandidate[]>();
  let words: ReturnType<typeof createReagentWords> | undefined;
  let lookup: ReturnType<typeof exampleLookupOf> | undefined;
  const cache = new Map<string, PairFacts | undefined>();
  const refresh = (): void => {
    const state = ports.store.getState();
    const indexes = ports.indexes.current();
    if (seen !== undefined && seen.state === state && seen.indexes === indexes) return;
    seen = { state, indexes };
    cache.clear();
    words = createReagentWords(state, indexes);
    lookup = exampleLookupOf(state);
    pairs = new Map();
    for (const pair of indexes.navigatorRollup().pairs()) pairs.set(`${pair.from}${KEY_SEPARATOR}${pair.to}`, pair.candidates);
  };
  return (from, to) => {
    refresh();
    const key = `${from}${KEY_SEPARATOR}${to}`;
    if (cache.has(key)) return cache.get(key);
    const candidates = pairs.get(key);
    let facts: PairFacts | undefined;
    if (candidates !== undefined && candidates.length > 0 && words !== undefined && lookup !== undefined) {
      const ids = [...new Set(candidates.map((c) => c.reactionId))];
      const cards = foldExamples(ids, lookup).shown;
      const card = cards.length === 1 ? candidates.find((c) => c.reactionId === cards[0]) : undefined;
      const text = card === undefined ? '' : words(card.reactionId, card);
      facts = { reactions: ids.length, ...(text === '' ? {} : { words: text }) };
    }
    cache.set(key, facts);
    return facts;
  };
}
