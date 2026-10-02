/**
 * Step 4.2c, the worker-specific failure rules of the import (in memory; the setup is compute-import.test.ts's): INV-21 (every
 * failure point changes nothing: live state, history, stored snapshots, batch reports, the replica), STALE_REVISION, cancel,
 * PLAN_MISMATCH and BLOCKED through the worker, a crash losing the pending batch (ADR-034), structuredClone of every result,
 * per-call ids, parse refusals, asset bytes transferred, the stored report.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { StoreHandle } from '@/core/commands';
import { emptyRecordTables, type AnyRecord, type CanonicalState } from '@/core/schema';
import type { ImportPlan } from '@/io';
import { envelope, mustCommit } from '@/test-support/command-kit';
import { lastReplica, nameOf, planOf, renamed, workerDriver, workerImportRig, type WorkerImportRig } from '@/test-support/compute-import-kit';
import { exportBytes } from '@/test-support/import-kit';
import { loadState } from '@/test-support/persistence-kit';
import { expectReplicaEqualsStore } from '@/test-support/replica-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import type { ComputeWorkerApi } from '@/workers/rpc/contracts';

const base = loadFixtureState('maximal-valid');
const empty: CanonicalState = { meta: base.meta, records: emptyRecordTables() };
const speciesId = Object.keys(base.records.species).sort()[0] as string;
const jsonFile = (state: CanonicalState): Promise<Uint8Array> => exportBytes(state);

/** What "changed nothing" means for a refused or failed apply. */
async function expectNothingChanged(rig: WorkerImportRig, before: { readonly state: CanonicalState; readonly revision: number; readonly history: ReturnType<StoreHandle['historyLabels']> }, label: string): Promise<void> {
  await rig.r.sync.settled();
  await rig.t.adapter.flush();
  expect(rig.store.getState(), `${label}: state`).toBe(before.state);
  expect(rig.store.getRevision(), `${label}: revision`).toBe(before.revision);
  expect(rig.store.historyLabels(), `${label}: history`).toEqual(before.history);
  expect(await rig.t.adapter.listSnapshots(), `${label}: stored snapshots`).toEqual([]);
  expect(await rig.t.adapter.listImportBatches(), `${label}: batch reports`).toEqual([]);
  expect((await loadState(rig.t.adapter)).state, `${label}: persisted state`).toEqual(before.state);
  const replica = lastReplica(rig);
  expect(replica.pendingRevision(), `${label}: pending state`).toBeUndefined();
  expectReplicaEqualsStore(replica, rig.store, label);
}

describe('INV-21 through the worker: every failure point changes nothing', () => {
  async function prepared(rig: WorkerImportRig): Promise<{ readonly plan: ImportPlan; readonly before: { readonly state: CanonicalState; readonly revision: number; readonly history: ReturnType<StoreHandle['historyLabels']> } }> {
    const driver = workerDriver(rig);
    const first = planOf(await driver.preview(await jsonFile(renamed(base, speciesId, 'Imported')), 'x.orn.json'));
    const plan = planOf(await driver.revise(first.preview.batchId, { resolutions: [{ id: speciesId, resolution: 'replace' }] }));
    return { plan, before: { state: rig.store.getState(), revision: rig.store.getRevision(), history: rig.store.historyLabels() } };
  }
  const failing = <M extends keyof ComputeWorkerApi>(method: M, answer: Awaited<ReturnType<ComputeWorkerApi[M]>>) => ({
    rig: { wrap: (_: number, api: ComputeWorkerApi): ComputeWorkerApi => ({ ...api, [method]: async () => answer }) },
  });

  const arms: readonly (readonly [string, string, (rig: WorkerImportRig) => void])[] = [
    [
      'the snapshot cannot be stored',
      'SNAPSHOT_FAILED',
      (rig) => {
        rig.hooks.storeBytes = () => Promise.reject(new Error('disk full'));
      },
    ],
    [
      'the adapter finds the bytes stale',
      'STALE_REVISION',
      (rig) => {
        rig.hooks.storeBytes = async () => ({ ok: false, code: 'STALE_REVISION', message: 'stale' });
      },
    ],
    [
      'the adapter finds the bytes damaged',
      'SNAPSHOT_FAILED',
      (rig) => {
        rig.hooks.storeBytes = async () => ({ ok: false, code: 'BAD_BYTES', message: 'not zlib' });
      },
    ],
    [
      'the store refuses the findings',
      'REJECTED',
      (rig) => {
        rig.hooks.replaceState = (next, reason, pre) => rig.store.replaceState(next, reason, pre === undefined ? pre : { ...pre, ruleSet: 'another-rule-set' });
      },
    ],
    [
      'replaceState throws',
      'REJECTED',
      (rig) => {
        rig.hooks.replaceState = () => {
          throw new Error('boom');
        };
      },
    ],
  ];
  it.each(arms)('%s -> %s', async (label, code, arm) => {
    const rig = await workerImportRig(base);
    const { plan, before } = await prepared(rig);
    arm(rig);
    const result = await rig.flow.apply(plan.preview.batchId, plan);
    expect(result).toMatchObject({ ok: false, code });
    if (label === 'replaceState throws') expect(result).toMatchObject({ message: expect.stringContaining('nothing was changed') });
    await expectNothingChanged(rig, before, label);
    expect(rig.r.calls.map((c) => c.method)).toContain('dropPending');
    // The refusal leaves the dataset usable: an ordinary commit still reaches the replica.
    mustCommit(rig.store.dispatch(envelope('edit', { type: 'meta.update', meta: { ...rig.store.getState().meta, title: `After ${label}` } as never })));
    await rig.r.sync.settled();
    expectReplicaEqualsStore(lastReplica(rig), rig.store, `${label}: later commit`);
  });

  it.each([
    ['snapshotBuild fails to serialise', 'SNAPSHOT_FAILED', failing('snapshotBuild', { ok: false, code: 'SERIALIZE_FAILED', message: 'no' })],
    ['snapshotBuild finds the replica at another revision', 'STALE_REVISION', failing('snapshotBuild', { ok: false, code: 'REPLICA_STALE', have: 9 })],
  ] as const)('%s -> %s', async (label, code, options) => {
    const rig = await workerImportRig(base, options);
    const { plan, before } = await prepared(rig);
    expect(await rig.flow.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code });
    await expectNothingChanged(rig, before, label);
  });

  it('a commit while the snapshot is being stored: STALE_REVISION, the snapshot deleted again, the racing commit is the only change', async () => {
    const rig = await workerImportRig(base);
    const { plan } = await prepared(rig);
    rig.hooks.storeBytes = async (input) => {
      const stored = await rig.t.adapter.storeSnapshotBytes(input);
      mustCommit(rig.store.dispatch(envelope('race', { type: 'meta.update', meta: { ...rig.store.getState().meta, title: 'Raced' } as never })));
      return stored;
    };
    const revisionBefore = rig.store.getRevision();
    expect(await rig.flow.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'STALE_REVISION' });
    await rig.r.sync.settled();
    await rig.t.adapter.flush();
    expect(rig.store.getRevision()).toBe(revisionBefore + 1);
    expect(nameOf(rig.store.getState(), speciesId)).toBe(nameOf(base, speciesId));
    expect(await rig.t.adapter.listSnapshots()).toEqual([]);
    expect(rig.calls).toContain('deleteSnapshot');
    expect(rig.calls).not.toContain('replaceState');
    expect(lastReplica(rig).pendingRevision()).toBeUndefined();
    expectReplicaEqualsStore(lastReplica(rig), rig.store, 'after the race');
  });

  it('a cancel while the snapshot is being stored: UNKNOWN_BATCH, the snapshot deleted again, nothing imported', async () => {
    const rig = await workerImportRig(base);
    const { plan, before } = await prepared(rig);
    rig.hooks.storeBytes = async (input) => {
      const stored = await rig.t.adapter.storeSnapshotBytes(input);
      await rig.flow.cancel(plan.preview.batchId);
      return stored;
    };
    expect(await rig.flow.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    await expectNothingChanged(rig, before, 'cancel during the snapshot');
  });
});

describe('STALE_REVISION and cancel', () => {
  it('the store moved between preview and apply: apply refuses, without a snapshot, and the batch is gone', async () => {
    const rig = await workerImportRig(base);
    const driver = workerDriver(rig);
    const plan = planOf(await driver.preview(await jsonFile(renamed(base, speciesId, 'Imported')), 'x.orn.json'));
    mustCommit(rig.store.dispatch(envelope('edit', { type: 'meta.update', meta: { ...rig.store.getState().meta, title: 'Moved' } as never })));
    const stateAfterEdit = rig.store.getState();
    const result = await rig.flow.apply(plan.preview.batchId, plan);
    expect(result).toMatchObject({ ok: false, code: 'STALE_REVISION', message: 'data changed since the preview; run it again' });
    expect(rig.calls).toEqual([]);
    expect(rig.store.getState()).toBe(stateAfterEdit);
    expect(await rig.t.adapter.listSnapshots()).toEqual([]);
    expect(await rig.flow.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    expectReplicaEqualsStore(lastReplica(rig), rig.store, 'after the stale refusal');
  });

  it('a revise after the store moved is refused as STALE_REVISION too', async () => {
    const rig = await workerImportRig(base);
    const driver = workerDriver(rig);
    const plan = planOf(await driver.preview(await jsonFile(renamed(base, speciesId, 'Imported')), 'x.orn.json'));
    mustCommit(rig.store.dispatch(envelope('edit', { type: 'meta.update', meta: { ...rig.store.getState().meta, title: 'Moved' } as never })));
    await rig.r.sync.settled();
    const revised = await rig.flow.revise(plan.preview.batchId, { resolutions: [{ id: speciesId, resolution: 'replace' }] });
    expect(revised).toEqual({ ok: true, value: { ok: false, code: 'STALE_REVISION', message: 'data changed since the preview; run it again' } });
  });

  it('cancel (importCancel) changes nothing: state, revision, history, snapshots, replica; the cancelled batch cannot be applied', async () => {
    const rig = await workerImportRig(base);
    const driver = workerDriver(rig);
    const before = { state: rig.store.getState(), revision: rig.store.getRevision(), history: rig.store.historyLabels() };
    const plan = planOf(await driver.preview(await jsonFile(renamed(base, speciesId, 'Imported')), 'x.orn.json'));
    expect(await driver.cancel(plan.preview.batchId)).toBe(true);
    expect(await driver.cancel(plan.preview.batchId)).toBe(false);
    expect(await rig.flow.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    expect(rig.calls).toEqual([]);
    await expectNothingChanged(rig, before, 'cancel');
  });

  it('a preview and a revise (importPreview, importRevise) change no state, revision, history or snapshot either (INV-21)', async () => {
    const rig = await workerImportRig(base);
    const driver = workerDriver(rig);
    const before = { state: rig.store.getState(), revision: rig.store.getRevision(), history: rig.store.historyLabels() };
    const first = planOf(await driver.preview(await jsonFile(renamed(base, speciesId, 'Imported')), 'x.orn.json'));
    const second = planOf(await driver.revise(first.preview.batchId, { resolutions: [{ id: speciesId, resolution: 'replace' }] }));
    expect(second.preview.batchId).not.toBe(first.preview.batchId);
    expect(await driver.revise(first.preview.batchId, {})).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    await expectNothingChanged(rig, before, 'preview and revise');
  });

  it('a plan that is not the previewed one is refused by importPrepareApply (PLAN_MISMATCH) and the batch stays valid', async () => {
    const rig = await workerImportRig(base);
    const driver = workerDriver(rig);
    const plan = planOf(await driver.preview(await jsonFile(renamed(base, speciesId, 'Imported')), 'x.orn.json'));
    const tampered: ImportPlan = { ...plan, conflicts: plan.conflicts.map((c) => (c.identical ? c : { ...c, resolution: 'replace' as const })) };
    expect(await rig.flow.apply(plan.preview.batchId, tampered)).toMatchObject({ ok: false, code: 'PLAN_MISMATCH' });
    expect(rig.calls).toEqual([]);
    expect((await rig.flow.apply(plan.preview.batchId, plan)).ok).toBe(true);
  });

  it('an unconfirmable plan is refused (BLOCKED) before any snapshot', async () => {
    const rig = await workerImportRig(empty);
    const driver = workerDriver(rig);
    const dangling = produce(base, (draft) => {
      Reflect.deleteProperty(draft.records.species, speciesId);
    });
    const plan = planOf(await driver.preview(await jsonFile(dangling), 'dangling.orn.json'));
    expect(plan.preview.canConfirm).toBe(false);
    expect(await rig.flow.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'BLOCKED' });
    expect(rig.calls).toEqual([]);
    expect(await rig.t.adapter.listSnapshots()).toEqual([]);
  });
});

describe('a crash of the worker loses the pending batch (ADR-034)', () => {
  it('between preview and apply: the restarted worker answers UNKNOWN_BATCH, nothing changed, the replica was reloaded', async () => {
    const rig = await workerImportRig(base);
    const driver = workerDriver(rig);
    const before = { state: rig.store.getState(), revision: rig.store.getRevision(), history: rig.store.historyLabels() };
    const plan = planOf(await driver.preview(await jsonFile(renamed(base, speciesId, 'Imported')), 'x.orn.json'));
    rig.r.workers[0]?.crash('exit');
    const result = await rig.flow.apply(plan.preview.batchId, plan);
    expect(result).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    expect(rig.calls).toEqual([]);
    await expectNothingChanged(rig, before, 'crash between preview and apply');
    expect(rig.r.workers.length).toBe(2);
  });

  it('between prepare and the store: the snapshot call reports the crash, nothing changed, and the reloaded replica equals the store', async () => {
    const rig = await workerImportRig(base, {
      rig: {
        wrap: (index, api, worker) => ({
          ...api,
          snapshotBuild: async (params, ctx) => {
            if (index === 0) worker.crash('exit');
            return api.snapshotBuild(params, ctx);
          },
        }),
      },
    });
    const driver = workerDriver(rig);
    const first = planOf(await driver.preview(await jsonFile(renamed(base, speciesId, 'Imported')), 'x.orn.json'));
    const before = { state: rig.store.getState(), revision: rig.store.getRevision(), history: rig.store.historyLabels() };
    const result = await rig.flow.apply(first.preview.batchId, first);
    expect(result).toMatchObject({ ok: false, code: 'SNAPSHOT_FAILED' });
    await expectNothingChanged(rig, before, 'crash under snapshotBuild');
    // The batch died with the worker: applying it again is UNKNOWN_BATCH.
    expect(await rig.flow.apply(first.preview.batchId, first)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
  });
});

describe('every param and result of the import calls passes structuredClone', () => {
  it('the host results (plan, prepared payload, snapshot answer, adoption) are cloneable, and the port cloned every message', async () => {
    const results: { method: string; value: unknown }[] = [];
    const rig = await workerImportRig(base, {
      rig: {
        wrap: (_, api) => {
          const spy = <K extends 'importPreview' | 'importRevise' | 'importPrepareApply' | 'snapshotBuild' | 'adoptPending'>(method: K): ComputeWorkerApi[K] =>
            (async (params: never, ctx: never) => {
              const value = await (api[method] as (p: never, c: never) => Promise<unknown>)(params, ctx);
              results.push({ method, value });
              return value;
            }) as ComputeWorkerApi[K];
          return { ...api, importPreview: spy('importPreview'), importRevise: spy('importRevise'), importPrepareApply: spy('importPrepareApply'), snapshotBuild: spy('snapshotBuild'), adoptPending: spy('adoptPending') };
        },
      },
    });
    const driver = workerDriver(rig);
    const first = planOf(await driver.preview(await jsonFile(renamed(base, speciesId, 'Imported')), 'x.orn.json'));
    const plan = planOf(await driver.revise(first.preview.batchId, { resolutions: [{ id: speciesId, resolution: 'replace' }] }));
    expect((await rig.flow.apply(plan.preview.batchId, plan)).ok).toBe(true);
    await rig.r.sync.settled();
    expect(results.map((r) => r.method)).toEqual(['importPreview', 'importRevise', 'importPrepareApply', 'snapshotBuild', 'adoptPending']);
    for (const { method, value } of results) {
      // Byte buffers were transferred to the caller by then; everything else must clone.
      if (method === 'snapshotBuild') continue;
      expect(() => structuredClone(value), method).not.toThrow();
    }
    // Every request message the worker received was cloned by the port (a non-cloneable param would have failed there).
    expect(rig.r.workers[0]?.received.some((m) => m.type === 'request' && m.method === 'importPreview')).toBe(true);
  });
});

describe('ids come from main, per call', () => {
  it('the same seed script gives the same batch IDs; a revise mints a new one; a bad IdData is BAD_REQUEST', async () => {
    const one = await workerImportRig(base, { seed: 3 });
    const two = await workerImportRig(base, { seed: 3 });
    const three = await workerImportRig(base, { seed: 4 });
    const file = await jsonFile(renamed(base, speciesId, 'Imported'));
    const idOf = async (rig: WorkerImportRig) => planOf(await workerDriver(rig).preview(file, 'x.orn.json')).preview.batchId;
    const [a, b, c] = [await idOf(one), await idOf(two), await idOf(three)];
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    const revised = planOf(await workerDriver(one).revise(a, {}));
    expect(revised.preview.batchId).not.toBe(a);
    const bad = await one.r.sync.client.importPreview({ source: new Blob([file as BlobPart]), fileName: 'x', ids: { nowIso: 'yesterday', seed: 1 } });
    expect(bad).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    const badSeed = await one.r.sync.client.importPreview({ source: new Blob([file as BlobPart]), fileName: 'x', ids: { nowIso: '2026-09-30T12:00:00.000Z', seed: -1 } });
    expect(badSeed).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });
});

describe('parse refusals and cancellation are values', () => {
  it('a file that is not an ORN file is refused by the worker with the parser code; nothing becomes pending', async () => {
    const rig = await workerImportRig(base);
    const result = await rig.flow.preview(new Blob(['not json at all']), 'junk.json');
    expect(result).toMatchObject({ ok: true, value: { ok: false, code: expect.stringMatching(/INVALID_JSON|UNKNOWN_FORMAT/) } });
    expect(rig.r.calls.filter((c) => c.method === 'importPrepareApply')).toEqual([]);
    expect(await rig.flow.cancel('imp_none')).toEqual({ ok: true, value: { cancelled: false } });
  });

  it('an aborted call comes back CANCELLED and leaves the dataset alone', async () => {
    const rig = await workerImportRig(base);
    const controller = new AbortController();
    controller.abort();
    const result = await rig.flow.preview(new Blob([await jsonFile(base) as BlobPart]), 'x.orn.json', undefined, { signal: controller.signal });
    expect(result).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    expect(rig.store.getRevision()).toBe(1);
  });
});

describe('asset bytes are transferred, both ways', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);
  const ASSET_ID = 'ast_import-through-worker';
  async function sha256(bytes: Uint8Array): Promise<string> {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function withAsset(): Promise<CanonicalState> {
    const template = Object.values(base.records.asset)[0] as unknown as Record<string, unknown>;
    const record = { ...template, id: ASSET_ID, sha256: await sha256(PNG), byteSize: PNG.length, mediaType: 'image/png' } as unknown as AnyRecord;
    return produce(base, (draft) => {
      (draft.records.asset as Record<string, AnyRecord>)[ASSET_ID] = record;
    });
  }

  it('the bytes reach IndexedDB with their record; they left the worker as a transferred buffer; a failed apply of such a batch ends the batch', async () => {
    const held: Uint8Array[] = [];
    const rigOptions = {
      rig: {
        wrap: (_: number, api: ComputeWorkerApi): ComputeWorkerApi => ({
          ...api,
          importPrepareApply: async (params, ctx) => {
            const answer = await api.importPrepareApply(params, ctx);
            if (answer.ok) held.push(...answer.assets.map((a) => a.bytes));
            return answer;
          },
        }),
      },
    };
    const file = await exportBytes(await withAsset(), 'json', 'embed', async (id) => (id === ASSET_ID ? PNG : undefined));

    const failed = await workerImportRig(base, rigOptions);
    const plan = planOf(await workerDriver(failed).preview(file, 'with-asset.orn.json'));
    expect(plan.preview.assets).toMatchObject({ toStore: 1 });
    failed.hooks.storeBytes = async () => ({ ok: false, code: 'BAD_BYTES', message: 'no' });
    expect(await failed.flow.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'SNAPSHOT_FAILED' });
    expect(held[0]?.byteLength, 'the worker\'s copy was detached by the transfer').toBe(0);
    expect(await failed.flow.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });

    held.length = 0;
    const rig = await workerImportRig(base, rigOptions);
    const good = planOf(await workerDriver(rig).preview(file, 'with-asset.orn.json'));
    const result = await rig.flow.apply(good.preview.batchId, good);
    if (!result.ok) throw new Error(result.message);
    await rig.t.adapter.flush();
    expect(new Uint8Array(await ((await rig.t.adapter.getAssetBlob(ASSET_ID)) as Blob).arrayBuffer())).toEqual(PNG);
    expect(rig.calls).toEqual(['storeBytes', 'stage', 'replaceState', 'clear']);
    expect((await loadState(rig.t.adapter)).state).toEqual(rig.store.getState());
  });
});

describe('the report and the quarantine rows', () => {
  it('the batch report is stored with the snapshot ID the adapter made and the time from main; a report that cannot be stored is reported, the import stays applied', async () => {
    const rig = await workerImportRig(base);
    const driver = workerDriver(rig);
    const plan = planOf(await driver.preview(await jsonFile(renamed(base, speciesId, 'Imported')), 'x.orn.json'));
    rig.t.faults.fail('importBatches', () => new Error('no space'));
    const result = await rig.flow.apply(plan.preview.batchId, plan);
    rig.t.faults.clear();
    expect(result).toMatchObject({ ok: true, reportSaved: false, reportError: expect.stringContaining('the batch report was not stored') });
    if (!result.ok) return;
    expect(result.report.appliedAt).toBe('2026-09-30T12:00:00.000Z');
    expect(result.report.snapshotId).toBe(result.snapshotId);
    expect(rig.store.getRevision()).toBe(2);
  });
});
