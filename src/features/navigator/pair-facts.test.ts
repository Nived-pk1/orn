/** What one family-to-family arrow carries (step 8.2b, D): the distinct reactions, and the reagent words when it is one reaction. Over the demo dataset. */
import { describe, expect, it } from 'vitest';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { createCanonicalStore } from '@/core/commands';
import { demoState } from '@/test-support/app-boot-kit';
import { createPairFacts } from './pair-facts';

function rig(drop: readonly string[] = []) {
  const state = demoState();
  const reaction = Object.fromEntries(Object.entries(state.records.reaction).filter(([id]) => !drop.includes(id)));
  const store = createCanonicalStore({ initial: { ...state, records: { ...state.records, reaction } } as typeof state, revision: 0, validateInitial: false });
  const indexes = createDerivedIndexes({ store, clock: { nowMs: () => 0 } });
  return { store, indexes, facts: createPairFacts({ store, indexes: { current: () => indexes.current() } }) };
}

describe('createPairFacts', () => {
  it('counts the distinct reactions of a pair and gives words only when it is one reaction', () => {
    const r = rig();
    const pairs = r.indexes.current().navigatorRollup().pairs();
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs.slice(0, 200)) {
      const facts = r.facts(pair.from, pair.to);
      const distinct = new Set(pair.candidates.map((c) => c.reactionId)).size;
      expect(facts?.reactions).toBe(distinct);
    }
  });
  it('gives the reagent words of an arrow that is one reaction, as the reaction card writes them', () => {
    const r = rig();
    const words = r.indexes
      .current()
      .navigatorRollup()
      .pairs()
      .map((pair) => r.facts(pair.from, pair.to)?.words)
      .filter((one): one is string => one !== undefined && one !== '');
    expect(words).toContain('alc. KOH');
  });
  it('a general reaction with its example is ONE card: the pair shows the words of the general reaction (PCC); a second general reaction makes two cards and no words', () => {
    const both = rig();
    const alcohols = 'cls_alcohols';
    const aldehydes = 'cls_aldehydes';
    expect(both.facts(alcohols, aldehydes)).toEqual({ reactions: 3 });
    const folded = rig(['rxn_ethanol-to-ethanal-dichromate']);
    expect(folded.facts(alcohols, aldehydes)).toMatchObject({ reactions: 2, words: 'PCC' });
  });
  it('carries the parts of the words (a name or a formula), which join to the same words (step 8.3, A3)', () => {
    const r = rig();
    const found = r.indexes
      .current()
      .navigatorRollup()
      .pairs()
      .map((pair) => r.facts(pair.from, pair.to))
      .filter((facts) => facts?.words !== undefined);
    expect(found.length).toBeGreaterThan(0);
    for (const facts of found) expect(facts?.parts?.map((part) => part.text).join(', ')).toBe(facts?.words);
    expect(found.some((facts) => facts?.parts?.some((part) => part.kind === 'formula'))).toBe(true);
  });
  it('is undefined for two families with no arrow between them', () => {
    expect(rig().facts('cls_nothing', 'cls_nowhere')).toBeUndefined();
  });
});
