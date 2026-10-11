/**
 * Related reactions (step 5.6b, item c; INV-11, INV-18 determinism): over generated states, for every reaction the six derived groups
 * come in the fixed order, are deterministic, bounded, list no reaction twice in a group, never list the reaction itself, and the
 * "leads on to" group's STATED entries equal an oracle read straight from the state (a reaction that takes a product of this one,
 * by-products left out, as a reactant by the same species or class).
 */
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { MAX_GROUP_ITEMS, RELATED_GROUP_KEYS, relatedReactionsOf } from '@/core/graph';
import type { Reaction } from '@/core/schema';
import { frozenStateOf, smallParamsArb } from '@/test-support/arbitraries';
import { contextOf } from '@/test-support/graph-state';
import { PARAMS, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

describe('relatedReactionsOf', () => {
  it('is ordered, deterministic, bounded and duplicate-free, and its stated leads-on entries match the oracle', () => {
    let reactions = 0;
    let statedLinks = 0;
    fc.assert(
      fc.property(smallParamsArb, (params) => {
        const state = frozenStateOf(params);
        const { indexes } = contextOf(state);
        const all = Object.values(state.records.reaction) as Reaction[];
        for (const reaction of all) {
          reactions += 1;
          const groups = relatedReactionsOf(indexes, reaction);
          expect(groups.map((g) => g.key)).toEqual([...RELATED_GROUP_KEYS]);
          expect(relatedReactionsOf(indexes, reaction)).toEqual(groups);
          for (const group of groups) {
            const ids = group.items.map((i) => i.reactionId);
            expect(new Set(ids).size).toBe(ids.length);
            expect(ids).not.toContain(reaction.id);
            expect(group.items.length).toBeLessThanOrEqual(MAX_GROUP_ITEMS);
            expect(group.total).toBeGreaterThanOrEqual(group.items.length);
          }
          const made = new Set(reaction.outcomes.flatMap((o) => o.products.filter((p) => p.role !== 'byproduct').map((p) => `${p.ref.kind}:${p.ref.id}`)));
          const oracle = all
            .filter((other) => other.id !== reaction.id && other.participants.some((p) => p.role === 'reactant' && made.has(`${p.ref.kind}:${p.ref.id}`)))
            .map((other) => other.id)
            .sort();
          const stated = (groups[0]?.items ?? []).filter((i) => !i.inferred).map((i) => i.reactionId).sort();
          expect(stated).toEqual(oracle);
          statedLinks += stated.length;
        }
      }),
      PARAMS,
    );
    expect(reactions).toBeGreaterThan(0);
    expect(statedLinks).toBeGreaterThan(0);
  });
});
