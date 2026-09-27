/**
 * Projection build (docs/PERFORMANCE_ARCHITECTURE.md §2): < 16 ms, bounded to ≤ 400 nodes / 800 edges,
 * design tier. ADV-012 performance part (hub with 1,000+ reactions: `hub_explosion`) and ADV-013 (dense
 * 5k-reaction graph: `dense`).
 */
import { bench, describe } from 'vitest';
import { navigatorProjection, precursorExplorerProjection, reactionExplorerProjection } from '@/core/graph';
import { contextOf, requestOf } from '@/test-support/graph-state';
import { buildIndexes, mostReferencedSpecies, oneHubState, tierState } from '@/test-support/perf-kit';

for (const shape of ['dense', 'hub_explosion'] as const) {
  describe(`projection build (design tier, ${shape})`, () => {
    const state = tierState('design', shape);
    const indexes = buildIndexes(state);
    const hub = mostReferencedSpecies(state, indexes);
    const ctx = contextOf(state);
    const focusedRequest = requestOf('navigator', { focus: [hub] });

    bench('navigator, focused on the hub', () => {
      navigatorProjection.build(ctx, { ...focusedRequest, view: 'navigator' });
    });

    bench('reaction_explorer, focused on the hub', () => {
      reactionExplorerProjection.build(ctx, { ...focusedRequest, view: 'reaction_explorer' });
    });

    bench('precursor_explorer, focused on the hub', () => {
      precursorExplorerProjection.build(ctx, { ...focusedRequest, view: 'precursor_explorer' });
    });
  });
}

describe('projection build — ADV-012 literal case: one hub, 1,000 reactions', () => {
  const state = oneHubState();
  const indexes = buildIndexes(state);
  const hub = mostReferencedSpecies(state, indexes);
  const ctx = contextOf(state);
  const focusedRequest = requestOf('navigator', { focus: [hub] });

  bench('navigator, focused on the hub', () => {
    navigatorProjection.build(ctx, { ...focusedRequest, view: 'navigator' });
  });

  bench('precursor_explorer, focused on the hub', () => {
    precursorExplorerProjection.build(ctx, { ...focusedRequest, view: 'precursor_explorer' });
  });
});
