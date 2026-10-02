/**
 * Step 5.1c, the guards of the flows through the app services: one whole-state operation at a time (BUSY as a value, logged,
 * `AppStatus.operation`), cancel (changes nothing), STALE_REVISION / UNKNOWN_BATCH as values, INV-21 at every failure point (state,
 * revision, history, stored rows and snapshots unchanged), and the modes (follower and read-only: READ_ONLY, export works;
 * session-only: import in memory, the snapshot bytes kept in memory, at most 3, Undo import works, the answer says nothing is saved).
 */
import { produce } from 'immer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MEMORY_SNAPSHOT_LIMIT, type AppServices } from '@/app/services';
import { createBooter, demoState, renameDataset, smallState, tamper } from '@/test-support/app-boot-kit';
import { testEnv, worldHolding, type World } from '@/test-support/app-env-kit';
import { blobOf, demoFile, fileOf, footprint, importFile } from '@/test-support/app-flow-kit';
import type { ComputeWorkerApi } from '@/workers/rpc/contracts';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const FULL = { scope: 'full', includeDependencies: false, assets: 'none' } as const;

/** A promise whose resolution the test controls: holds a worker call mid-flight. */
function gate(): { readonly open: () => void; readonly wait: Promise<void> } {
  let open: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, wait };
}

/** An env whose compute worker holds `method` until the gate opens (an operation that stays "running" while the test looks). */
function holding(method: 'snapshotBuild' | 'exportBuild' | 'importPreview', hold: Promise<void>) {
  return {
    wrap: (_index: number, api: ComputeWorkerApi): ComputeWorkerApi => ({
      ...api,
      [method]: async (params: never, ctx: never) => {
        await hold;
        return (api[method] as (p: never, c: never) => Promise<unknown>)(params, ctx);
      },
    }),
  };
}

async function writerWithDemo(options: Parameters<typeof booter.boot>[0] = {}): Promise<{ readonly services: AppServices; readonly world: World }> {
  const world = options.world ?? (await worldHolding(smallState(), 1));
  const { services } = await booter.boot({ ...options, world });
  return { services, world };
}

describe('one whole-state operation at a time', () => {
  it('while an apply runs, another apply, a preview, a restore, an export and an undo are refused as values and logged', async () => {
    const hold = gate();
    const { services, world } = await writerWithDemo(holding('snapshotBuild', hold.wait));
    const preview = await services.flows.preview(await demoFile(), 'demo.orn.json');
    if (!preview.ok) throw new Error(preview.message);
    const before = await footprint(services, world);

    const running = services.flows.apply(preview.plan.preview.batchId, preview.plan);
    await vi.waitFor(() => expect(services.status.get().operation).toMatchObject({ kind: 'import_apply' }));

    const refusals = [
      await services.flows.apply(preview.plan.preview.batchId, preview.plan),
      await services.flows.preview(await demoFile(), 'again.orn.json'),
      await services.flows.revise(preview.plan.preview.batchId, {}),
      await services.flows.restore('snp_anything'),
      await services.flows.export(FULL, 'orn.json'),
    ];
    for (const refusal of refusals) expect(refusal).toMatchObject({ ok: false, code: 'BUSY', busyWith: 'import_apply' });
    const busyLogs = services.log.get().filter((entry) => entry.source === 'app' && entry.event.type === 'flow_busy');
    expect(busyLogs).toHaveLength(refusals.length);
    expect(services.store.getRevision()).toBe(before.revision); // refusals changed nothing

    hold.open();
    const done = await running;
    expect(done).toMatchObject({ ok: true, saved: true });
    expect(services.status.get().operation).toBeNull();
    // the slot is free again
    expect(await services.flows.export(FULL, 'orn.json')).toMatchObject({ ok: true });
  });

  it('AppStatus.operation shows kind and stage through an apply, then null', async () => {
    const { services } = await writerWithDemo();
    const seen: string[] = [];
    services.status.subscribe((status) => {
      const label = status.operation === null ? 'none' : `${status.operation.kind}:${status.operation.stage}`;
      if (seen[seen.length - 1] !== label) seen.push(label);
    });
    await importFile(services, await demoFile());
    expect(seen).toEqual(expect.arrayContaining(['import_preview:previewing the file', 'none', 'import_apply:preparing', 'import_apply:snapshot', 'import_apply:committing', 'import_apply:saving']));
    expect(seen[seen.length - 1]).toBe('none');
    expect(seen.indexOf('import_apply:snapshot')).toBeLessThan(seen.indexOf('import_apply:committing'));
    expect(seen.indexOf('import_apply:committing')).toBeLessThan(seen.indexOf('import_apply:saving'));
  });

  it('a preview reports progress', async () => {
    const { services } = await writerWithDemo();
    const progress: { done: number; total: number | null }[] = [];
    services.status.subscribe((status) => {
      if (status.operation?.progress != null) progress.push(status.operation.progress);
    });
    const preview = await services.flows.preview(await demoFile(), 'demo.orn.json');
    expect(preview.ok).toBe(true);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((step) => step.done > 0)).toBe(true);
  });
});

describe('cancel changes nothing', () => {
  it('a cancel while the apply is held is honoured before the commit: CANCELLED, and the footprint is exactly as it was', async () => {
    const hold = gate();
    const { services, world } = await writerWithDemo(holding('snapshotBuild', hold.wait));
    const preview = await services.flows.preview(await demoFile(), 'demo.orn.json');
    if (!preview.ok) throw new Error(preview.message);
    const before = await footprint(services, world);
    const controller = new AbortController();
    const running = services.flows.apply(preview.plan.preview.batchId, preview.plan, { signal: controller.signal });
    await vi.waitFor(() => expect(services.status.get().operation).toMatchObject({ kind: 'import_apply' }));
    controller.abort();
    hold.open();
    expect(await running).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(await footprint(services, world)).toEqual(before); // state, revision, history, rows, snapshots, batches
    expect(services.status.get().operation).toBeNull();
    expect(services.pendingWrites()).toBe(false);
  });

  it('an already-aborted signal is CANCELLED at once, without taking the slot, for every flow', async () => {
    const { services, world } = await writerWithDemo();
    const before = await footprint(services, world);
    const signal = AbortSignal.abort();
    expect(await services.flows.preview(await demoFile(), 'x.orn.json', undefined, { signal })).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(await services.flows.restore('snp_x', { signal })).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(await services.flows.export(FULL, 'orn.json', { signal })).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(services.log.get().some((entry) => entry.event.type === 'flow_busy')).toBe(false);
    expect(await footprint(services, world)).toEqual(before);
  });

  it('a preview cancelled through its signal while the worker is busy answers CANCELLED and leaves no pending batch', async () => {
    const hold = gate();
    const { services } = await writerWithDemo(holding('importPreview', hold.wait));
    const controller = new AbortController();
    const running = services.flows.preview(await demoFile(), 'demo.orn.json', undefined, { signal: controller.signal });
    await vi.waitFor(() => expect(services.status.get().operation).toMatchObject({ kind: 'import_preview' }));
    controller.abort();
    hold.open();
    expect(await running).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(services.status.get().operation).toBeNull();
  });

  it('cancel(batchId) discards the pending batch: apply is then UNKNOWN_BATCH, and nothing changed', async () => {
    const { services, world } = await writerWithDemo();
    const preview = await services.flows.preview(await demoFile(), 'demo.orn.json');
    if (!preview.ok) throw new Error(preview.message);
    const before = await footprint(services, world);
    expect(await services.flows.cancel(preview.plan.preview.batchId)).toEqual({ cancelled: true });
    expect(await services.flows.cancel(preview.plan.preview.batchId)).toEqual({ cancelled: false });
    expect(await services.flows.apply(preview.plan.preview.batchId, preview.plan)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    expect(await footprint(services, world)).toEqual(before);
  });

  it('a newer preview replaces the pending batch: the old id is UNKNOWN_BATCH', async () => {
    const { services } = await writerWithDemo();
    const one = await services.flows.preview(await demoFile(), 'one.orn.json');
    const two = await services.flows.preview(await fileOf(smallState()), 'two.orn.json');
    if (!one.ok || !two.ok) throw new Error('preview');
    expect(await services.flows.apply(one.plan.preview.batchId, one.plan)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    expect(await services.flows.revise(one.plan.preview.batchId, {})).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    expect(await services.flows.apply(two.plan.preview.batchId, two.plan)).toMatchObject({ ok: true });
  });
});

describe('failures are values and change nothing (INV-21)', () => {
  it('STALE_REVISION: data changed between the preview and the apply', async () => {
    const { services, world } = await writerWithDemo();
    const preview = await services.flows.preview(await demoFile(), 'demo.orn.json');
    if (!preview.ok) throw new Error(preview.message);
    renameDataset(services, 'a commit after the preview');
    const before = await footprint(services, world);
    expect(await services.flows.apply(preview.plan.preview.batchId, preview.plan)).toMatchObject({ ok: false, code: 'STALE_REVISION' });
    expect(await footprint(services, world)).toEqual(before);
  });

  it('the snapshot cannot be built (worker): SNAPSHOT_FAILED, nothing changed', async () => {
    const { services, world } = await writerWithDemo({
      wrap: (_i, api) => ({ ...api, snapshotBuild: async () => ({ ok: true, value: { ok: false, code: 'SERIALIZE_FAILED', message: 'cannot serialise' } }) as never }),
    });
    const preview = await services.flows.preview(await demoFile(), 'demo.orn.json');
    if (!preview.ok) throw new Error(preview.message);
    const before = await footprint(services, world);
    expect(await services.flows.apply(preview.plan.preview.batchId, preview.plan)).toMatchObject({ ok: false, code: 'SNAPSHOT_FAILED' });
    expect(await footprint(services, world)).toEqual(before);
    expect(services.status.get().operation).toBeNull();
  });

  it('the snapshot cannot be stored (disk): SNAPSHOT_FAILED, nothing changed, and the next import works', async () => {
    const { services, world } = await writerWithDemo();
    const adapter = services.persistence;
    if (adapter === undefined) throw new Error('no adapter');
    const preview = await services.flows.preview(await demoFile(), 'demo.orn.json');
    if (!preview.ok) throw new Error(preview.message);
    const before = await footprint(services, world);
    const real = adapter.storeSnapshotBytes.bind(adapter);
    adapter.storeSnapshotBytes = async () => {
      throw new Error('quota exceeded');
    };
    expect(await services.flows.apply(preview.plan.preview.batchId, preview.plan)).toMatchObject({ ok: false, code: 'SNAPSHOT_FAILED', message: expect.stringContaining('quota exceeded') });
    expect(await footprint(services, world)).toEqual(before);
    adapter.storeSnapshotBytes = real;
    await importFile(services, await demoFile());
    expect(services.store.getRevision()).toBe(before.revision + 1);
  });

  it('the worker cannot prepare the apply: a value, nothing changed', async () => {
    const { services, world } = await writerWithDemo({
      wrap: (_i, api) => ({ ...api, importPrepareApply: async () => Promise.reject(new Error('worker refused')) }),
    });
    const preview = await services.flows.preview(await demoFile(), 'demo.orn.json');
    if (!preview.ok) throw new Error(preview.message);
    const before = await footprint(services, world);
    const answer = await services.flows.apply(preview.plan.preview.batchId, preview.plan);
    expect(answer.ok).toBe(false);
    expect(await footprint(services, world)).toEqual(before);
  });

  it('a file that is not a dataset is a value from the parser, nothing changed', async () => {
    const { services, world } = await writerWithDemo();
    const before = await footprint(services, world);
    const answer = await services.flows.preview(blobOf(new TextEncoder().encode('{ not json')), 'broken.orn.json');
    expect(answer).toMatchObject({ ok: false, code: expect.stringMatching(/INVALID_JSON|UNKNOWN_FORMAT/) });
    expect(await footprint(services, world)).toEqual(before);
    expect(services.status.get().operation).toBeNull();
  });
});

describe('modes', () => {
  it('a follower: import and restore are READ_ONLY as values; export works', async () => {
    const world = await worldHolding(demoState(), 2);
    const a = await booter.bootEnv(testEnv({ world }));
    const b = await booter.bootEnv(testEnv({ world }));
    expect(a.status.get().mode).toBe('writer');
    expect(b.status.get().mode).toBe('follower');
    const before = await footprint(b, undefined);
    expect(await b.flows.preview(await demoFile(), 'x.orn.json')).toMatchObject({ ok: false, code: 'READ_ONLY' });
    expect(await b.flows.apply('imp_x', {} as never)).toMatchObject({ ok: false, code: 'READ_ONLY' });
    expect(await b.flows.restore('snp_x')).toMatchObject({ ok: false, code: 'READ_ONLY' });
    expect(await b.flows.undo()).toMatchObject({ ok: false, code: 'READ_ONLY' });
    const exported = await b.flows.export(FULL, 'orn.json');
    expect(exported).toMatchObject({ ok: true });
    if (exported.ok) expect(exported.result.counts.species).toBeGreaterThan(0);
    expect(await footprint(b, undefined)).toEqual(before);
  });

  it('a read-only tab (newer schema): READ_ONLY as values; export works', async () => {
    const world = await worldHolding(smallState(), 1);
    await tamper(world, (db) => db.meta.put({ key: 'schemaVersion', value: 9999 }));
    const { services } = await booter.boot({ world });
    expect(services.status.get().mode).toBe('read_only');
    expect(await services.flows.preview(await demoFile(), 'x.orn.json')).toMatchObject({ ok: false, code: 'READ_ONLY' });
    expect(await services.flows.restore('snp_x')).toMatchObject({ ok: false, code: 'READ_ONLY' });
    expect(await services.flows.export(FULL, 'orn.json')).toMatchObject({ ok: true });
  });

  it('session-only: import works in memory, says nothing is saved, and Undo import brings the old state back', async () => {
    const { services } = await booter.boot({ noIndexedDb: true });
    expect(services.status.get().mode).toBe('session_only');
    renameDataset(services, 'before the import');
    const old = services.store.getState();
    const applied = await importFile(services, await demoFile());
    expect(applied).toMatchObject({ saved: false, sessionOnly: true, save: null });
    expect(applied.notes.join(' ')).toContain('nothing is saved');
    expect(services.store.getState().records.species).not.toEqual(old.records.species);
    const undone = await services.flows.undo();
    if (!undone.ok) throw new Error(undone.message);
    expect(undone).toMatchObject({ saved: false, sessionOnly: true });
    expect(services.store.getState()).toEqual(old);
    expect(services.status.get().storage.persistence).toBe('unknown'); // nothing to make persistent
  });

  it('session-only: at most 3 snapshots are kept; the oldest is dropped and REPORTED', async () => {
    const { services } = await booter.boot({ noIndexedDb: true });
    const notes: string[] = [];
    for (let i = 0; i < MEMORY_SNAPSHOT_LIMIT + 2; i += 1) {
      const state = produce(smallState(), (draft) => {
        draft.meta.title = `import number ${i}`;
      });
      const applied = await importFile(services, await fileOf(state), `n${i}.orn.json`, { request: { mode: 'replace_all' } });
      notes.push(...applied.notes);
    }
    expect(notes.filter((note) => note.includes('dropped the oldest'))).toHaveLength(2);
    expect(services.log.get().filter((entry) => entry.event.type === 'memory_snapshots_dropped')).toHaveLength(2);
    // Undo import still works for the newest batch
    const undone = await services.flows.undo();
    expect(undone).toMatchObject({ ok: true });
    expect(services.store.getState().meta.title).toBe(`import number ${MEMORY_SNAPSHOT_LIMIT + 2 - 2}`);
  });

  it('Undo import with nothing to undo is UNKNOWN_BATCH as a value', async () => {
    const { services } = await writerWithDemo();
    expect(await services.flows.undo()).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
  });
});
