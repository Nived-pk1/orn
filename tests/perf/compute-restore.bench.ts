/**
 * Step 4.2d (informal; PERFORMANCE_ARCHITECTURE.md §2 has no row for these), design tier. What the compute worker takes off the
 * main thread for a snapshot restore, for boot and for a follower's reload, and whether the worker's validation is worth building
 * into the hub-edit `applyRemote` (Phase 4 plan row 4.2d). "Main-thread part" is reported as separate entries, because the
 * awaits of an end-to-end run overlap the thread's work:
 *  - restore: the Phase 3 in-process `restoreSnapshot` (everything on main) against a REAL thread's end-to-end run (wall clock),
 *    and the parts that block main: sending the snapshot bytes and receiving the decoded state with its findings (`v8.serialize` /
 *    `v8.deserialize` as proxies of the structured clone, as in step 4.2c), and `replaceState` with the precomputed findings
 *    (index build on main, D2).
 *  - boot: bulk read (fake-indexeddb, not our code), per-record L1 on main, serialising the state (or the raw rows: observation 3)
 *    for the worker, receiving the findings, and building the store from them; against the in-process pass.
 *  - follower reload: the same pieces plus `reload` with and without precomputed findings.
 *  - hub-edit `applyRemote`: with the in-process validation, and with the validation replayed from a recorded result (what the
 *    main thread would still do if the worker had validated: patches, ChangeSet, incremental indexes, finding commit), plus the
 *    receive of that result.
 * Run once, alone; not `bench:baseline`, not `bench:compare`. The snapshot store here is in memory: IndexedDB is I/O, not ours.
 */
import { deserialize, serialize } from 'node:v8';
import { afterAll, bench, describe } from 'vitest';
import { createCanonicalStore, type PrecomputedFindings } from '@/core/commands';
import { migrationRunner } from '@/core/migrations';
import { DatasetMetaSchema, type AnyRecord, type CanonicalState, type RecordKind, type RecordRef } from '@/core/schema';
import { validator, type TouchedValidation, type Validator } from '@/core/validation';
import { assembleState } from '@/persistence/boot-load';
import type { PersistenceAdapter } from '@/persistence/contracts';
import { restoreSnapshot } from '@/persistence/restore';
import { buildSnapshot, decodeSnapshot } from '@/persistence/snapshot-codec';
import { buildIndexes, designTierHubState, leastReferencedSpecies, mostReferencedSpecies, SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';
import { freshAdapter, reopen, seedChangeSet } from '@/test-support/persistence-kit';
import { precomputedOf } from '@/test-support/precomputed-kit';
import { spawnComputeWorker } from '@/test-support/rpc-node-port';
import { must } from '@/test-support/state-fixture';
import { createBootReplica } from '@/workers/compute/boot-port';
import { createComputeRestore } from '@/workers/compute/restore-flow';
import { COMPUTE_SPECS } from '@/workers/compute/specs';
import { createReplicaSync } from '@/workers/compute/sync';
import { createRpcClient } from '@/workers/rpc';
import type { ComputeWorkerApi } from '@/workers/rpc/contracts';

const NOW = '2026-09-30T12:00:00.000Z';
const first = tierState('design', 'dense', 1);
const second = tierState('design', 'dense', 2);
const bytesOf = (state: CanonicalState): Uint8Array => {
  const built = buildSnapshot({ id: 'snp_bench', createdAt: NOW, reason: 'manual', state, revision: 1, generator: { app: 'orn-bench', version: '1' } });
  if (!built.ok) throw new Error('bench setup: the snapshot does not serialise');
  return built.built.bytes;
};
const snapshotBytes: Record<string, Uint8Array> = { A: bytesOf(second), B: bytesOf(first) };
const summaryOf = (id: string, revision = 1) => ({ id, createdAt: NOW, reason: 'manual' as const, revision, schemaVersion: 1, byteSize: snapshotBytes[id]?.length ?? 0 });
const ok = (result: { readonly ok: boolean }, what: string): void => {
  if (!result.ok) throw new Error(`bench: ${what} was refused: ${JSON.stringify(result)}`);
};

describe('restore (design tier, dense): the Phase 3 in-process restore, everything on the main thread', () => {
  const store = createCanonicalStore({ initial: first, validateInitial: false });
  const snapshots: Pick<PersistenceAdapter, 'createSnapshot' | 'readSnapshot' | 'deleteSnapshot'> = {
    async readSnapshot(id) {
      const decoded = decodeSnapshot(snapshotBytes[id] as Uint8Array);
      if (!decoded.ok) throw new Error(decoded.message);
      return { ok: true, summary: summaryOf(id), doc: decoded.doc };
    },
    async createSnapshot(reason, state, revision) {
      const built = buildSnapshot({ id: 'snp_pre', createdAt: NOW, reason, state, revision, generator: { app: 'orn-bench', version: '1' } });
      if (!built.ok) throw new Error('bench: pre_restore did not serialise');
      return built.built.summary;
    },
    deleteSnapshot: async () => undefined,
  };
  let n = 0;
  bench(
    'restoreSnapshot in process (read + decode + migrate + strict L1 + pre_restore build + replaceState with validateAll)',
    async () => ok(await restoreSnapshot({ id: n++ % 2 === 0 ? 'A' : 'B', snapshots, runner: migrationRunner, store }), 'restore'),
    SLOW_BENCH_OPTIONS,
  );
});

describe('restore through a real thread (design tier, dense): end to end, wall clock', async () => {
  const store = createCanonicalStore({ initial: first, validateInitial: false });
  const sync = createReplicaSync({ store, factory: () => spawnComputeWorker() });
  afterAll(() => sync.stop());
  await sync.settled();
  const flow = createComputeRestore({
    sync,
    store: { getRevision: () => store.getRevision(), isReadOnly: () => store.isReadOnly(), replaceState: (next, reason, pre) => store.replaceState(next, reason, pre) },
    snapshots: {
      readSnapshotBytes: async (id) => ({ ok: true, summary: summaryOf(id), bytes: (snapshotBytes[id] as Uint8Array).slice() }),
      storeSnapshotBytes: async (input) => ({ ok: true, summary: { ...summaryOf('snp_pre', input.revision), reason: 'pre_restore' } }),
      deleteSnapshot: async () => undefined,
    },
    ids: { now: () => NOW },
  });
  let n = 0;
  bench(
    'restore end to end: read bytes, decode + migrate + L1 + indexes + validateAll in the thread, pre_restore built in the thread, replaceState with precomputed, adoption',
    async () => {
      ok(await flow.restore(n++ % 2 === 0 ? 'A' : 'B'), 'restore');
      await sync.settled();
    },
    SLOW_BENCH_OPTIONS,
  );
});

describe('restore: what blocks the main thread (design tier, dense)', async () => {
  const client = createRpcClient<ComputeWorkerApi>({ factory: () => spawnComputeWorker(), specs: COMPUTE_SPECS });
  afterAll(() => client.terminate());
  const loaded = await client.loadReplica({ state: first, revision: 0 }, { timeoutMs: 120_000 });
  if (!loaded.ok) throw new Error('bench setup: loadReplica failed');
  const request = { bytes: snapshotBytes['A'] as Uint8Array, id: 'A', schemaVersion: 1, baseRevision: 0 };
  const decoded = await client.snapshotDecode(request, { timeoutMs: 120_000 });
  if (!decoded.ok || !decoded.value.ok) throw new Error('bench setup: snapshotDecode failed');
  const answer = serialize(decoded.value);

  bench('send: serialise the decode request (the snapshot bytes)', () => void serialize(request), SLOW_BENCH_OPTIONS);
  bench('receive: deserialise the decode answer (state + findings; blocks the caller)', () => void deserialize(answer), SLOW_BENCH_OPTIONS);

  const stamped = new Map<CanonicalState, PrecomputedFindings>([
    [first, precomputedOf(first, 0)],
    [second, precomputedOf(second, 0)],
  ]);
  const store = createCanonicalStore({ initial: first, validateInitial: false });
  let n = 0;
  bench(
    'replaceState with the thread\'s findings (check + index build on main + commit)',
    () => {
      const target = n++ % 2 === 0 ? second : first;
      ok(store.replaceState(target, 'restore', { ...(stamped.get(target) as PrecomputedFindings), revision: store.getRevision() + 1 }), 'replaceState');
    },
    SLOW_BENCH_OPTIONS,
  );
});

// ---- boot and follower reload -------------------------------------------------------------------------------------------

const seeded = freshAdapter({ initialRevision: 0 });
await seeded.adapter.writeChanges(seedChangeSet(first, 1), first);
let database = reopen(seeded);
const committed = await database.adapter.readCommitted();
const datasetMeta = DatasetMetaSchema.parse(committed.meta.datasetMeta);
const assembled = assembleState(committed.rows, datasetMeta, NOW);
if (assembled.rejected.length > 0) throw new Error('bench setup: the generated rows must all pass L1');
const firstPrecomputed = precomputedOf(first, 1);

describe('boot, the parts on the main thread (design tier, dense)', () => {
  bench('bulk read from fake-indexeddb (readCommitted; not our code)', async () => void (await database.adapter.readCommitted()), SLOW_BENCH_OPTIONS);
  bench('per-record L1 + state on main (assembleState over the rows)', () => void assembleState(committed.rows, datasetMeta, NOW), SLOW_BENCH_OPTIONS);
  bench('send to the worker: serialise the assembled state', () => void serialize(assembled.state), SLOW_BENCH_OPTIONS);
  bench('send to the worker, alternative (observation 3): serialise the RAW rows and meta', () => void serialize({ rows: committed.rows, meta: committed.meta }), SLOW_BENCH_OPTIONS);
  const answer = serialize(firstPrecomputed);
  bench('receive from the worker: deserialise the findings (blocks the caller)', () => void deserialize(answer), SLOW_BENCH_OPTIONS);
  bench('in process: index build + validateAll (what open() ran on main before)', () => void precomputedOf(assembled.state, 1), SLOW_BENCH_OPTIONS);
  bench('the store from the boot result WITH precomputed findings (index build + commit)', () => void createCanonicalStore({ initial: assembled.state, revision: 1, precomputed: firstPrecomputed }), SLOW_BENCH_OPTIONS);
  bench('the store from the boot result WITHOUT them (validateInitial default: index build + validateAll)', () => void createCanonicalStore({ initial: assembled.state, revision: 1 }), SLOW_BENCH_OPTIONS);
});

describe('boot: whole open() (includes the fake-indexeddb read and the marker writes)', () => {
  bench(
    'open() in process',
    async () => {
      database = reopen(database);
      const result = await database.adapter.open();
      if (result.mode !== 'read_write') throw new Error('bench: boot did not open read-write');
    },
    SLOW_BENCH_OPTIONS,
  );
  const boot = createBootReplica({ factory: () => spawnComputeWorker() });
  afterAll(() => boot.stop());
  bench(
    'open() through a real thread (validation in the thread; wall clock)',
    async () => {
      database = reopen(database, { validate: boot.validate });
      const result = await database.adapter.open();
      if (result.mode !== 'read_write' || result.bootReport?.validation.where !== 'worker') throw new Error('bench: boot did not validate in the worker');
    },
    SLOW_BENCH_OPTIONS,
  );
});

describe('follower reload (design tier, dense): reload with and without the worker\'s findings', () => {
  const other = precomputedOf(second, 1_000);
  const stamped = new Map<CanonicalState, PrecomputedFindings>([
    [first, { ...firstPrecomputed, revision: 1_000 }],
    [second, other],
  ]);
  const plain = createCanonicalStore({ initial: first, validateInitial: false, readOnly: () => true });
  let a = 0;
  bench('reload in process: validateAll + index build + commit', () => ok(plain.reload(a++ % 2 === 0 ? second : first, 1_000), 'reload'), SLOW_BENCH_OPTIONS);
  const fast = createCanonicalStore({ initial: first, validateInitial: false, readOnly: () => true });
  let b = 0;
  bench(
    'reload with the worker\'s findings: check + index build + commit',
    () => {
      const target = b++ % 2 === 0 ? second : first;
      ok(fast.reload(target, 1_000, stamped.get(target) as PrecomputedFindings), 'reload with precomputed');
    },
    SLOW_BENCH_OPTIONS,
  );
});

// ---- hub-edit applyRemote -----------------------------------------------------------------------------------------------

describe('follower applyRemote, hub edit (design tier, like-water hub, ~1,000 records): with and without the worker\'s validation', () => {
  const initial = designTierHubState();
  const indexes = buildIndexes(initial);
  const hub: RecordRef = mostReferencedSpecies(initial, indexes);
  const spare: RecordRef = leastReferencedSpecies(initial, indexes);
  const writer = createCanonicalStore({ initial, revision: 1, validateInitial: false });
  let refs: RecordRef[] = [];
  writer.subscribe((changes) => {
    refs = [...changes.created, ...changes.updated, ...changes.deleted];
  });
  const committedEdit = writer.dispatch({ label: 'bench: merge hub', commands: [{ type: 'record.replaceReferences', from: hub, to: spare }] });
  if (!committedEdit.ok) throw new Error('bench setup: the hub edit was rejected');
  const recordOf = (state: CanonicalState, ref: RecordRef): AnyRecord => must((state.records[ref.kind as RecordKind] as Record<string, AnyRecord>)[ref.id]);
  const versions = { before: refs.map((r) => recordOf(initial, r)), after: refs.map((r) => recordOf(writer.getState(), r)) };

  const applier = (store: ReturnType<typeof createCanonicalStore>) => {
    let revision = 1;
    let edited = false;
    return () => {
      const upserts = edited ? versions.before : versions.after;
      edited = !edited;
      const result = store.applyRemote({ fromRevision: revision, revision: revision + 1, upserts, deletedIds: [] });
      if (!result.ok) throw new Error(`bench: applyRemote refused: ${result.error.code} ${result.error.message}`);
      revision += 1;
    };
  };

  const inProcess = createCanonicalStore({ initial, revision: 1, readOnly: () => true });
  bench('applyRemote, hub edit, validation in process (patches + indexes + validateTouchedByRule + commit)', applier(inProcess), SLOW_BENCH_OPTIONS);

  // The validation of the two directions is computed once by the real validator, then replayed: what main would still do if the
  // worker had validated (its result arrives as data). The store's finding store follows the same alternation, so each replay
  // is the result its real run had.
  const recorded: TouchedValidation[] = [];
  let calls = 0;
  const replaying: Validator = {
    ...validator,
    validateTouchedByRule(...args: Parameters<Validator['validateTouchedByRule']>): TouchedValidation {
      const direction = calls++ % 2;
      const cached = recorded[direction];
      if (cached !== undefined) return cached;
      const real = validator.validateTouchedByRule(...args);
      recorded[direction] = real;
      return real;
    },
  };
  const replayed = createCanonicalStore({ initial, revision: 1, readOnly: () => true, validator: replaying });
  const applyReplayed = applier(replayed);
  applyReplayed();
  applyReplayed();
  bench('applyRemote, hub edit, the validation replayed as data (patches + indexes + finding commit; NO validation)', applyReplayed, SLOW_BENCH_OPTIONS);

  const result = serialize(recorded[0]);
  bench('receive the validation result of the hub edit from the worker: deserialise (blocks the caller)', () => void deserialize(result), SLOW_BENCH_OPTIONS);
});
