/**
 * Step 4.2d: snapshot restore through the compute worker, in memory (real handlers behind an in-memory port pair that clones every
 * message; a real store on the real adapter over fake IndexedDB; the real replica sync). ADV-045 (snapshot restore and migration
 * parts) runs the SAME scenario through the Phase 3 in-process `restoreSnapshot` and through the worker and compares results,
 * state, revision, cleared history, findings and the stored snapshots; then the worker-specific rules: adoption instead of a
 * second whole-state transfer, the pre_restore retry, structuredClone of every result. Failure points are in
 * compute-restore-failures.test.ts; a real thread is in compute-restore-threads.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { MigrationRunner } from '@/core/migrations/contracts';
import { createMigrationRunner } from '@/core/migrations';
import { docOf, putDoc, restoreRig, snapshotFacts, twinRestore } from '@/test-support/compute-restore-kit';
import { lastReplica } from '@/test-support/compute-import-kit';
import { loadState } from '@/test-support/persistence-kit';
import { expectReplicaEqualsStore, sortedFindings } from '@/test-support/replica-kit';
import { loadFixtureState } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');

/** The result without what legitimately differs between the two paths (the pre_restore snapshot's clock-made fields). */
const comparable = (result: unknown): unknown => {
  const r = result as { ok: boolean; preRestore?: { id: string; reason: string; revision: number; schemaVersion: number; note?: string } } & Record<string, unknown>;
  if (!r.ok || r.preRestore === undefined) return r;
  const { id, reason, revision, schemaVersion, note } = r.preRestore;
  return { ...r, preRestore: { id, reason, revision, schemaVersion, note } };
};

describe('ADV-045 through the worker: restore returns the prior state, clears history, persists (snapshot-restore part)', () => {
  it('equals the in-process restore: result, state, revision, cleared history, findings, stored snapshots, persisted state', async () => {
    const rig = await restoreRig(base);
    const twin = await twinRestore(base);
    const scenario = async (edit: () => void, store: typeof rig.store, t: typeof rig.t, restore: (id: string) => Promise<unknown>) => {
      edit();
      const snapshot = await t.adapter.createSnapshot('manual', store.getState(), store.getRevision());
      edit();
      edit();
      store.undo();
      expect(store.canUndo() && store.canRedo()).toBe(true);
      const result = await restore(snapshot.id);
      await t.adapter.flush();
      return { snapshot, result };
    };
    const inProcess = await scenario(twin.edit, twin.store, twin.t, twin.restore);
    const worker = await scenario(rig.edit, rig.store, rig.t, (id) => rig.flow.restore(id));
    await rig.r.sync.settled();

    expect(worker.result).toMatchObject({ ok: true, migrationSteps: [], preRestore: { reason: 'pre_restore' } });
    expect(comparable(worker.result)).toEqual(comparable(inProcess.result));
    expect(rig.store.getState()).toEqual(twin.store.getState());
    expect(rig.store.getRevision()).toBe(twin.store.getRevision());
    expect(rig.store.canUndo()).toBe(false);
    expect(rig.store.canRedo()).toBe(false);
    expect(rig.store.historyLabels()).toEqual(twin.store.historyLabels());
    expect(sortedFindings(rig.store.findings.all())).toEqual(sortedFindings(twin.store.findings.all()));
    expect(await snapshotFacts(rig.t)).toEqual(await snapshotFacts(twin.t));
    expect((await loadState(rig.t.adapter)).state).toEqual((await loadState(twin.t.adapter)).state);
    expect((await loadState(rig.t.adapter)).revision).toBe(rig.store.getRevision());
    expectReplicaEqualsStore(lastReplica(rig), rig.store, 'after the restore');
  });

  it('the pre_restore snapshot holds what was live: restoring it undoes the restore', async () => {
    const rig = await restoreRig(base);
    rig.edit();
    const source = await rig.t.adapter.createSnapshot('manual', rig.store.getState(), rig.store.getRevision());
    rig.edit();
    const live = rig.store.getState();
    const restored = await rig.flow.restore(source.id);
    if (!restored.ok) throw new Error(restored.message);
    expect(restored.preRestore).toMatchObject({ reason: 'pre_restore', revision: 3 });
    const undone = await rig.flow.restore(restored.preRestore.id);
    expect(undone.ok).toBe(true);
    expect(rig.store.getState()).toEqual(live);
    await rig.r.sync.settled();
    expectReplicaEqualsStore(lastReplica(rig), rig.store, 'after undoing the restore');
  });

  it('adoption: ONE loadReplica, no applyChanges for the restore, adoptPending once, replica == store, and it goes on following commits', async () => {
    const rig = await restoreRig(base);
    rig.edit();
    const source = await rig.t.adapter.createSnapshot('manual', rig.store.getState(), rig.store.getRevision());
    rig.edit();
    await rig.r.sync.settled();
    rig.r.calls.length = 0;
    const result = await rig.flow.restore(source.id);
    expect(result.ok).toBe(true);
    const settled = await rig.r.sync.settled();
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: rig.store.getRevision(), reloads: 1 });
    const methods = rig.r.calls.map((c) => c.method);
    expect(methods.filter((m) => m === 'snapshotDecode')).toHaveLength(1);
    expect(methods.filter((m) => m === 'snapshotBuild')).toHaveLength(1);
    expect(methods.filter((m) => m === 'adoptPending')).toHaveLength(1);
    expect(methods).not.toContain('loadReplica');
    expect(methods).not.toContain('applyChanges');
    expect(methods).not.toContain('dropPending');
    const replica = lastReplica(rig);
    expect(replica.pendingRevision()).toBeUndefined();
    expectReplicaEqualsStore(replica, rig.store, 'after adoptPending');
    rig.edit();
    await rig.r.sync.settled();
    expectReplicaEqualsStore(replica, rig.store, 'after a later commit');
  });

  it('every worker parameter and answer of a restore passes structuredClone (the in-memory port clones every message)', async () => {
    const rig = await restoreRig(base);
    const source = await rig.t.adapter.createSnapshot('manual', rig.store.getState(), rig.store.getRevision());
    const read = await rig.t.adapter.readSnapshotBytes(source.id);
    if (!read.ok) throw new Error(read.message);
    const params = { bytes: read.bytes, id: source.id, schemaVersion: read.summary.schemaVersion, baseRevision: rig.store.getRevision() };
    expect(structuredClone(params)).toEqual(params);
    const answer = await rig.r.sync.client.snapshotDecode(params);
    if (!answer.ok || !answer.value.ok) throw new Error('decode failed');
    expect(structuredClone(answer.value)).toEqual(answer.value);
    await rig.r.sync.client.dropPending({});
  });
});

describe('ADV-045 migration part through the worker: an older snapshot is migrated by the injected runner and its steps are reported', () => {
  const steps = [{ from: 0, to: 1, description: 'name → title', changedRecordIds: [], notes: [] }];
  const runnerFor = (seen: unknown[]): MigrationRunner => ({
    target: 1,
    run(doc) {
      seen.push(doc['meta']);
      const { name, ...others } = doc['meta'] as Record<string, unknown>;
      return { ok: true, doc: { ...doc, meta: { ...others, title: name } }, steps };
    },
  });

  it('gives the in-process result, state and steps', async () => {
    const seenWorker: unknown[] = [];
    const seenTwin: unknown[] = [];
    const rig = await restoreRig(base, { rig: { runner: runnerFor(seenWorker) } });
    const twin = await twinRestore(base, runnerFor(seenTwin));
    const run = async (edit: () => void, t: typeof rig.t, store: typeof rig.store, restore: (id: string) => Promise<unknown>) => {
      edit();
      const source = await t.adapter.createSnapshot('manual', store.getState(), store.getRevision());
      const atSnapshot = store.getState();
      const old = await docOf(t, source);
      const { title, ...rest } = old.meta;
      await putDoc(t, 'snp_old', { ...old, meta: { ...rest, name: title } });
      edit();
      return { result: await restore('snp_old'), atSnapshot };
    };
    const inProcess = await run(twin.edit, twin.t, twin.store, twin.restore);
    const worker = await run(rig.edit, rig.t, rig.store, (id) => rig.flow.restore(id));
    expect(worker.result).toMatchObject({ ok: true, migrationSteps: steps });
    expect(comparable(worker.result)).toEqual(comparable(inProcess.result));
    expect(seenWorker).toHaveLength(1);
    expect(seenWorker[0]).toHaveProperty('name');
    expect(rig.store.getState()).toEqual(worker.atSnapshot);
    expect(rig.store.getState()).toEqual(twin.store.getState());
    await rig.r.sync.settled();
    expectReplicaEqualsStore(lastReplica(rig), rig.store, 'after a migrated restore');
  });

  it('the real runner refuses a newer schema version with the same value, and nothing changes', async () => {
    const rig = await restoreRig(base, { rig: { runner: createMigrationRunner() } });
    const twin = await twinRestore(base, createMigrationRunner());
    const put = async (t: typeof rig.t) => {
      const source = await t.adapter.createSnapshot('manual', base, 1);
      await putDoc(t, 'snp_new', { ...(await docOf(t, source)), schemaVersion: 2 }, 2);
    };
    await put(rig.t);
    await put(twin.t);
    const worker = await rig.flow.restore('snp_new');
    const inProcess = await twin.restore('snp_new');
    expect(worker).toMatchObject({ ok: false, code: 'MIGRATION_FAILED', migration: { code: 'NEWER_VERSION', atVersion: 2 } });
    expect(worker).toEqual(inProcess);
    expect(rig.store.getState()).toBe(base);
  });
});

describe('the pre_restore snapshot is taken again when the live data changes while it is written', () => {
  function racing(rig: Awaited<ReturnType<typeof restoreRig>>, changes: number): void {
    let left = changes;
    rig.hooks.storeBytes = async (input) => {
      const stored = await rig.t.adapter.storeSnapshotBytes(input);
      if (left > 0) {
        left -= 1;
        rig.edit();
      }
      return stored;
    };
  }

  it('one change: the snapshot and the decode are redone, the stored pre_restore is the one for the live revision', async () => {
    const rig = await restoreRig(base);
    const source = await rig.t.adapter.createSnapshot('manual', rig.store.getState(), rig.store.getRevision());
    racing(rig, 1);
    const result = await rig.flow.restore(source.id);
    if (!result.ok) throw new Error(result.message);
    const kept = (await rig.t.adapter.listSnapshots()).filter((s) => s.reason === 'pre_restore');
    expect(kept.map((s) => s.id)).toEqual([result.preRestore.id]);
    expect(result.preRestore.revision).toBe(rig.store.getRevision() - 1);
    await rig.r.sync.settled();
    expectReplicaEqualsStore(lastReplica(rig), rig.store, 'after the retry');
  });

  it('three changes: gives up after three attempts and restores nothing (the replica included)', async () => {
    const rig = await restoreRig(base);
    const source = await rig.t.adapter.createSnapshot('manual', rig.store.getState(), rig.store.getRevision());
    const revision = rig.store.getRevision();
    racing(rig, 3);
    const result = await rig.flow.restore(source.id);
    expect(result).toMatchObject({ ok: false, code: 'SNAPSHOT_FAILED', message: expect.stringContaining('kept changing') });
    expect(rig.store.getRevision()).toBe(revision + 3);
    expect((await rig.t.adapter.listSnapshots()).map((s) => s.reason)).toEqual(['manual']);
    await rig.r.sync.settled();
    const replica = lastReplica(rig);
    expect(replica.pendingRevision()).toBeUndefined();
    expectReplicaEqualsStore(replica, rig.store, 'after giving up');
  });
});
