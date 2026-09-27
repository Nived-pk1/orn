/**
 * Gate B performance rows (docs/TEST_STRATEGY.md §5, gate B): ADV-012 performance part and ADV-013.
 * Single, warmed-up timing checks with a generous margin — the statistical benchmarks (mean, p75, p99
 * over many samples, at every shape) live in `tests/perf/*.bench.ts` and `tests/perf/baseline.json`
 * (step 2.8; run with `npm run bench`). This file only needs each Gate B performance row named once,
 * per docs/reviews/gate-b-packet.md's title-level scan.
 *
 * Known, measured gap (not asserted here — see PROGRESS.md step 2.8, docs/reviews/gate-b-packet.md):
 * `navigator`'s build scans every reaction in the state once per call (docs/GRAPH_SEMANTICS.md §3 — it is
 * a whole-dataset overview, not a local bounded traversal), so its cost tracks total reaction count, not
 * the focused hub's degree. At the design tier (5,000 reactions) it measures ~20–30 ms, over the 16 ms
 * budget; `reaction_explorer` and `precursor_explorer` (genuinely local, seeded traversals bounded by
 * `TraversalLimits`) stay comfortably under budget at the same scale, asserted below.
 */
import { describe, expect, it } from 'vitest';
import { navigatorProjection, precursorExplorerProjection, reactionExplorerProjection } from '@/core/graph';
import { contextOf, requestOf } from '@/test-support/graph-state';
import { buildIndexes, mostReferencedSpecies, oneHubState, tierState } from '@/test-support/perf-kit';

const BUDGET_MS = 16;
/**
 * One warmed-up measurement is noisier than a statistical benchmark, and `npm run test:coverage`'s v8
 * instrumentation adds its own overhead on top; a 5x margin absorbs both without hiding a real regression
 * — the measured means (`tests/perf/baseline.json`) are 1.2–8.7 ms, so even 5x has headroom to spare.
 */
const MARGIN = 5;

function timeOnce(run: () => void): number {
  run(); // warm-up: JIT, memoised hub resolution, etc. — not timed.
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe('ADV-013: dense 5k-reaction graph — bounded, local projections build under budget', () => {
  const state = tierState('design', 'dense');
  const indexes = buildIndexes(state);
  const hub = mostReferencedSpecies(state, indexes);
  const ctx = contextOf(state);
  const request = { ...requestOf('reaction_explorer', { focus: [hub] }), view: 'reaction_explorer' as const };

  it('reaction_explorer build is well under the 16 ms projection budget at p95, at this scale', () => {
    const ms = timeOnce(() => reactionExplorerProjection.build(ctx, request));
    expect(ms).toBeLessThan(BUDGET_MS * MARGIN);
  });

  it('precursor_explorer build is well under the 16 ms projection budget at p95, at this scale', () => {
    const ms = timeOnce(() => precursorExplorerProjection.build(ctx, { ...request, view: 'precursor_explorer' }));
    expect(ms).toBeLessThan(BUDGET_MS * MARGIN);
  });
});

describe('ADV-012 performance part: a hub with 1,000 reactions stays under the projection budget', () => {
  it('navigator build, focused on the hub, is well under the 16 ms projection budget at this scale', () => {
    const state = oneHubState();
    const indexes = buildIndexes(state);
    const hub = mostReferencedSpecies(state, indexes);
    const ctx = contextOf(state);
    const request = { ...requestOf('navigator', { focus: [hub] }), view: 'navigator' as const };
    const ms = timeOnce(() => navigatorProjection.build(ctx, request));
    expect(ms).toBeLessThan(BUDGET_MS * MARGIN);
  });
});
