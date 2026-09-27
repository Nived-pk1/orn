/**
 * Projection build (docs/PERFORMANCE_ARCHITECTURE.md §2): < 16 ms, bounded to ≤ 400 nodes / 800 edges,
 * design tier. ADV-012 performance part (hub with 1,000+ reactions: `hub_explosion`) and ADV-013 (dense
 * 5k-reaction graph: `dense`). Every bench uses FAST_BENCH_OPTIONS (docs/PROGRESS.md step 2.11) for a
 * stable p99 instead of vitest bench's default ~10-30 samples.
 */
import { bench, describe } from 'vitest';
import { navigatorProjection, precursorExplorerProjection, reactionExplorerProjection } from '@/core/graph';
import { contextOf, requestOf } from '@/test-support/graph-state';
import {
  buildIndexes,
  FAST_BENCH_OPTIONS,
  mostReferencedSpecies,
  oneHubState,
  tierState,
  withNavigatorAnchors,
} from '@/test-support/perf-kit';

for (const shape of ['dense', 'hub_explosion'] as const) {
  describe(`projection build (design tier, ${shape})`, () => {
    // Anchored, 60 hubs, deterministically chosen (docs/PROGRESS.md steps 2.9/2.11): the generator itself
    // creates no navigator_anchor records, and an un-anchored state puts every reaction on the single
    // Unclassified hub — not representative of a curated dataset (the demo has 15 anchored hubs), and not
    // what the navigator's index is designed for.
    const state = withNavigatorAnchors(tierState('design', shape));
    const indexes = buildIndexes(state);
    const hub = mostReferencedSpecies(state, indexes);
    const ctx = contextOf(state);
    const focusedRequest = requestOf('navigator', { focus: [hub] });

    bench(
      'navigator, focused on the hub',
      () => {
        navigatorProjection.build(ctx, { ...focusedRequest, view: 'navigator' });
      },
      FAST_BENCH_OPTIONS,
    );

    bench(
      'reaction_explorer, focused on the hub',
      () => {
        reactionExplorerProjection.build(ctx, { ...focusedRequest, view: 'reaction_explorer' });
      },
      FAST_BENCH_OPTIONS,
    );

    bench(
      'precursor_explorer, focused on the hub',
      () => {
        precursorExplorerProjection.build(ctx, { ...focusedRequest, view: 'precursor_explorer' });
      },
      FAST_BENCH_OPTIONS,
    );
  });
}

describe('projection build — ADV-012 literal case: one hub, 1,000 reactions', () => {
  const state = oneHubState();
  const indexes = buildIndexes(state);
  const hub = mostReferencedSpecies(state, indexes);
  const ctx = contextOf(state);
  const focusedRequest = requestOf('navigator', { focus: [hub] });

  bench(
    'navigator, focused on the hub',
    () => {
      navigatorProjection.build(ctx, { ...focusedRequest, view: 'navigator' });
    },
    FAST_BENCH_OPTIONS,
  );

  bench(
    'precursor_explorer, focused on the hub',
    () => {
      precursorExplorerProjection.build(ctx, { ...focusedRequest, view: 'precursor_explorer' });
    },
    FAST_BENCH_OPTIONS,
  );
});

/**
 * Stress-tier allowance (docs/PERFORMANCE_ARCHITECTURE.md §1: "budgets may degrade ≤ 2×", so 32 ms here —
 * an informal budget, no §2 row of its own; see tests/perf/budgets.mjs). 400 anchored hubs: the stress-tier
 * analogue of the design tier's 60 (docs/PROGRESS.md step 2.11), chosen the same deterministic way.
 */
describe('projection build — stress tier, dense, 400 anchored hubs', () => {
  const state = withNavigatorAnchors(tierState('stress', 'dense'), 400);
  const indexes = buildIndexes(state);
  const hub = mostReferencedSpecies(state, indexes);
  const ctx = contextOf(state);
  const focusedRequest = requestOf('navigator', { focus: [hub] });

  bench(
    'navigator, focused on the hub',
    () => {
      navigatorProjection.build(ctx, { ...focusedRequest, view: 'navigator' });
    },
    FAST_BENCH_OPTIONS,
  );
});
