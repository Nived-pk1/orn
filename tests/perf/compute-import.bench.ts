/**
 * Step 4.2c (informal, except the one §2 row that applies: "Import 5k reactions (parse -> preview)" < 5 s), design tier.
 *  - In the worker's own code (no thread): the whole `importPreview` (parse from a Blob, conflict analysis, merged replica,
 *    validation) into an EMPTY store (dense) and into a design-tier store with every ID conflicting (hub_explosion: the case
 *    the Gate E watch item is about), and `importPrepareApply` (the merged state's replica: index build + `validateAll`).
 *  - `snapshotBuild` in the worker's code (dense).
 *  - Through a REAL `worker_threads` thread: the `importPreview` round trip with the file as a Blob, the `importPrepareApply`
 *    round trip (the merged state and its findings come back, D3), and the receiving side of the merged state measured as
 *    `v8.deserialize` of its serialised form (the part that blocks the main thread, as `v8.serialize` was for the state sent
 *    out in step 4.2b).
 * Run once, alone; not `bench:baseline`, not `bench:compare`.
 */
import { deserialize, serialize } from 'node:v8';
import { afterAll, bench, describe } from 'vitest';
import { emptyRecordTables, type CanonicalState } from '@/core/schema';
import { buildOrnJsonExport, type OrnJsonExportDeps } from '@/io';
import { SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';
import { spawnComputeWorker } from '@/test-support/rpc-node-port';
import { createComputeHandlers } from '@/workers/compute/handlers';
import { COMPUTE_SPECS } from '@/workers/compute/specs';
import { createRpcClient } from '@/workers/rpc';
import type { ComputeWorkerApi, RpcCallContext } from '@/workers/rpc/contracts';

const exportDeps: OrnJsonExportDeps = { exportedAt: '2026-09-29T00:00:00.000Z', generator: { app: 'orn-bench', version: '1' }, assetBytes: async () => undefined };
const ids = { nowIso: '2026-09-30T12:00:00.000Z', seed: 1 };
const ctx: RpcCallContext = { signal: new AbortController().signal, progress: () => undefined };

async function fileOf(state: CanonicalState): Promise<Blob> {
  const exported = await buildOrnJsonExport(state, { scope: 'full', includeDependencies: false, assets: 'none' }, exportDeps);
  if (!exported.ok) throw new Error(`bench setup: export failed: ${exported.message}`);
  return new Blob([exported.result.bytes as BlobPart]);
}

const dense = tierState('design', 'dense', 2);
const scenarios: readonly (readonly [string, string, CanonicalState, CanonicalState])[] = [
  ['dense', 'into an empty store', { meta: dense.meta, records: emptyRecordTables() }, dense],
  ['hub_explosion', 'into a design-tier store, every ID conflicting', tierState('design', 'hub_explosion', 1), tierState('design', 'hub_explosion', 2)],
];

for (const [shape, label, live, incoming] of scenarios) {
  describe(`import in the worker code (design tier, ${shape}, ${label})`, async () => {
    const blob = await fileOf(incoming);
    const { api, replica } = createComputeHandlers();
    replica.load(live, 0);
    const preview = async () => {
      const outcome = await api.importPreview({ source: blob, fileName: 'bench.orn.json', ids }, ctx);
      if (!outcome.ok) throw new Error(`bench: preview failed: ${outcome.code} ${outcome.message}`);
      return outcome.plan;
    };
    const plan = await preview();

    bench(
      'importPrepareApply: the merged state\'s replica (freeze + index build + validateAll)',
      async () => {
        const answer = await api.importPrepareApply({ batchId: plan.preview.batchId, plan, baseRevision: 0 }, ctx);
        if (!answer.ok) throw new Error(`bench: prepare failed: ${answer.code} ${answer.message}`);
      },
      SLOW_BENCH_OPTIONS,
    );
    bench('importPreview: parse -> preview (total)', async () => void (await preview()), SLOW_BENCH_OPTIONS);
  });
}

describe('snapshotBuild in the worker code (design tier, dense)', () => {
  const { api, replica } = createComputeHandlers();
  replica.load(dense, 0);
  bench(
    'snapshotBuild: serialise + compress the replica',
    async () => {
      const answer = await api.snapshotBuild({ revision: 0, reason: 'pre_import', exportedAt: ids.nowIso }, ctx);
      if (!answer.ok) throw new Error('bench: snapshotBuild failed');
    },
    SLOW_BENCH_OPTIONS,
  );
});

describe('import through a real thread (design tier, dense, into an empty store)', async () => {
  const client = createRpcClient<ComputeWorkerApi>({ factory: () => spawnComputeWorker(), specs: COMPUTE_SPECS });
  afterAll(() => client.terminate());
  const blob = await fileOf(dense);
  // Thread start-up (tsx) and the first load are not part of any sample.
  const loaded = await client.loadReplica({ state: { meta: dense.meta, records: emptyRecordTables() }, revision: 0 }, { timeoutMs: 120_000 });
  if (!loaded.ok) throw new Error(`bench setup: loadReplica failed: ${loaded.error.code}`);
  const first = await client.importPreview({ source: blob, fileName: 'bench.orn.json', ids }, { timeoutMs: 120_000 });
  if (!first.ok || !first.value.ok) throw new Error('bench setup: importPreview failed');
  const plan = first.value.plan;
  const received = await client.importPrepareApply({ batchId: plan.preview.batchId, plan, baseRevision: 0 }, { timeoutMs: 120_000 });
  if (!received.ok || !received.value.ok) throw new Error('bench setup: importPrepareApply failed');
  const serialized = serialize(received.value.mergedState);

  bench(
    'importPrepareApply round trip (merged state and findings back)',
    async () => {
      const answer = await client.importPrepareApply({ batchId: plan.preview.batchId, plan, baseRevision: 0 }, { timeoutMs: 120_000 });
      if (!answer.ok || !answer.value.ok) throw new Error('bench: importPrepareApply failed');
    },
    SLOW_BENCH_OPTIONS,
  );
  bench('receiving side of the merged state: v8.deserialize (blocks the caller)', () => void deserialize(serialized), SLOW_BENCH_OPTIONS);
  bench(
    'importPreview round trip (Blob in, plan out)',
    async () => {
      const answer = await client.importPreview({ source: blob, fileName: 'bench.orn.json', ids }, { timeoutMs: 120_000 });
      if (!answer.ok || !answer.value.ok) throw new Error('bench: importPreview failed');
    },
    SLOW_BENCH_OPTIONS,
  );
});
