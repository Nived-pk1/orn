/**
 * Scene and layout-request builders (step 5.3; docs/PERFORMANCE_ARCHITECTURE.md §2 "Scene build": < 8 ms). buildScene and
 * buildLayoutRequest at 400 nodes / 800 edges (the stress-tier navigator overview), the box sizes with a fake measurer, and the
 * design-tier dense overview end to end (projection -> sizes -> request -> fallback layout -> scene) for information. Run once alone.
 */
import { bench, describe } from 'vitest';
import { navigatorProjection } from '@/core/graph';
import { layoutFallback } from '@/layout';
import { buildLayoutRequest, buildScene, nodeSizes } from '@/render/scene';
import { contextOf, requestOf } from '@/test-support/graph-state';
import { FAST_BENCH_OPTIONS, SLOW_BENCH_OPTIONS, tierState, withNavigatorAnchors } from '@/test-support/perf-kit';
import { fakeMeasurer, portsOf } from '@/test-support/scene-kit';

function setup(state: ReturnType<typeof tierState>) {
  const ports = portsOf(state);
  const projection = navigatorProjection.build(contextOf(state), requestOf('navigator'));
  const sizes = nodeSizes(projection, ports, fakeMeasurer);
  const built = buildLayoutRequest(projection, sizes);
  if (!built.ok) throw new Error(`request refused: ${built.code}`);
  const layout = layoutFallback(built.request, 'engine_unavailable', () => 0);
  return { ports, projection, sizes, layout };
}

describe('scene builders (stress tier, 400 anchored hubs: 400 nodes / 800 edges)', () => {
  const { ports, projection, sizes, layout } = setup(withNavigatorAnchors(tierState('stress', 'dense'), 400));
  bench('buildScene', () => void buildScene(projection, layout, { sizes }, ports), FAST_BENCH_OPTIONS);
  bench('buildLayoutRequest', () => void buildLayoutRequest(projection, sizes), FAST_BENCH_OPTIONS);
  bench('nodeSizes', () => void nodeSizes(projection, ports, fakeMeasurer), FAST_BENCH_OPTIONS);
});

describe('scene pipeline (design tier, dense overview)', () => {
  const state = withNavigatorAnchors(tierState('design', 'dense'));
  const ports = portsOf(state);
  const ctx = contextOf(state);
  const request = requestOf('navigator');
  bench(
    'projection -> sizes -> request -> fallback layout -> scene',
    () => {
      const projection = navigatorProjection.build(ctx, request);
      const sizes = nodeSizes(projection, ports, fakeMeasurer);
      const built = buildLayoutRequest(projection, sizes);
      if (!built.ok) throw new Error(built.code);
      const layout = layoutFallback(built.request, 'engine_unavailable', () => 0);
      buildScene(projection, layout, { sizes }, ports);
    },
    SLOW_BENCH_OPTIONS,
  );
});
