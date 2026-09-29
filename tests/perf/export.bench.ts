/**
 * Export full dataset (docs/PERFORMANCE_ARCHITECTURE.md §2: "Export full dataset" < 2 s, both formats),
 * design tier. The generator produces no `asset` records (docs/PERFORMANCE_ARCHITECTURE.md §10 is graph/index
 * scale only), so `assets: 'none'` and the bytes provider is never called; asset-heavy export cost is
 * exercised functionally, not at scale, by `src/io/export-{json,package}.test.ts`.
 */
import { bench, describe } from 'vitest';
import { buildOrnJsonExport, buildOrnPackageExport, type OrnJsonExportDeps } from '@/io';
import { SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';

const deps: OrnJsonExportDeps = { exportedAt: '2026-09-29T00:00:00.000Z', generator: { app: 'orn-bench', version: '1' }, assetBytes: async () => undefined };
const options = { scope: 'full', includeDependencies: false, assets: 'none' } as const;

for (const shape of ['dense', 'hub_explosion'] as const) {
  describe(`export full dataset (design tier, ${shape})`, () => {
    const state = tierState('design', shape);

    bench(
      '.orn.json',
      async () => {
        const result = await buildOrnJsonExport(state, options, deps);
        if (!result.ok) throw new Error(`bench: export failed: ${result.code} ${result.message}`);
      },
      SLOW_BENCH_OPTIONS,
    );

    bench(
      '.ornpkg',
      async () => {
        const result = await buildOrnPackageExport(state, options, deps);
        if (!result.ok) throw new Error(`bench: export failed: ${result.code} ${result.message}`);
      },
      SLOW_BENCH_OPTIONS,
    );
  });
}
