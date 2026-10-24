/**
 * Every overview arrow of the demo opens a Reactions list of the SAME size as the reactions the arrow carries (step 7.1b E3): the filter
 * "From = its from family, To = its to family" gives exactly the distinct reactions of the pair's candidates (what the arrow's inspector
 * lists and counts), for all arrows, the self-loops included. An arrow's own chip counts candidates (an outcome with a main product), so it
 * can be larger when one reaction lands in the pair through several outcomes; that is said here, not hidden.
 */
import { describe, expect, it } from 'vitest';
import { buildReactionFilterInput, filterReactions } from '@/core/graph';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';

describe('Open these n reactions in Reactions', () => {
  const ctx = contextOf(demoState());
  const input = buildReactionFilterInput(ctx);
  const pairs = ctx.indexes.navigatorRollup().pairs();

  it('the demo has arrows, self-loops among them', () => {
    expect(pairs.length).toBeGreaterThan(20);
    expect(pairs.some((pair) => pair.from === pair.to)).toBe(true);
  });

  it('for EVERY arrow the Reactions count equals the distinct reactions of the arrow', () => {
    for (const pair of pairs) {
      const distinct = new Set(pair.candidates.map((candidate) => candidate.reactionId));
      const rows = filterReactions(input, { fromFamilyIds: [pair.from], toFamilyIds: [pair.to] }, undefined).rows;
      expect(rows.map((row) => row.id).sort(), `${pair.from} to ${pair.to}`).toEqual([...distinct].sort());
    }
  });

  it('an arrow\'s chip (its candidates) is never smaller than its reactions', () => {
    for (const pair of pairs) expect(pair.candidates.length).toBeGreaterThanOrEqual(new Set(pair.candidates.map((c) => c.reactionId)).size);
  });
});
