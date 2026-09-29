/**
 * Import parse -> envelope -> L1 (docs/PERFORMANCE_ARCHITECTURE.md §2: "Import 5k reactions (parse ->
 * preview)" < 5 s), design tier, both formats. This step's own scope stops at L1/quarantine (conflict
 * analysis and the preview are step 3.7's), so this is reported against the 5 s row informally, not a
 * pass/fail verdict against it — 3.7 adds its own cost on top before the full row applies.
 */
import { bench, describe } from 'vitest';
import { migrationRunner } from '@/core/migrations';
import { buildOrnJsonExport, buildOrnPackageExport, type OrnJsonExportDeps } from '@/io';
import { parseImportSource } from '@/io/import-source';
import { SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';

const exportDeps: OrnJsonExportDeps = { exportedAt: '2026-09-29T00:00:00.000Z', generator: { app: 'orn-bench', version: '1' }, assetBytes: async () => undefined };
const exportOptions = { scope: 'full', includeDependencies: false, assets: 'none' } as const;
const importDeps = { runner: migrationRunner };

for (const shape of ['dense', 'hub_explosion'] as const) {
  describe(`import parse -> envelope -> L1 (design tier, ${shape})`, async () => {
    const state = tierState('design', shape);

    const jsonBytes = await buildOrnJsonExport(state, exportOptions, exportDeps);
    if (!jsonBytes.ok) throw new Error(`bench setup: export failed: ${jsonBytes.code} ${jsonBytes.message}`);
    const jsonBlob = new Blob([jsonBytes.result.bytes as BlobPart]);

    const packageBytes = await buildOrnPackageExport(state, exportOptions, exportDeps);
    if (!packageBytes.ok) throw new Error(`bench setup: export failed: ${packageBytes.code} ${packageBytes.message}`);
    const packageBlob = new Blob([packageBytes.result.bytes as BlobPart]);

    bench(
      '.orn.json',
      async () => {
        const result = await parseImportSource({ fileName: 'bench.orn.json', bytes: jsonBlob }, importDeps);
        if (!result.ok) throw new Error(`bench: import failed: ${result.code} ${result.message}`);
      },
      SLOW_BENCH_OPTIONS,
    );

    bench(
      '.ornpkg',
      async () => {
        const result = await parseImportSource({ fileName: 'bench.ornpkg', bytes: packageBlob }, importDeps);
        if (!result.ok) throw new Error(`bench: import failed: ${result.code} ${result.message}`);
      },
      SLOW_BENCH_OPTIONS,
    );
  });
}
