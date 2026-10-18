/**
 * Step 6.1b part 4 (openItem 119; informal, PERFORMANCE_ARCHITECTURE.md §2 has no row): what ONE automatic snapshot costs at the design tier
 * (5,000 reactions, dense). The build is in the compute worker (a REAL worker thread here), so the main thread's part is the rest:
 *  - "end to end": the flow's calls over a real thread (wait for the replica is a no-op here, build in the worker, store the bytes on
 *    fake-indexeddb, pruning to five) as WALL CLOCK; the awaits overlap the thread's work, so this is not the main thread's time;
 *  - "main thread: store": `storeSnapshotBytes` of the built bytes with pruning (a Blob, the queue, one IndexedDB transaction on
 *    fake-indexeddb, whose reads and writes cost far more than a real IndexedDB's; not our code beyond the Blob and the queue);
 *  - "main thread: receive": `v8.deserialize` of the answer holding the bytes, an upper bound (the real answer's buffer is TRANSFERRED, not copied).
 * Before this step the same snapshot was built on the main thread (`snapshot.bench.ts`: "build: serialise + compress").
 * Run once, alone; not `bench:baseline`, not `bench:compare`.
 */
import { deserialize, serialize } from 'node:v8';
import { afterAll, bench, describe } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '@/core/schema';
import { TEST_GENERATOR } from '@/test-support/compute-rig';
import { SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';
import { freshAdapter, seedChangeSet } from '@/test-support/persistence-kit';
import { spawnComputeWorker } from '@/test-support/rpc-node-port';
import { COMPUTE_SPECS } from '@/workers/compute/specs';
import { createRpcClient } from '@/workers/rpc';
import type { ComputeWorkerApi } from '@/workers/rpc/contracts';

const NOW = '2026-10-18T10:00:00.000Z';
const state = tierState('design', 'dense', 1);

describe('one automatic snapshot (design tier, dense): the build in the compute worker', async () => {
  const client = createRpcClient<ComputeWorkerApi>({ factory: () => spawnComputeWorker(), specs: COMPUTE_SPECS });
  afterAll(() => client.terminate());
  const loaded = await client.loadReplica({ state, revision: 1 }, { timeoutMs: 120_000 });
  if (!loaded.ok) throw new Error('bench setup: loadReplica failed');
  const t = freshAdapter({ initialRevision: 0 });
  await t.adapter.writeChanges(seedChangeSet(state, 1), state);

  const build = async () => {
    const built = await client.snapshotBuild({ revision: 1, reason: 'periodic', exportedAt: NOW, generator: TEST_GENERATOR }, { timeoutMs: 120_000 });
    if (!built.ok || !built.value.ok) throw new Error('bench: the snapshot was not built');
    return built.value;
  };
  const first = await build();
  const answer = serialize({ ok: true, value: first });

  bench('end to end, wall clock: build in the worker thread, then store with pruning (fake-indexeddb)', async () => {
    const built = await build();
    const stored = await t.adapter.storeSnapshotBytes({ bytes: built.bytes, reason: 'periodic', revision: 1, schemaVersion: built.schemaVersion });
    if (!stored.ok) throw new Error('bench: the snapshot was not stored');
  }, SLOW_BENCH_OPTIONS);

  bench('main thread: receive the answer (v8.deserialize of the bytes: an upper bound, the real buffer is transferred)', () => void deserialize(answer), SLOW_BENCH_OPTIONS);

  bench('main thread: store the bytes with pruning to five (storeSnapshotBytes on fake-indexeddb)', async () => {
    const stored = await t.adapter.storeSnapshotBytes({ bytes: first.bytes, reason: 'periodic', revision: 1, schemaVersion: CURRENT_SCHEMA_VERSION });
    if (!stored.ok) throw new Error('bench: the snapshot was not stored');
  }, SLOW_BENCH_OPTIONS);
});
