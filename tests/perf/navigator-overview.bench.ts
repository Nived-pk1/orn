/**
 * Navigator overview per hub pair (step 5.4c; docs/PERFORMANCE_ARCHITECTURE.md §2 "Projection build": < 16 ms,
 * design tier). The overview build at the design tier (dense and hub_explosion, 60 anchored hubs), with one hub
 * expanded (the one with most arrows) and with every hub expanded (in both directions), the stress-tier overview
 * (400 anchored hubs, informal 32 ms), and `sameProjection` at 400 nodes / 800 edges. Run once alone; the budgets
 * are in tests/perf/budgets.mjs.
 */
import { bench, describe } from 'vitest';
import { navigatorProjection, sameProjection, UNCLASSIFIED_HUB_ID, type ProjectionContext, type ProjectionRequest } from '@/core/graph';
import { contextOf, requestOf } from '@/test-support/graph-state';
import { FAST_BENCH_OPTIONS, tierState, withNavigatorAnchors } from '@/test-support/perf-kit';

const expansionOf = (ctx: ProjectionContext, which: 'one' | 'all'): ProjectionRequest['expansion'] => {
  const rollup = ctx.indexes.navigatorRollup();
  const hubs = rollup.hubs.map((hub) => hub.id);
  const busiest = [...hubs].sort((a, b) => rollup.candidatesFrom(b).length - rollup.candidatesFrom(a).length || (a < b ? -1 : 1))[0] ?? UNCLASSIFIED_HUB_ID;
  const ids = which === 'one' ? [busiest] : [...hubs, UNCLASSIFIED_HUB_ID];
  return { expanded: ids.map((nodeId) => ({ nodeId, direction: 'both' as const })), collapsedEdgeIds: [] };
};

for (const shape of ['dense', 'hub_explosion'] as const) {
  describe(`navigator overview (design tier, ${shape})`, () => {
    const ctx = contextOf(withNavigatorAnchors(tierState('design', shape)));
    const overview = requestOf('navigator');
    const one = requestOf('navigator', { expansion: expansionOf(ctx, 'one') });
    const all = requestOf('navigator', { expansion: expansionOf(ctx, 'all') });
    bench('overview', () => void navigatorProjection.build(ctx, overview), FAST_BENCH_OPTIONS);
    bench('one hub expanded', () => void navigatorProjection.build(ctx, one), FAST_BENCH_OPTIONS);
    bench('every hub expanded', () => void navigatorProjection.build(ctx, all), FAST_BENCH_OPTIONS);
  });
}

const stress = contextOf(withNavigatorAnchors(tierState('stress', 'dense'), 400));
const stressRequest = requestOf('navigator');

describe('navigator overview (stress tier, dense, 400 anchored hubs)', () => {
  bench('overview', () => void navigatorProjection.build(stress, stressRequest), FAST_BENCH_OPTIONS);
});

describe('sameProjection (stress-tier overview, 400 anchored hubs)', () => {
  // Two separate builds: equal in content, never the same object.
  const first = navigatorProjection.build(stress, stressRequest);
  const second = navigatorProjection.build(stress, stressRequest);
  const last = first.edges[first.edges.length - 1];
  const changed = { ...first, edges: [...first.edges.slice(0, -1), ...(last === undefined ? [] : [{ ...last, inferred: !last.inferred }])] };
  bench('equal projections', () => void sameProjection(first, second), FAST_BENCH_OPTIONS);
  bench('differ in the last edge', () => void sameProjection(first, changed), FAST_BENCH_OPTIONS);
});
