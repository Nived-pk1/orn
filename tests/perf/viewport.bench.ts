/**
 * Viewport culling (step 5.4b; PERFORMANCE_ARCHITECTURE section 2 "Pan / zoom", section 6): one culling query (screen plus overscan)
 * on a built grid index at the render budget (400 nodes / 800 edges) and at the stress size (2,000 / 4,000), and the index build.
 * A query runs in a frame of pan, so it must stay far below 16 ms. Run once alone.
 */
import { bench, describe } from 'vitest';
import { buildGridIndex, visibleIn } from '@/render/viewport';
import { syntheticScene } from '@/test-support/viewport-kit';
import { FAST_BENCH_OPTIONS } from '@/test-support/perf-kit';

const SCREEN = { width: 1600, height: 900 };

for (const [nodes, edges] of [[400, 800], [2000, 4000]] as const) {
  describe(`viewport culling (${nodes} nodes / ${edges} edges)`, () => {
    const scene = syntheticScene(nodes, edges, 7, Math.round(Math.sqrt(nodes) * 400));
    const index = buildGridIndex(scene);
    bench('visibleIn (screen plus overscan)', () => void visibleIn(index, { x: -1200, y: -800, scale: 0.8 }, SCREEN), FAST_BENCH_OPTIONS);
    bench('buildGridIndex', () => void buildGridIndex(scene), FAST_BENCH_OPTIONS);
  });
}
