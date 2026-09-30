/**
 * Step 4.2d over a REAL `worker_threads` thread running the real compute entry (`startComputeHost`) under tsx: boot validated
 * in the thread (one `loadReplica`, the sync adopting the replica boot loaded, the store built once from the precomputed
 * findings), and a snapshot restore end to end (bytes read on main, decoded and prepared in the thread, the `pre_restore`
 * snapshot built there and stored by the real adapter, ONE `replaceState` with the thread's findings, the thread adopting).
 * The in-memory twins are compute-boot.test.ts and compute-restore.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import type { OpenResult } from '@/persistence/contracts';
import { speciesEditor, firstSpeciesId, NOW_ISO } from '@/test-support/compute-restore-kit';
import { persistedStore } from '@/test-support/compute-import-kit';
import { savedDatabase } from '@/test-support/persistence-kit';
import { sortedFindings } from '@/test-support/replica-kit';
import { spawnComputeWorker } from '@/test-support/rpc-node-port';
import { loadFixtureState } from '@/test-support/state-fixture';
import { createBootReplica } from '@/workers/compute/boot-port';
import { createComputeRestore } from '@/workers/compute/restore-flow';
import { createReplicaSync, type ReplicaSync } from '@/workers/compute/sync';
import type { WorkerEvent } from '@/workers/rpc/contracts';

const base = loadFixtureState('maximal-valid');
/** Starting a thread under tsx takes seconds when the whole suite runs in parallel (the default 5 s is too tight for a restart). */
const THREAD_TEST_TIMEOUT_MS = 60_000;
const running: (() => void)[] = [];
afterEach(() => {
  for (const stop of running.splice(0)) stop();
});

function opened(result: OpenResult): Exclude<OpenResult, { mode: 'unavailable' }> {
  if (result.mode === 'unavailable') throw new Error(result.detail);
  return result;
}

describe('boot in a real thread', () => {
  it('validates in the thread, builds no index on this side of open(), and the sync starts from the replica boot loaded (one thread, one load)', async () => {
    const events: WorkerEvent[] = [];
    let started = 0;
    const factory = () => {
      started += 1;
      return spawnComputeWorker();
    };
    const boot = createBootReplica({ factory, onEvent: (e) => events.push(e) });
    running.push(() => boot.stop());
    const t = await savedDatabase(base, { validate: boot.validate });
    const result = opened(await t.adapter.open());
    expect(result).toMatchObject({ mode: 'read_write', revision: 1 });
    expect(result.bootReport?.validation).toMatchObject({ where: 'worker' });
    const store = createCanonicalStore({ initial: result.state as never, revision: 1, ...(result.bootReport?.precomputed === undefined ? {} : { precomputed: result.bootReport.precomputed }), verifyPrecomputed: true });
    const adoption = boot.adoption();
    expect(adoption).toMatchObject({ revision: 1 });
    const sync: ReplicaSync = createReplicaSync({ factory, store, ...(adoption === undefined ? {} : { adopt: adoption }), onEvent: (e) => events.push(e) });
    running.push(() => sync.stop());
    expect(sync.status()).toMatchObject({ state: 'in_sync', replicaRevision: 1, reloads: 1 });
    expect(started).toBe(1);

    // The thread's replica answers exactly the store's findings, and follows a commit.
    const answer = await sync.client.validateAll({ revision: 1 });
    if (!answer.ok || !answer.value.ok) throw new Error('validateAll failed');
    expect(sortedFindings(answer.value.findings)).toEqual(sortedFindings(store.findings.all()));
    speciesEditor(store, firstSpeciesId(base))();
    expect(await sync.settled()).toMatchObject({ state: 'in_sync', replicaRevision: 2, reloads: 1 });
    expect(events.some((e) => e.type === 'validation_fallback')).toBe(false);
    expect(started).toBe(1);
  }, THREAD_TEST_TIMEOUT_MS);
});

describe('a snapshot restore in a real thread', () => {
  it('reads the bytes, decodes and validates in the thread, stores the thread-built pre_restore snapshot, replaces the state once, and the thread adopts', async () => {
    const persisted = await persistedStore(base);
    const { store, t } = persisted;
    let started = 0;
    const sync = createReplicaSync({ store, factory: () => (started += 1, spawnComputeWorker()) });
    running.push(() => sync.stop());
    await sync.settled();
    const edit = speciesEditor(store, firstSpeciesId(base));
    edit();
    const source = await t.adapter.createSnapshot('manual', store.getState(), store.getRevision());
    const atSnapshot = store.getState();
    edit();
    edit();
    const flow = createComputeRestore({
      sync,
      store: { getRevision: () => store.getRevision(), isReadOnly: () => store.isReadOnly(), replaceState: (next, reason, pre) => store.replaceState(next, reason, pre) },
      snapshots: t.adapter,
      ids: { now: () => NOW_ISO },
    });
    const revisionBefore = store.getRevision();
    const result = await flow.restore(source.id);
    if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
    const settled = await sync.settled();
    await t.adapter.flush();

    expect(store.getState()).toEqual(atSnapshot);
    expect(store.getRevision()).toBe(revisionBefore + 1);
    expect(store.canUndo()).toBe(false);
    expect(result.preRestore).toMatchObject({ reason: 'pre_restore', revision: revisionBefore });
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: revisionBefore + 1, reloads: 1 });
    expect(started).toBe(1);
    const stored = await t.adapter.readSnapshot(result.preRestore.id);
    expect(stored.ok).toBe(true);
    const answer = await sync.client.validateAll({ revision: store.getRevision() });
    if (!answer.ok || !answer.value.ok) throw new Error('validateAll failed');
    expect(sortedFindings(answer.value.findings)).toEqual(sortedFindings(store.findings.all()));
    edit();
    expect(await sync.settled()).toMatchObject({ state: 'in_sync', replicaRevision: revisionBefore + 2, reloads: 1 });
  }, THREAD_TEST_TIMEOUT_MS);

  it('a thread that exits while decoding: REJECTED with the reason, nothing changed, the new thread holds the reloaded replica', async () => {
    const persisted = await persistedStore(base);
    const { store, t } = persisted;
    let started = 0;
    const crashOn = ['snapshotDecode'];
    const sync = createReplicaSync({ store, factory: () => spawnComputeWorker(crashOn[started++]) });
    running.push(() => sync.stop());
    await sync.settled();
    const source = await t.adapter.createSnapshot('manual', store.getState(), store.getRevision());
    const before = { state: store.getState(), revision: store.getRevision() };
    const flow = createComputeRestore({
      sync,
      store: { getRevision: () => store.getRevision(), isReadOnly: () => store.isReadOnly(), replaceState: (next, reason, pre) => store.replaceState(next, reason, pre) },
      snapshots: t.adapter,
      ids: { now: () => NOW_ISO },
    });
    expect(await flow.restore(source.id)).toMatchObject({ ok: false, code: 'REJECTED', message: expect.stringContaining('nothing was restored') });
    await sync.settled();
    expect(store.getState()).toBe(before.state);
    expect(store.getRevision()).toBe(before.revision);
    expect((await t.adapter.listSnapshots()).map((s) => s.reason)).toEqual(['manual']);
    expect(started).toBe(2);
    expect(await sync.client.validateAll({ revision: before.revision })).toMatchObject({ ok: true, value: { ok: true } });
  }, THREAD_TEST_TIMEOUT_MS);
});
