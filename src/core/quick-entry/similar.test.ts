/**
 * A similar existing reaction (step 6.7b, Q4): a reaction with the same participants and the same products (compared as sets of records),
 * found over the canonical state. Derived each time; nothing is stored.
 */
import { describe, expect, it } from 'vitest';
import type { Reaction } from '../schema';
import { demoState } from '@/test-support/app-boot-kit';
import { similarReactions } from './similar';

const state = demoState();
const reactions = Object.values(state.records.reaction) as Reaction[];
const sample = reactions.find((r) => r.scope === 'specific' && r.participants.length >= 2 && r.outcomes[0] !== undefined && r.outcomes[0].products.length > 0) as Reaction;
const left = sample.participants.map((p) => ({ kind: p.ref.kind as 'species' | 'class' | 'reagent', id: p.ref.id }));
const products = sample.outcomes.flatMap((o) => o.products.map((p) => ({ kind: p.ref.kind as 'species' | 'class', id: p.ref.id })));

describe('similarReactions', () => {
  it('finds the reaction with the same participants and products, in any order', () => {
    const found = similarReactions(state, [...left].reverse(), [...products].reverse());
    expect(found.map((r) => r.id)).toContain(sample.id);
  });
  it('a different participant, a missing participant or a different product finds none of it', () => {
    expect(similarReactions(state, [...left.slice(1)], products).map((r) => r.id)).not.toContain(sample.id);
    expect(similarReactions(state, left, [{ kind: 'species' as const, id: 'spc_no-such-product' }]).map((r) => r.id)).not.toContain(sample.id);
    expect(similarReactions(state, left, products.slice(1)).map((r) => r.id)).not.toContain(sample.id);
  });
  it('repeated terms count once, nothing at all matches nothing, and the answer is bounded and in id order', () => {
    expect(similarReactions(state, [...left, ...left], [...products, ...products]).map((r) => r.id)).toContain(sample.id);
    expect(similarReactions(state, [], [])).toEqual([]);
    const found = similarReactions(state, left, products);
    expect(found.length).toBeLessThanOrEqual(3);
    expect([...found].sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual(found);
  });
});
