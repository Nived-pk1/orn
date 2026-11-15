/**
 * Step 8.4s (S8, from the audit finding RU-01): the one-line arrow of a reaction ("A -> B" on the Connected cards) names the HEADLINE
 * outcome (exclusive, then major, ...), not `outcomes[0]` as stored. Selectivity lives on outcomes and nothing orders the array, so a
 * record that lists its minor outcome first must read the same as one that lists its major first.
 * NOTE: this was written after the fix (the audit's reproduction test ran red against the old code in the audit tree, not here).
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalState, Reaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { arrowLine } from './study-connected';

describe('arrowLine: the headline outcome', () => {
  it('names the major product whatever the stored order of the outcomes', () => {
    const state: CanonicalState = demoState();
    const reactions = Object.values(state.records.reaction) as Reaction[];
    const found = reactions.find((r) => r.outcomes.some((o) => o.selectivity === 'major') && r.outcomes.some((o) => o.selectivity === 'minor'));
    if (found === undefined) throw new Error('the demo dataset has no reaction with a major and a minor outcome');
    const major = found.outcomes.filter((o) => o.selectivity === 'major');
    const rest = found.outcomes.filter((o) => o.selectivity !== 'major');
    const majorFirst: Reaction = { ...found, outcomes: [...major, ...rest] };
    const minorFirst: Reaction = { ...found, outcomes: [...rest, ...major] };
    expect(arrowLine(state, minorFirst)).toBe(arrowLine(state, majorFirst));
  });
});
