/**
 * Step 5.1c, restore and export through the app services, and the in-process paths: a restore by snapshot id answers only after it
 * is saved; every failure is a value that changes nothing; a worker that is down answers WORKER_DOWN with the in-process path as an
 * OPTION (never taken silently) and each in-process path ends in the same state (or the same bytes) as the worker path.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '@/app/services';
import { createBooter, demoState, renameDataset, smallState, tamper } from '@/test-support/app-boot-kit';
import { newWorld, testEnv, worldHolding, type TestEnv, type World } from '@/test-support/app-env-kit';
import { ASSET_ID, demoFile, footprint, importFile, packageWithAsset } from '@/test-support/app-flow-kit';
import { withoutBatchIds } from '@/test-support/import-kit';
import type { ComputeWorkerApi } from '@/workers/rpc/contracts';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const FULL = { scope: 'full', includeDependencies: false, assets: 'none' } as const;
const frozen = (t: TestEnv) => ({ ...t.env, clock: { nowMs: () => 1_790_000_000_000 } });
const noWorker = { computeFactory: () => { throw new Error('no worker threads here'); } };

async function writer(options: Parameters<typeof booter.boot>[0] = {}, override?: (t: TestEnv) => ReturnType<typeof frozen>): Promise<{ readonly services: AppServices; readonly world: World; readonly t: TestEnv }> {
  const world = options.world ?? (await worldHolding(smallState(), 1));
  const booted = await booter.boot({ ...options, world }, override);
  return { ...booted, world };
}

describe('restore by snapshot id', () => {
  it('brings back the stored state, answers only after it is saved, and makes a pre_restore snapshot (undo restore)', async () => {
    const { services, world } = await writer();
    const original = services.store.getState();
    const applied = await importFile(services, await demoFile());
    const imported = services.store.getState();

    const restored = await services.flows.restore(applied.snapshotId);
    if (!restored.ok) throw new Error(restored.message);
    expect(restored).toMatchObject({ saved: true, sessionOnly: false, inProcess: false, revision: 3 });
    expect(services.store.getState()).toEqual(original);
    expect(services.pendingWrites()).toBe(false);
    expect(services.store.historyLabels()).toEqual({ undo: [], redo: [] });
    expect(restored.preRestore.reason).toBe('pre_restore');

    const again = await services.flows.restore(restored.preRestore.id); // undo the restore
    if (!again.ok) throw new Error(again.message);
    expect(withoutBatchIds(services.store.getState().records)).toEqual(withoutBatchIds(imported.records)); // 7.3b A1: only the import batch id differs
    expect((await footprint(services, world)).stored?.snapshots).toHaveLength(3);
  });

  it('every failure is a value that changes nothing: NOT_FOUND, a damaged snapshot, a cancel before the commit', async () => {
    const { services, world } = await writer();
    const applied = await importFile(services, await demoFile());
    const before = await footprint(services, world);

    expect(await services.flows.restore('snp_does-not-exist')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await footprint(services, world)).toEqual(before);

    await tamper(world, (db) => db.snapshots.update(applied.snapshotId, { blob: new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])]) }));
    const damaged = await footprint(services, world);
    const answer = await services.flows.restore(applied.snapshotId);
    expect(answer).toMatchObject({ ok: false, code: expect.stringMatching(/CORRUPT|INVALID/) });
    expect(await footprint(services, world)).toEqual(damaged);
    expect(services.status.get().operation).toBeNull();
  });

  it('a cancel while the pre_restore snapshot is being built is honoured before the commit; the snapshot it made is removed again', async () => {
    let open: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      open = resolve;
    });
    let held = 0;
    const { services, world } = await writer({
      wrap: (_i, api): ComputeWorkerApi => ({
        ...api,
        snapshotBuild: async (params, ctx) => {
          held += 1;
          if (held === 2) await hold; // the first one belongs to the import below
          return api.snapshotBuild(params, ctx);
        },
      }),
    });
    const applied = await importFile(services, await demoFile());
    const before = await footprint(services, world);
    const controller = new AbortController();
    const running = services.flows.restore(applied.snapshotId, { signal: controller.signal });
    await vi.waitFor(() => expect(services.status.get().operation).toMatchObject({ kind: 'restore' }));
    controller.abort();
    open();
    expect(await running).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(await footprint(services, world)).toEqual(before);
  });
});

describe('the worker is down', () => {
  it('import: WORKER_DOWN with the in-process path offered as a value; nothing runs until the caller asks', async () => {
    const { services, world } = await writer({ ...noWorker, world: newWorld() });
    const before = await footprint(services, world);
    const refused = await services.flows.preview(await demoFile(), 'demo.orn.json');
    expect(refused).toMatchObject({ ok: false, code: 'WORKER_DOWN', inProcessAvailable: true });
    expect(await footprint(services, world)).toEqual(before);
    expect(services.status.get().operation).toBeNull();

    const preview = await services.flows.preview(await demoFile(), 'demo.orn.json', undefined, { inProcess: true });
    if (!preview.ok) throw new Error(preview.message);
    expect(preview.inProcess).toBe(true);
    const applied = await services.flows.apply(preview.plan.preview.batchId, preview.plan);
    expect(applied).toMatchObject({ ok: true, inProcess: true, saved: true });
    expect(withoutBatchIds(services.store.getState().records)).toEqual(withoutBatchIds(demoState().records));
  });

  it('import: the in-process path ends in the same state and the same stored rows as the worker path', async () => {
    const viaWorker = await writer({}, frozen);
    await importFile(viaWorker.services, await demoFile());
    const inProcess = await writer(noWorker, frozen);
    await importFile(inProcess.services, await demoFile(), 'demo.orn.json', { inProcess: true });
    expect(inProcess.services.store.getState()).toEqual(viaWorker.services.store.getState());
    expect(inProcess.services.store.getRevision()).toBe(viaWorker.services.store.getRevision());
    const a = await footprint(viaWorker.services, viaWorker.world);
    const b = await footprint(inProcess.services, inProcess.world);
    expect(b.stored?.records).toBe(a.stored?.records);
    expect(b.stored?.snapshots).toHaveLength(a.stored?.snapshots.length ?? -1);
    expect(b.stored?.batches).toHaveLength(1);
  });

  it('an in-process batch is applied in process even while the worker is up; a worker batch needs the worker', async () => {
    const { services } = await writer();
    const preview = await services.flows.preview(await demoFile(), 'demo.orn.json', undefined, { inProcess: true });
    if (!preview.ok) throw new Error(preview.message);
    expect(preview.inProcess).toBe(true);
    const revised = await services.flows.revise(preview.plan.preview.batchId, { mode: 'replace_all' });
    if (!revised.ok) throw new Error(revised.message);
    expect(revised.inProcess).toBe(true);
    expect(await services.flows.apply(revised.plan.preview.batchId, revised.plan)).toMatchObject({ ok: true, inProcess: true });
  });

  it('restore: WORKER_DOWN offered, then the in-process restore ends in the same state as the worker restore', async () => {
    const viaWorker = await writer({}, frozen);
    const appliedW = await importFile(viaWorker.services, await demoFile());
    const restoredW = await viaWorker.services.flows.restore(appliedW.snapshotId);
    expect(restoredW).toMatchObject({ ok: true, inProcess: false });

    const inProcess = await writer({ computeFactory: noWorker.computeFactory }, frozen);
    const appliedP = await importFile(inProcess.services, await demoFile(), 'demo.orn.json', { inProcess: true });
    const before = await footprint(inProcess.services, inProcess.world);
    expect(await inProcess.services.flows.restore(appliedP.snapshotId)).toMatchObject({ ok: false, code: 'WORKER_DOWN', inProcessAvailable: true });
    expect(await footprint(inProcess.services, inProcess.world)).toEqual(before);
    const restoredP = await inProcess.services.flows.restore(appliedP.snapshotId, { inProcess: true });
    expect(restoredP).toMatchObject({ ok: true, inProcess: true, saved: true });
    expect(inProcess.services.store.getState()).toEqual(viaWorker.services.store.getState());
    expect((await footprint(inProcess.services, inProcess.world)).stored?.records).toBe((await footprint(viaWorker.services, viaWorker.world)).stored?.records);
  });

  it('Undo import in process: the same flow, the same result', async () => {
    const { services } = await writer(noWorker);
    const original = services.store.getState();
    await importFile(services, await demoFile(), 'demo.orn.json', { inProcess: true });
    expect(await services.flows.undo()).toMatchObject({ ok: false, code: 'WORKER_DOWN' });
    const undone = await services.flows.undo({ inProcess: true });
    expect(undone).toMatchObject({ ok: true, inProcess: true });
    expect(services.store.getState()).toEqual(original);
  });

  it('export: WORKER_DOWN offered, then the in-process bytes equal the worker bytes', async () => {
    const viaWorker = await writer({ world: await worldHolding(demoState(), 2) }, frozen);
    const w = await viaWorker.services.flows.export(FULL, 'orn.json');
    const down = await writer({ world: await worldHolding(demoState(), 2), ...noWorker }, frozen);
    expect(await down.services.flows.export(FULL, 'orn.json')).toMatchObject({ ok: false, code: 'WORKER_DOWN', inProcessAvailable: true });
    const p = await down.services.flows.export(FULL, 'orn.json', { inProcess: true });
    if (!w.ok || !p.ok) throw new Error('export');
    expect(p.inProcess).toBe(true);
    expect(w.inProcess).toBe(false);
    expect(p.result.bytes).toEqual(w.result.bytes);
    expect(p.result.counts).toEqual(w.result.counts);
    // and the .ornpkg format
    const wp = await viaWorker.services.flows.export(FULL, 'ornpkg');
    const pp = await down.services.flows.export(FULL, 'ornpkg', { inProcess: true });
    if (!wp.ok || !pp.ok) throw new Error('export pkg');
    expect(pp.result.bytes).toEqual(wp.result.bytes);
  });
});

describe('export', () => {
  it('answers bytes, counts, missing assets and missing references; a package carries the asset bytes', async () => {
    const { services, world } = await writer();
    await importFile(services, await packageWithAsset(), 'with-asset.ornpkg');
    const full = await services.flows.export({ scope: 'full', includeDependencies: false, assets: 'package' }, 'ornpkg');
    if (!full.ok) throw new Error(full.message);
    // the maximal fixture's own asset record has no bytes anywhere: reported; the imported asset's bytes are in the package
    expect(full.result.missingAssets.map((entry) => entry.assetId)).toEqual(['ast_max-grignard-scheme']);
    expect(full.result.counts.asset).toBeGreaterThan(0);
    expect(full.revision).toBe(services.store.getRevision());

    // a subset without its dependencies reports the references that do not resolve
    const species = Object.keys(services.store.getState().records.reaction)[0] ?? '';
    const subset = await services.flows.export({ scope: 'subset', subset: [{ kind: 'reaction', id: species }], includeDependencies: false, assets: 'none' }, 'orn.json');
    if (!subset.ok) throw new Error(subset.message);
    expect(subset.result.missingReferences.length).toBeGreaterThan(0);

    // bytes that are gone are REPORTED, never thrown
    await tamper(world, (db) => db.assetBlobs.clear());
    const missing = await services.flows.export({ scope: 'full', includeDependencies: false, assets: 'package' }, 'ornpkg');
    if (!missing.ok) throw new Error(missing.message);
    expect(missing.result.missingAssets.map((entry) => entry.assetId)).toContain(ASSET_ID);
  });

  it('progress is reported and a cancel returns CANCELLED with no bytes', async () => {
    const { services } = await writer({ world: await worldHolding(demoState(), 2) });
    const steps: number[] = [];
    const ok = await services.flows.export(FULL, 'orn.json', { onProgress: (done) => steps.push(done) });
    expect(ok).toMatchObject({ ok: true });
    expect(steps.length).toBeGreaterThan(0);
    const controller = new AbortController();
    const running = services.flows.export(FULL, 'orn.json', { signal: controller.signal });
    controller.abort();
    const answer = await running;
    expect(answer).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect('result' in answer).toBe(false);
  });

  it('a session-only tab exports its in-memory state; asset bytes it never kept are reported missing', async () => {
    const { services } = await booter.boot({ noIndexedDb: true });
    renameDataset(services, 'in memory');
    const answer = await services.flows.export(FULL, 'orn.json');
    expect(answer).toMatchObject({ ok: true });
    const t = testEnv({ noIndexedDb: true });
    const another = await booter.bootEnv(t);
    const applied = await importFile(another, await packageWithAsset(), 'with-asset.ornpkg');
    expect(applied.notes.join(' ')).toContain('asset file(s) were not kept');
    const exported = await another.flows.export({ scope: 'full', includeDependencies: false, assets: 'package' }, 'ornpkg');
    if (!exported.ok) throw new Error(exported.message);
    expect(exported.result.missingAssets.map((entry) => entry.assetId)).toContain(ASSET_ID);
  });
});
