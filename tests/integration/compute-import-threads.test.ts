/**
 * Step 4.2c over a REAL `worker_threads` thread running the real compute entry (`startComputeHost`) under tsx: a small import
 * end to end (Blob in, plan out, prepare, snapshot bytes back as a transferred buffer, stored by the real adapter, ONE
 * replaceState with the worker's findings, the replica adopting its pending state), and an induced crash of the thread
 * between preview and apply. The in-memory twin is compute-import.test.ts.
 */
import { produce } from 'immer';
import { afterEach, describe, expect, it } from 'vitest';
import { mustCommit, envelope } from '@/test-support/command-kit';
import { importFlowFor, persistedStore, planOf, workerDriver } from '@/test-support/compute-import-kit';
import { exportBytes } from '@/test-support/import-kit';
import { sortedFindings } from '@/test-support/replica-kit';
import { spawnComputeWorker } from '@/test-support/rpc-node-port';
import { loadFixtureState } from '@/test-support/state-fixture';
import { createReplicaSync, type ReplicaSync } from '@/workers/compute/sync';
import type { WorkerEvent } from '@/workers/rpc/contracts';

const base = loadFixtureState('maximal-valid');
const speciesId = Object.keys(base.records.species).sort()[0] as string;
const incoming = produce(base, (draft) => {
  (draft.records.species[speciesId] as unknown as { names: { canonical: string } }).names.canonical = 'Imported in a thread';
});

const running: ReplicaSync[] = [];
afterEach(() => {
  for (const sync of running.splice(0)) sync.stop();
});

async function threadRig(crashOn: readonly (string | undefined)[] = []) {
  const persisted = await persistedStore(base);
  const events: WorkerEvent[] = [];
  let started = 0;
  const sync = createReplicaSync({ store: persisted.store, factory: () => spawnComputeWorker(crashOn[started++]), onEvent: (e) => events.push(e) });
  running.push(sync);
  await sync.settled();
  const flow = importFlowFor(persisted.store, persisted.t, sync, persisted.stage);
  return { ...persisted, ...flow, sync, events, threads: () => started };
}

describe('the import in a real thread', () => {
  it('a small import end to end: the thread previews from a Blob, prepares, builds the snapshot bytes; main stores them and replaces the state once; the thread adopts', async () => {
    const rig = await threadRig();
    const driver = workerDriver(rig);
    const first = planOf(await driver.preview(await exportBytes(incoming), 'x.orn.json'));
    const plan = planOf(await driver.revise(first.preview.batchId, { resolutions: [{ id: speciesId, resolution: 'replace' }] }));
    const applied = await driver.apply(plan.preview.batchId, plan);
    if (!applied.ok) throw new Error(`${applied.code}: ${applied.message}`);
    const settled = await rig.sync.settled();
    await rig.t.adapter.flush();

    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: 2, storeRevision: 2, reloads: 1 });
    expect((rig.store.getState().records.species[speciesId] as unknown as { names: { canonical: string } }).names.canonical).toBe('Imported in a thread');
    expect(rig.calls).toEqual(['storeBytes', 'replaceState', 'clear']);
    // The bytes the thread built are what the adapter holds, readable and of the pre-import revision.
    const stored = (await rig.t.adapter.listSnapshots()).find((s) => s.id === applied.snapshotId);
    expect(stored).toMatchObject({ reason: 'pre_import', revision: 1 });
    const read = await rig.t.adapter.readSnapshot(applied.snapshotId);
    expect(read.ok).toBe(true);
    // The thread's replica (adopted, never sent the state twice) answers the store's findings.
    const answer = await rig.sync.client.validateAll({ revision: 2 });
    if (!answer.ok || !answer.value.ok) throw new Error('validateAll failed');
    expect(sortedFindings(answer.value.findings)).toEqual(sortedFindings(rig.store.findings.all()));
    // And it goes on following ordinary commits.
    mustCommit(rig.store.dispatch(envelope('edit', { type: 'meta.update', meta: { ...rig.store.getState().meta, title: 'After the import' } as never })));
    expect(await rig.sync.settled()).toMatchObject({ state: 'in_sync', replicaRevision: 3, reloads: 1 });
    expect(rig.threads()).toBe(1);
  });

  it('the thread exits when the prepare request arrives: UNKNOWN_BATCH, nothing changed, a new thread holds the reloaded replica', async () => {
    // Thread 0 dies on the prepare request.
    const dying = await threadRig(['importPrepareApply']);
    const driver = workerDriver(dying);
    const plan = planOf(await driver.preview(await exportBytes(incoming), 'x.orn.json'));
    const before = { state: dying.store.getState(), revision: dying.store.getRevision() };
    expect(await dying.flow.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    await dying.sync.settled();
    expect(dying.store.getState()).toBe(before.state);
    expect(dying.store.getRevision()).toBe(before.revision);
    expect(await dying.t.adapter.listSnapshots()).toEqual([]);
    expect(dying.threads()).toBe(2);
    const answer = await dying.sync.client.validateAll({ revision: before.revision });
    expect(answer).toMatchObject({ ok: true, value: { ok: true } });
  });
});
