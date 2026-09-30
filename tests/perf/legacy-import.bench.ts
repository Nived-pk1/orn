/**
 * Legacy parse -> preview (docs/PERFORMANCE_ARCHITECTURE.md §2: "Import 5k reactions (parse -> preview)" < 5 s), step 3.11c: the v6 demo
 * export and a 5,000-reaction synthetic legacy file (`syntheticLegacy`), into an EMPTY store. "Parse -> preview" is what a user waits
 * for: the caps, the safe parse and format detection, then the whole session preview (port, IDs, the three mappers, strict L1,
 * conflict analysis, merged replica, validation). One-off conversion, in-process (Phase 3 note 4), fake ports. Run once alone; the
 * baseline is not touched (step 3.12).
 */
import { bench, describe } from 'vitest';
import { createIdFactory } from '@/core/dataset';
import { migrationRunner } from '@/core/migrations';
import { createImportSession, parseImportSource, type ImportStorePort } from '@/io';
import { mulberry32 } from '@/test-support/command-kit';
import { fakePorts } from '@/test-support/import-kit';
import { legacyBytes, emptyState } from '@/test-support/legacy-import-kit';
import { syntheticLegacy } from '@/test-support/legacy-synthetic';
import { SLOW_BENCH_OPTIONS } from '@/test-support/perf-kit';

const live = emptyState();
const store: ImportStorePort = { getState: () => live, getRevision: () => 1, isReadOnly: () => false, replaceState: () => { throw new Error('bench never applies'); } };

const files: readonly (readonly [string, Uint8Array])[] = [
  ['v6-demo-export.json (22 reactions)', legacyBytes('v6-demo-export.json')],
  ['synthetic legacy file, 5,000 reactions', new TextEncoder().encode(JSON.stringify(syntheticLegacy(5_000)))],
];

for (const [label, bytes] of files) {
  describe(`legacy parse -> preview (${label}, into an empty store)`, () => {
    bench(
      'parse -> preview (total)',
      async () => {
        const outcome = await parseImportSource({ fileName: 'bench.json', bytes: new Blob([bytes as BlobPart]) }, { runner: migrationRunner });
        if (!outcome.ok) throw new Error(`bench: parse failed: ${outcome.code} ${outcome.message}`);
        const ports = fakePorts();
        const ids = createIdFactory({ nowMs: () => 1_790_000_000_000 }, { next: mulberry32(1) });
        const session = createImportSession({ store, ids, snapshots: ports.snapshotPort, batches: ports.sink, assetStage: ports.stage });
        const preview = await session.preview({ parsed: outcome.result, fileName: 'bench.json' });
        if (!preview.ok) throw new Error(`bench: preview failed: ${preview.code} ${preview.message}`);
      },
      SLOW_BENCH_OPTIONS,
    );
  });
}
