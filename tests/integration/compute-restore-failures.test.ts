/**
 * Step 4.2d: every way a restore through the compute worker can fail changes nothing (INV-21, ADV-045): the live state (same
 * reference), revision, history, stored snapshots, the persisted state, and the replica (no pending state, equal to the store).
 * The failures that the Phase 3 restore already has are compared with the in-process restore (same code, same message); the
 * worker-specific ones (the store refuses the findings, a throw, a crash of the worker, a cancelled sync) are checked directly.
 */
import { CURRENT_SCHEMA_VERSION } from '@/core/schema';
import { strToU8, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { StoreHandle } from '@/core/commands';
import type { MigrationRunner } from '@/core/migrations/contracts';
import { createMigrationRunner } from '@/core/migrations';
import type { CanonicalState } from '@/core/schema';
import { buildSnapshot } from '@/persistence/snapshot-codec';
import { exportBytes } from '@/test-support/import-kit';
import { lastReplica, renamed } from '@/test-support/compute-import-kit';
import { docOf, firstSpeciesId, IDENTITY, putDoc, putRow, restoreRig, twinRestore, withDanglingClass, type RestoreRig } from '@/test-support/compute-restore-kit';
import { loadState } from '@/test-support/persistence-kit';
import { expectReplicaEqualsStore } from '@/test-support/replica-kit';
import { loadFixtureState } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');

interface Untouched {
  readonly state: CanonicalState;
  readonly revision: number;
  readonly labels: ReturnType<StoreHandle['historyLabels']>;
  readonly snapshotIds: readonly string[];
}
async function capture(rig: RestoreRig): Promise<Untouched> {
  return { state: rig.store.getState(), revision: rig.store.getRevision(), labels: rig.store.historyLabels(), snapshotIds: (await rig.t.adapter.listSnapshots()).map((s) => s.id) };
}
async function expectUntouched(rig: RestoreRig, before: Untouched, label: string): Promise<void> {
  await rig.r.sync.settled();
  await rig.t.adapter.flush();
  expect(rig.store.getState(), `${label}: state`).toBe(before.state);
  expect(rig.store.getRevision(), `${label}: revision`).toBe(before.revision);
  expect(rig.store.historyLabels(), `${label}: history`).toEqual(before.labels);
  expect((await rig.t.adapter.listSnapshots()).map((s) => s.id), `${label}: stored snapshots`).toEqual(before.snapshotIds);
  const stored = await loadState(rig.t.adapter);
  expect(stored.state, `${label}: persisted state`).toEqual(before.state);
  expect(stored.revision, `${label}: persisted revision`).toBe(before.revision);
  const replica = lastReplica(rig);
  expect(replica.pendingRevision(), `${label}: pending state`).toBeUndefined();
  expectReplicaEqualsStore(replica, rig.store, label);
}

/** Puts the same damaged snapshot into both twins, restores it both ways: the values are equal and nothing changed. */
async function sameRefusal(prepare: (t: RestoreRig['t']) => Promise<string>, runner: MigrationRunner = IDENTITY): Promise<{ readonly worker: unknown; readonly rig: RestoreRig; readonly before: Untouched }> {
  const rig = await restoreRig(base, { rig: { runner } });
  const twin = await twinRestore(base, runner);
  rig.edit();
  twin.edit();
  const id = await prepare(rig.t);
  expect(await prepare(twin.t)).toBe(id);
  const before = await capture(rig);
  const worker = await rig.flow.restore(id);
  expect(worker).toEqual(await twin.restore(id));
  return { worker, rig, before };
}

describe('restore through the worker: the Phase 3 refusals, same code and message, nothing changed', () => {
  it('an unknown snapshot (NOT_FOUND)', async () => {
    const { worker, rig, before } = await sameRefusal(async () => 'snp_nothing');
    expect(worker).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    await expectUntouched(rig, before, 'NOT_FOUND');
  });

  it('bytes that are not a snapshot (CORRUPT, decided in the worker)', async () => {
    const { worker, rig, before } = await sameRefusal(async (t) => (await putRow(t, 'snp_bad', new Uint8Array(64).fill(3)), 'snp_bad'));
    expect(worker).toMatchObject({ ok: false, code: 'CORRUPT', message: expect.stringContaining('snp_bad') });
    await expectUntouched(rig, before, 'CORRUPT bytes');
  });

  it('valid zlib that is not JSON, JSON that is not a dataset, and a document whose version differs from its summary (CORRUPT)', async () => {
    const { worker, rig, before } = await sameRefusal(async (t) => {
      await putRow(t, 'snp_text', zlibSync(strToU8('this is not json')));
      return 'snp_text';
    });
    expect(worker).toMatchObject({ ok: false, code: 'CORRUPT' });
    await expectUntouched(rig, before, 'not JSON');
    for (const [id, doc, version] of [['snp_shape', { format: 'other' }, CURRENT_SCHEMA_VERSION], ['snp_version', { format: 'orn.dataset', schemaVersion: CURRENT_SCHEMA_VERSION, records: {} }, CURRENT_SCHEMA_VERSION - 1]] as const) {
      const r = await sameRefusal(async (t) => (await putDoc(t, id, doc, version), id));
      expect(r.worker).toMatchObject({ ok: false, code: 'CORRUPT' });
      await expectUntouched(r.rig, r.before, id);
    }
  });

  it('a size that does not match what was written (CORRUPT, decided on main before the worker is asked)', async () => {
    const { worker, rig, before } = await sameRefusal(async (t) => {
      const source = await t.adapter.createSnapshot('manual', base, 1);
      const row = await t.db.snapshots.get(source.id);
      if (row === undefined) throw new Error('setup');
      await t.db.snapshots.put({ ...row, id: 'snp_size', byteSize: row.byteSize + 5 });
      return 'snp_size';
    });
    expect(worker).toMatchObject({ ok: false, code: 'CORRUPT' });
    expect(rig.r.calls.map((c) => c.method)).not.toContain('snapshotDecode');
    await expectUntouched(rig, before, 'size mismatch');
  });

  it('a migration that fails (the runner’s error is carried along)', async () => {
    const failing: MigrationRunner = { target: 1, run: () => ({ ok: false, code: 'STEP_FAILED', message: 'step 0→1 exploded', atVersion: 0 }) };
    const { worker, rig, before } = await sameRefusal(async (t) => (await t.adapter.createSnapshot('manual', base, 1)).id, failing);
    expect(worker).toMatchObject({ ok: false, code: 'MIGRATION_FAILED', message: 'step 0→1 exploded', migration: { code: 'STEP_FAILED' } });
    await expectUntouched(rig, before, 'MIGRATION_FAILED');
  });

  it('an invalid snapshot: a record that fails L1 (issues listed, bounded) and repeated record IDs (INVALID)', async () => {
    const l1 = await sameRefusal(async (t) => {
      const source = await t.adapter.createSnapshot('manual', base, 1);
      const doc = await docOf(t, source);
      for (const row of doc.records['species'] as { id: string }[]) row.id = 'not-an-id'; // more than 20 issues: the cap is the same
      await putDoc(t, 'snp_l1', doc);
      return 'snp_l1';
    });
    expect(l1.worker).toMatchObject({ ok: false, code: 'INVALID' });
    expect((l1.worker as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
    expect((l1.worker as { issues: unknown[] }).issues.length).toBeLessThanOrEqual(20);
    await expectUntouched(l1.rig, l1.before, 'INVALID L1');
    const dup = await sameRefusal(async (t) => {
      const source = await t.adapter.createSnapshot('manual', base, 1);
      const doc = await docOf(t, source);
      (doc.records['species'] as unknown[]).push(structuredClone((doc.records['species'] as unknown[])[0]));
      await putDoc(t, 'snp_dup', doc);
      return 'snp_dup';
    });
    expect(dup.worker).toMatchObject({ ok: false, code: 'INVALID', issues: [{ path: 'records.species', message: expect.stringContaining('duplicate ID') }] });
    await expectUntouched(dup.rig, dup.before, 'INVALID duplicates');
  });

  it('a newer schema version, through the real runner (MIGRATION_FAILED NEWER_VERSION)', async () => {
    const { worker, rig, before } = await sameRefusal(async (t) => {
      const source = await t.adapter.createSnapshot('manual', base, 1);
      await putDoc(t, 'snp_new', { ...(await docOf(t, source)), schemaVersion: CURRENT_SCHEMA_VERSION + 1 }, CURRENT_SCHEMA_VERSION + 1);
      return 'snp_new';
    }, createMigrationRunner());
    expect(worker).toMatchObject({ ok: false, code: 'MIGRATION_FAILED', migration: { code: 'NEWER_VERSION', atVersion: CURRENT_SCHEMA_VERSION + 1 } });
    await expectUntouched(rig, before, 'NEWER_VERSION');
  });

  it('a snapshot the store refuses (a dangling reference, L2): the pre_restore snapshot made for it is removed again, the pending state dropped', async () => {
    const rig = await restoreRig(base);
    rig.edit();
    const built = buildSnapshot({ id: 'snp_dangling', createdAt: '2026-09-28T09:00:00.000Z', reason: 'manual', state: withDanglingClass(base), revision: 1, generator: { app: 't', version: '0' } });
    if (!built.ok) throw new Error('setup');
    await putRow(rig.t, 'snp_dangling', built.built.bytes);
    const before = await capture(rig);
    const result = await rig.flow.restore('snp_dangling');
    expect(result).toMatchObject({ ok: false, code: 'REJECTED', error: { code: 'VALIDATION_FAILED' } });
    expect(rig.calls).toContain('deleteSnapshot');
    expect(rig.r.calls.map((c) => c.method)).toContain('dropPending');
    await expectUntouched(rig, before, 'store refuses');
    // The dataset stays usable: an ordinary commit still reaches the replica.
    rig.edit();
    await rig.r.sync.settled();
    expectReplicaEqualsStore(lastReplica(rig), rig.store, 'commit after the refusal');
  });

  it('a read-only tab (READ_ONLY), before anything is read', async () => {
    const rig = await restoreRig(base);
    const source = await rig.t.adapter.createSnapshot('manual', base, 1);
    const before = await capture(rig);
    rig.hooks.readOnly = true;
    expect(await rig.flow.restore(source.id)).toMatchObject({ ok: false, code: 'READ_ONLY' });
    expect(rig.calls).toEqual([]);
    await expectUntouched(rig, before, 'READ_ONLY');
  });
});

describe('restore through the worker: failure points that only the worker path has', () => {
  const arms: readonly (readonly [string, string, (rig: RestoreRig) => void])[] = [
    ['the pre_restore snapshot cannot be stored', 'SNAPSHOT_FAILED', (rig) => void (rig.hooks.storeBytes = () => Promise.reject(new Error('quota')))],
    ['the adapter finds the bytes damaged', 'SNAPSHOT_FAILED', (rig) => void (rig.hooks.storeBytes = async () => ({ ok: false, code: 'BAD_BYTES', message: 'not zlib' }))],
    [
      'the store refuses the findings',
      'REJECTED',
      (rig) => void (rig.hooks.replaceState = (next, reason, pre) => rig.store.replaceState(next, reason, pre === undefined ? pre : { ...pre, ruleSet: 'another-rule-set' })),
    ],
    [
      'replaceState throws',
      'REJECTED',
      (rig) =>
        void (rig.hooks.replaceState = () => {
          throw new Error('boom');
        }),
    ],
  ];
  it.each(arms)('%s -> %s: nothing changes, the pre_restore snapshot is gone, the pending state is dropped', async (label, code, arm) => {
    const rig = await restoreRig(base);
    rig.edit();
    const source = await rig.t.adapter.createSnapshot('manual', rig.store.getState(), rig.store.getRevision());
    rig.edit();
    const before = await capture(rig);
    arm(rig);
    const result = await rig.flow.restore(source.id);
    expect(result).toMatchObject({ ok: false, code });
    await expectUntouched(rig, before, label);
    expect(rig.r.calls.map((c) => c.method)).toContain('dropPending');
    rig.edit();
    await rig.r.sync.settled();
    expectReplicaEqualsStore(lastReplica(rig), rig.store, `${label}: later commit`);
  });

  it('a snapshot stale by a commit while it was written is retried (see compute-restore.test.ts); the adapter answering STALE_REVISION every time gives up after three attempts', async () => {
    const rig = await restoreRig(base);
    const source = await rig.t.adapter.createSnapshot('manual', base, 1);
    const before = await capture(rig);
    rig.hooks.storeBytes = async () => ({ ok: false, code: 'STALE_REVISION', message: 'stale' });
    expect(await rig.flow.restore(source.id)).toMatchObject({ ok: false, code: 'SNAPSHOT_FAILED', message: expect.stringContaining('kept changing') });
    expect(rig.calls.filter((c) => c === 'storeBytes')).toHaveLength(3);
    await expectUntouched(rig, before, 'stale three times');
  });

  it('a snapshotBuild that the replica refuses (REPLICA_STALE) is settled and retried; one that cannot serialise is SNAPSHOT_FAILED', async () => {
    const stale = await restoreRig(base, {
      rig: { wrap: (_, api) => ({ ...api, snapshotBuild: async () => ({ ok: false, code: 'SERIALIZE_FAILED', message: 'no' }) }) },
    });
    const source = await stale.t.adapter.createSnapshot('manual', base, 1);
    const before = await capture(stale);
    expect(await stale.flow.restore(source.id)).toMatchObject({ ok: false, code: 'SNAPSHOT_FAILED', message: expect.stringContaining('no') });
    await expectUntouched(stale, before, 'SERIALIZE_FAILED');
  });

  it('a crash of the worker while it decodes: REJECTED with the reason, nothing changed, the restarted worker holds a reloaded replica', async () => {
    const rig = await restoreRig(base, {
      rig: {
        wrap: (index, api, worker) => ({
          ...api,
          snapshotDecode: async (params, ctx) => {
            if (index === 0) worker.crash('exit');
            return api.snapshotDecode(params, ctx);
          },
        }),
      },
    });
    const source = await rig.t.adapter.createSnapshot('manual', base, 1);
    const before = await capture(rig);
    const result = await rig.flow.restore(source.id);
    expect(result).toMatchObject({ ok: false, code: 'REJECTED', message: expect.stringContaining('nothing was restored') });
    await expectUntouched(rig, before, 'crash while decoding');
    expect(rig.r.workers.length).toBe(2);
  });

  it('a sync that is down: REJECTED, nothing changed', async () => {
    const rig = await restoreRig(base);
    const source = await rig.t.adapter.createSnapshot('manual', base, 1);
    const before = await capture(rig);
    rig.r.sync.stop();
    const result = await rig.flow.restore(source.id);
    expect(result).toMatchObject({ ok: false, code: 'REJECTED' });
    expect(rig.store.getState()).toBe(before.state);
    expect(rig.store.getRevision()).toBe(before.revision);
    expect((await rig.t.adapter.listSnapshots()).map((s) => s.id)).toEqual(before.snapshotIds);
  });

  it('one pending slot: a prepared import refuses the decode, a decoded snapshot refuses the import (BUSY), and neither is disturbed', async () => {
    const rig = await restoreRig(base);
    const client = rig.r.sync.client;
    const source = await rig.t.adapter.createSnapshot('manual', base, 1);
    const read = await rig.t.adapter.readSnapshotBytes(source.id);
    if (!read.ok) throw new Error(read.message);
    const decodeParams = { bytes: read.bytes, id: source.id, schemaVersion: read.summary.schemaVersion, baseRevision: rig.store.getRevision() };
    const ids = { nowIso: '2026-09-30T12:00:00.000Z', seed: 5 };
    const file = new Blob([(await exportBytes(renamed(base, firstSpeciesId(base), 'Imported'))) as BlobPart]);

    const preview = await client.importPreview({ source: file, fileName: 'x.orn.json', ids });
    if (!preview.ok || !preview.value.ok) throw new Error('preview failed');
    const plan = preview.value.plan;
    const prepared = await client.importPrepareApply({ batchId: plan.preview.batchId, plan, baseRevision: rig.store.getRevision() });
    expect(prepared).toMatchObject({ ok: true, value: { ok: true } });
    expect(await client.snapshotDecode(decodeParams)).toMatchObject({ ok: true, value: { ok: false, code: 'BUSY' } });
    expect(lastReplica(rig).pendingRevision()).toBe(rig.store.getRevision() + 1);
    await client.dropPending({});

    // The other way round: the decode holds the slot.
    expect(await client.snapshotDecode(decodeParams)).toMatchObject({ ok: true, value: { ok: true } });
    const preview2 = await client.importPreview({ source: file, fileName: 'x.orn.json', ids: { ...ids, seed: 6 } });
    if (!preview2.ok || !preview2.value.ok) throw new Error('preview failed');
    const plan2 = preview2.value.plan;
    expect(await client.importPrepareApply({ batchId: plan2.preview.batchId, plan: plan2, baseRevision: rig.store.getRevision() })).toMatchObject({ ok: true, value: { ok: false, code: 'BUSY' } });
    expect(lastReplica(rig).pendingRevision()).toBe(rig.store.getRevision() + 1);
    await client.dropPending({});
    expect(lastReplica(rig).pendingRevision()).toBeUndefined();
    expectReplicaEqualsStore(lastReplica(rig), rig.store, 'after BUSY');
  });

  it('the flow maps a BUSY answer to REJECTED with the reason', async () => {
    const rig = await restoreRig(base, { rig: { wrap: (_, api) => ({ ...api, snapshotDecode: async () => ({ ok: false, code: 'BUSY', message: 'an import is prepared' }) }) } });
    const id = (await rig.t.adapter.createSnapshot('manual', base, 1)).id;
    const before = await capture(rig);
    expect(await rig.flow.restore(id)).toMatchObject({ ok: false, code: 'REJECTED', message: expect.stringContaining('an import is prepared') });
    await expectUntouched(rig, before, 'BUSY');
  });
});
