/**
 * Step 4.2c: the import through the compute worker, in memory (real handlers behind an in-memory port pair that clones every
 * message; a real store, the real persistence adapter on fake IndexedDB, the real replica sync). The Phase 3 rows that touch
 * the import (INV-21, ADV-030, ADV-042, ADV-043, ADV-045 import part) run the SAME scenario in process and through the
 * worker and compare plans, results and final states; then the worker-specific rules: adoption instead of a second
 * whole-state transfer, every failure point changing nothing, STALE_REVISION, cancel, a crash losing the pending batch,
 * asset bytes transferred. The real-thread twin is compute-import-threads.test.ts.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { emptyRecordTables, type CanonicalState } from '@/core/schema';
import { createMigrationRunner } from '@/core/migrations';
import { restoreSnapshot } from '@/persistence/restore';
import { envelope, mustCommit } from '@/test-support/command-kit';
import {
  comparable,
  inProcessDriver,
  lastReplica,
  nameOf,
  planOf,
  renamed,
  workerDriver,
  workerImportRig,
  type ImportDriver,
  type WorkerImportRig,
} from '@/test-support/compute-import-kit';
import { exportBytes } from '@/test-support/import-kit';
import { legacyBytes } from '@/test-support/legacy-import-kit';
import { loadState } from '@/test-support/persistence-kit';
import { expectReplicaEqualsStore } from '@/test-support/replica-kit';
import { loadFixtureState } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const empty: CanonicalState = { meta: base.meta, records: emptyRecordTables() };
const speciesId = Object.keys(base.records.species).sort()[0] as string;
const jsonFile = (state: CanonicalState): Promise<Uint8Array> => exportBytes(state);

/** Runs `scenario` against both paths, from the same starting state, and returns what each produced. */
async function bothWays<T>(start: CanonicalState, scenario: (driver: ImportDriver) => Promise<T>): Promise<{ readonly worker: T; readonly inProcess: T; readonly workerState: CanonicalState; readonly inProcessState: CanonicalState; readonly rig: WorkerImportRig }> {
  const rig = await workerImportRig(start);
  const twin = inProcessDriver(start);
  const inProcess = await scenario(twin.driver);
  const worker = await scenario(workerDriver(rig));
  await rig.r.sync.settled();
  return { worker, inProcess, workerState: rig.store.getState(), inProcessState: twin.store.getState(), rig };
}


describe('ADV-042 through the worker: identical skip, keep, replace, import as copy give the in-process result', () => {
  it.each(['identical_skip', 'keep_current', 'replace', 'import_as_copy'] as const)('%s', async (resolution) => {
    const identical = resolution === 'identical_skip';
    const incoming = identical ? base : renamed(base, speciesId, 'A different name');
    const file = await jsonFile(incoming);
    const scenario = async (driver: ImportDriver) => {
      const first = planOf(await driver.preview(file, 'x.orn.json'));
      const plan = identical ? first : planOf(await driver.revise(first.preview.batchId, { resolutions: [{ id: speciesId, resolution }] }));
      const applied = await driver.apply(plan.preview.batchId, plan);
      return { plan, applied: comparable(applied) };
    };
    const { worker, inProcess, workerState, inProcessState, rig } = await bothWays(base, scenario);
    expect(worker.plan).toEqual(inProcess.plan);
    expect(worker.applied).toEqual(inProcess.applied);
    expect(worker.applied).toMatchObject({ ok: true });
    expect(workerState).toEqual(inProcessState);
    if (resolution === 'replace') expect(nameOf(workerState, speciesId)).toBe('A different name');
    if (resolution === 'keep_current') expect(nameOf(workerState, speciesId)).toBe(nameOf(base, speciesId));
    if (resolution === 'import_as_copy') {
      expect(worker.plan.copyIdMap.length).toBeGreaterThan(0);
      expect(nameOf(workerState, speciesId)).toBe(nameOf(base, speciesId));
      expect(nameOf(workerState, worker.plan.copyIdMap.find((m) => m.from === speciesId)?.to ?? '')).toBe('A different name');
    }
    expectReplicaEqualsStore(lastReplica(rig), rig.store, resolution);
  });
});

describe('ADV-030 through the worker: dangling references block confirmation until resolved', () => {
  it('confirm blocked, apply refused (BLOCKED) with nothing changed, excluding the offenders unblocks it; same as in process', async () => {
    const referenced = Object.values(base.records.reaction)
      .flatMap((r) => (r as unknown as { participants?: { speciesId?: string }[] }).participants ?? [])
      .map((p) => p.speciesId)
      .find((id): id is string => id !== undefined);
    const dangling = produce(base, (draft) => {
      const target = referenced ?? speciesId;
      Reflect.deleteProperty(draft.records.species, target);
    });
    const file = await jsonFile(dangling);
    const scenario = async (driver: ImportDriver) => {
      const plan = planOf(await driver.preview(file, 'dangling.orn.json'));
      const revisionBefore = driver.revision();
      const refused = await driver.apply(plan.preview.batchId, plan);
      const unchanged = driver.revision() === revisionBefore;
      let current = plan;
      for (let i = 0; i < 20 && !current.preview.canConfirm; i += 1) {
        const offenders = current.preview.findings.filter((f) => f.severity === 'error').map((f) => f.subject);
        current = planOf(await driver.revise(current.preview.batchId, { excluded: [...current.excluded, ...offenders] }));
      }
      const applied = await driver.apply(current.preview.batchId, current);
      return { blocked: plan.preview.canConfirm, refused, unchanged, excluded: current.excluded, applied: comparable(applied) };
    };
    const emptyStart = empty;
    const { worker, inProcess, workerState, inProcessState } = await bothWays(emptyStart, scenario);
    expect(worker.blocked).toBe(false);
    expect(worker.refused).toMatchObject({ ok: false, code: 'BLOCKED' });
    expect(worker.unchanged).toBe(true);
    expect(worker.excluded.length).toBeGreaterThan(0);
    expect(worker).toEqual(inProcess);
    expect(workerState).toEqual(inProcessState);
  });
});

describe('ADV-043 through the worker: the v6 and v4 legacy files go through the same session', () => {
  it.each(['v6-demo-export.json', 'v4-sample.json'] as const)('%s into an empty store: plan, review items and applied state equal the in-process ones', async (name) => {
    const bytes = legacyBytes(name);
    const scenario = async (driver: ImportDriver) => {
      const plan = planOf(await driver.preview(bytes, 'export.json'));
      const applied = await driver.apply(plan.preview.batchId, plan);
      return { plan, applied: comparable(applied) };
    };
    const { worker, inProcess, workerState, inProcessState, rig } = await bothWays(empty, scenario);
    expect(worker.plan.preview.legacyReport).toBeDefined();
    expect(worker.plan.preview.legacyReport?.notImported).toEqual([]);
    expect(worker.plan).toEqual(inProcess.plan);
    expect(worker.applied).toEqual(inProcess.applied);
    expect(workerState).toEqual(inProcessState);
    expectReplicaEqualsStore(lastReplica(rig), rig.store, name);
  });
});

describe('ADV-045 import part through the worker: history cleared, redo unavailable, the pre_import snapshot restores the prior state', () => {
  it('the snapshot bytes the worker built read back with readSnapshot and restore to the same state', async () => {
    const rig = await workerImportRig(base);
    mustCommit(rig.store.dispatch(envelope('edit', { type: 'meta.update', meta: { ...rig.store.getState().meta, title: 'Before import' } as never })));
    await rig.r.sync.settled();
    await rig.t.adapter.flush();
    const before = rig.store.getState();
    const revisionBefore = rig.store.getRevision();

    const driver = workerDriver(rig);
    const plan = planOf(await driver.preview(await jsonFile(renamed(base, speciesId, 'Imported')), 'x.orn.json'));
    const applied = await driver.apply(plan.preview.batchId, plan);
    if (!applied.ok) throw new Error(`${applied.code}: ${applied.message}`);
    await rig.t.adapter.flush();
    expect(rig.store.canUndo()).toBe(false);
    expect(rig.store.canRedo()).toBe(false);
    expect(rig.store.undo()).toBeNull();
    expect(rig.store.redo()).toBeNull();

    const listed = (await rig.t.adapter.listSnapshots()).find((s) => s.id === applied.snapshotId);
    expect(listed).toMatchObject({ reason: 'pre_import', revision: revisionBefore });
    const read = await rig.t.adapter.readSnapshot(applied.snapshotId);
    expect(read.ok).toBe(true);
    const restored = await restoreSnapshot({ id: applied.snapshotId, snapshots: rig.t.adapter, runner: createMigrationRunner(), store: rig.store });
    if (!restored.ok) throw new Error(restored.message);
    await rig.t.adapter.flush();
    expect(rig.store.getState().records).toEqual(before.records);
    expect(rig.store.getState().meta).toEqual(before.meta);
    expect(rig.store.canUndo()).toBe(false);
    expect((await loadState(rig.t.adapter)).state).toEqual(rig.store.getState());
  });
});

describe('adoption instead of a second whole-state transfer', () => {
  it('after an import the replica equals the store (state, revision, findings) with ONE loadReplica and no applyChanges for the import', async () => {
    const rig = await workerImportRig(base);
    const driver = workerDriver(rig);
    const plan = planOf(await driver.preview(await jsonFile(renamed(base, speciesId, 'Imported')), 'x.orn.json'));
    const revised = planOf(await driver.revise(plan.preview.batchId, { resolutions: [{ id: speciesId, resolution: 'replace' }] }));
    const applied = await driver.apply(revised.preview.batchId, revised);
    expect(applied.ok).toBe(true);
    const settled = await rig.r.sync.settled();
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: rig.store.getRevision(), reloads: 1 });
    const methods = rig.r.calls.map((c) => c.method);
    expect(methods.filter((m) => m === 'loadReplica')).toHaveLength(1);
    expect(methods.filter((m) => m === 'applyChanges')).toEqual([]);
    expect(methods).toContain('adoptPending');
    expect(methods).not.toContain('dropPending');
    const replica = lastReplica(rig);
    expect(replica.pendingRevision()).toBeUndefined();
    expectReplicaEqualsStore(replica, rig.store, 'after adoptPending');
    // The replica goes on following ordinary commits.
    mustCommit(rig.store.dispatch(envelope('edit', { type: 'meta.update', meta: { ...rig.store.getState().meta, title: 'After' } as never })));
    await rig.r.sync.settled();
    expectReplicaEqualsStore(replica, rig.store, 'after a later commit');
  });

  it('a refused adoption (no pending state) makes the sync reload, and the replica still equals the store', async () => {
    const rig = await workerImportRig(base);
    rig.r.sync.expectAdoption(rig.store.getRevision() + 1);
    mustCommit(rig.store.replaceState(renamed(base, speciesId, 'Replaced without a prepare'), 'import'));
    const settled = await rig.r.sync.settled();
    expect(settled).toMatchObject({ state: 'in_sync', reloads: 2 });
    expect(rig.r.calls.map((c) => c.method)).toContain('adoptPending');
    expectReplicaEqualsStore(lastReplica(rig), rig.store, 'after the refusal');
  });

  it('adoptPending refuses as values: nothing pending, and another revision', async () => {
    const rig = await workerImportRig(base);
    const client = rig.r.sync.client;
    expect(await client.adoptPending({ revision: 2 })).toMatchObject({ ok: true, value: { ok: false, code: 'NO_PENDING' } });
    const driver = workerDriver(rig);
    const plan = planOf(await driver.preview(await jsonFile(renamed(base, speciesId, 'x')), 'x.orn.json'));
    const prepared = await client.importPrepareApply({ batchId: plan.preview.batchId, plan, baseRevision: rig.store.getRevision() });
    expect(prepared).toMatchObject({ ok: true, value: { ok: true } });
    expect(await client.adoptPending({ revision: 9 })).toMatchObject({ ok: true, value: { ok: false, code: 'PENDING_REVISION' } });
    expect(lastReplica(rig).pendingRevision()).toBe(rig.store.getRevision() + 1);
    expect(await client.dropPending({})).toEqual({ ok: true, value: { dropped: true } });
    expect(lastReplica(rig).pendingRevision()).toBeUndefined();
    expectReplicaEqualsStore(lastReplica(rig), rig.store, 'after dropPending');
  });
});
