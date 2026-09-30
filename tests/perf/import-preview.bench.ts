/**
 * Import parse -> preview (docs/PERFORMANCE_ARCHITECTURE.md §2: "Import 5k reactions (parse -> preview)" < 5 s), design tier.
 * Two scenarios: into an EMPTY store, and into a design-tier store where every incoming ID conflicts (a different seed gives the
 * same IDs with different content). The stages are measured separately (parse, conflict analysis, merged replica, merged-replica
 * validation) and together (parse + a whole `session.preview`, the number the 5 s row is about). Heavy work runs in-process in
 * Phase 3 (Phase 3 note 4); fake ports, no IndexedDB (assets: none: the generator makes no asset records).
 *
 * Reading the rows (step 3.7 review, item c): vitest runs the cases one after another, minutes apart, and this machine's speed
 * drifts by up to about 2x over that span (the same `validateMerged` measured 1.4 s in one bench run and 2.6 s in a plain test
 * minutes later). So a stage row and the total are NOT comparable across rows: there is no shortcut in the total (it runs every
 * stage). The row 'stage functions back to back' does exactly the total's work by calling the stage functions itself and runs
 * right next to it: compare the total with THAT row, never with the sum of the stage rows.
 */
import { bench, describe } from 'vitest';
import { createIdFactory } from '@/core/dataset';
import { migrationRunner } from '@/core/migrations';
import { emptyRecordTables, type CanonicalState } from '@/core/schema';
import {
  analyzeConflicts,
  buildMergedReplica,
  buildOrnJsonExport,
  createImportSession,
  parseImportSource,
  resolveRequest,
  validateMerged,
  type ImportStorePort,
  type OrnJsonExportDeps,
} from '@/io';
import { mulberry32 } from '@/test-support/command-kit';
import { fakePorts } from '@/test-support/import-kit';
import { SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';

const exportDeps: OrnJsonExportDeps = { exportedAt: '2026-09-29T00:00:00.000Z', generator: { app: 'orn-bench', version: '1' }, assetBytes: async () => undefined };
const importDeps = { runner: migrationRunner };

for (const shape of ['dense', 'hub_explosion'] as const) {
  const incomingState = tierState('design', shape, 2);
  const scenarios: readonly (readonly [string, CanonicalState])[] = [
    ['into an empty store', { meta: incomingState.meta, records: emptyRecordTables() }],
    ['into a design-tier store, every ID conflicting', tierState('design', shape, 1)],
  ];

  for (const [label, live] of scenarios) {
    describe(`import preview (design tier, ${shape}, ${label})`, async () => {
      const exported = await buildOrnJsonExport(incomingState, { scope: 'full', includeDependencies: false, assets: 'none' }, exportDeps);
      if (!exported.ok) throw new Error(`bench setup: export failed: ${exported.message}`);
      const blob = new Blob([exported.result.bytes as BlobPart]);
      const parseOnce = async () => {
        const outcome = await parseImportSource({ fileName: 'bench.orn.json', bytes: blob }, importDeps);
        if (!outcome.ok) throw new Error(`bench: parse failed: ${outcome.code} ${outcome.message}`);
        return outcome.result;
      };
      const parsed = await parseOnce();
      const analysis = analyzeConflicts(live, parsed);
      const resolved = resolveRequest(undefined, analysis);
      if (!resolved.ok) throw new Error(resolved.message);
      const ids = createIdFactory({ nowMs: () => 1_790_000_000_000 }, { next: mulberry32(1) });
      const mergeInput = { live, parsed, analysis, request: resolved.value, copyIds: new Map<string, string>(), ids };
      const merged = buildMergedReplica(mergeInput);
      if (!merged.ok) throw new Error(merged.message);
      const ports = fakePorts();
      const store: ImportStorePort = { getState: () => live, getRevision: () => 1, isReadOnly: () => false, replaceState: () => { throw new Error('bench never applies'); } };

      bench('parse (caps, safe parse, envelope, L1)', async () => void (await parseOnce()), SLOW_BENCH_OPTIONS);
      bench('conflict analysis', () => void analyzeConflicts(live, parsed), SLOW_BENCH_OPTIONS);
      bench('merged replica (build)', () => void buildMergedReplica({ ...mergeInput, copyIds: new Map() }), SLOW_BENCH_OPTIONS);
      bench('merged-replica validation (index build + validateAll)', () => void validateMerged(merged.state, 2), SLOW_BENCH_OPTIONS);
      bench(
        'stage functions back to back (parse, analysis, merge, validation)',
        async () => {
          const result = await parseOnce();
          const found = analyzeConflicts(live, result);
          const request = resolveRequest(undefined, found);
          if (!request.ok) throw new Error(request.message);
          const built = buildMergedReplica({ live, parsed: result, analysis: found, request: request.value, copyIds: new Map(), ids });
          if (!built.ok) throw new Error(built.message);
          validateMerged(built.state, 2);
        },
        SLOW_BENCH_OPTIONS,
      );
      bench(
        'parse -> preview (total)',
        async () => {
          const result = await parseOnce();
          const session = createImportSession({ store, ids, snapshots: ports.snapshotPort, batches: ports.sink, assetStage: ports.stage });
          const outcome = await session.preview({ parsed: result, fileName: 'bench.orn.json' });
          if (!outcome.ok) throw new Error(`bench: preview failed: ${outcome.code} ${outcome.message}`);
        },
        SLOW_BENCH_OPTIONS,
      );
    });
  }
}
