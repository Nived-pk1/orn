/**
 * Step 5.1c, the import flow through the app services (headless, in-memory hosts, fake-indexeddb): the demo file into an empty
 * store resolves only after it is saved; assets reach IndexedDB with their records (one hand-off to the write queue); the report
 * records the source SHA-256 and the clock; persistent storage is asked once after the first import and a refusal is a status;
 * search and L4 follow an import; Undo import brings the old state and the old asset bytes back; P-02 through the services.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '@/io/hash';
import { createBooter, demoState, renameDataset } from '@/test-support/app-boot-kit';
import { newWorld, testEnv, worldHolding } from '@/test-support/app-env-kit';
import { engineKit, fakeMoleculesFor } from '@/test-support/app-engines-kit';
import { ASSET_BYTES, ASSET_ID, blobOf, demoFile, fileOf, footprint, importFile, packageWithAsset, stateWithAsset } from '@/test-support/app-flow-kit';
import { exportBytes } from '@/test-support/import-kit';
import { freshDb } from '@/test-support/persistence-kit';
import { smallState } from '@/test-support/app-boot-kit';

const booter = createBooter();
afterEach(() => booter.disposeAll());

async function storedRevision(world: ReturnType<typeof newWorld>): Promise<unknown> {
  const tdb = freshDb(undefined, world.indexedDB);
  try {
    return (await tdb.db.meta.get('revision'))?.value;
  } finally {
    tdb.db.close();
  }
}

describe('the demo file into an empty store', () => {
  it('resolves only after the data is saved; the answer says the revision and that it is saved', async () => {
    const world = newWorld();
    const { services } = await booter.boot({ world });
    expect(services.store.getRevision()).toBe(0);
    const preview = await services.flows.preview(await demoFile(), 'demo.orn.json');
    if (!preview.ok) throw new Error(preview.message);
    expect(preview.inProcess).toBe(false);
    expect(preview.plan.preview.canConfirm).toBe(true);
    // preview changes nothing (INV-21)
    expect(services.store.getRevision()).toBe(0);

    const saveStates: string[] = [];
    services.status.subscribe((status) => {
      const state = status.save?.state ?? 'none';
      if (saveStates[saveStates.length - 1] !== state) saveStates.push(state);
    });
    const applied = await services.flows.apply(preview.plan.preview.batchId, preview.plan);
    if (!applied.ok) throw new Error(applied.message);
    expect(applied).toMatchObject({ revision: 1, saved: true, sessionOnly: false, save: null, inProcess: false, reportSaved: true });
    // by the time the answer arrived the queue was idle at that revision
    expect(services.pendingWrites()).toBe(false);
    expect(services.status.get().save).toMatchObject({ state: 'saved', lastSavedRevision: 1, pendingRevisions: 0 });
    expect(await storedRevision(world)).toBe(1);
    expect(saveStates).toContain('saving');
    expect(services.status.get().operation).toBeNull();
    expect(services.store.getState().records).toEqual(demoState().records);
    expect(services.store.historyLabels()).toEqual({ undo: [], redo: [] });
  });

  it('applied but not saved is never reported as saved: the answer carries the SaveStatus', async () => {
    const { services } = await booter.boot({ world: newWorld() });
    const preview = await services.flows.preview(await demoFile(), 'demo.orn.json');
    if (!preview.ok) throw new Error(preview.message);
    const adapter = services.persistence;
    if (adapter === undefined) throw new Error('no adapter');
    // a queue that is still retrying when the flush gives up: the adapter's own status says so
    const real = adapter.getStatus.bind(adapter);
    adapter.getStatus = () => ({ ...real(), state: 'retrying', pendingRevisions: 1, lastError: 'quota exceeded' });
    const answer = await services.flows.apply(preview.plan.preview.batchId, preview.plan);
    if (!answer.ok) throw new Error(answer.message);
    expect(answer.revision).toBe(1);
    expect(answer.saved).toBe(false);
    expect(answer.sessionOnly).toBe(false);
    expect(answer.save).toMatchObject({ state: 'retrying', pendingRevisions: 1, lastError: 'quota exceeded' });
  });

  it('the state equals the file, the stored rows equal the state (a reload sees the demo)', async () => {
    const world = newWorld();
    const { services } = await booter.boot({ world });
    await importFile(services, await demoFile());
    await services.dispose();
    const again = await booter.bootEnv(testEnv({ world }));
    expect(again.store.getState().records).toEqual(demoState().records);
    expect(again.store.getRevision()).toBe(1);
  });
});

describe('assets', () => {
  it('a package that carries assets: bytes and records reach the write queue in ONE hand-off and IndexedDB has both', async () => {
    const world = newWorld();
    const { services } = await booter.boot({ world });
    const adapter = services.persistence;
    if (adapter === undefined) throw new Error('no adapter');
    const seen: { readonly kind: string; readonly blobs: readonly string[] }[] = [];
    const real = adapter.writeChanges.bind(adapter);
    adapter.writeChanges = (changes, next, blobs) => {
      seen.push({ kind: changes.cause, blobs: (blobs ?? []).map((blob) => blob.assetId) });
      return real(changes, next, blobs);
    };
    const applied = await importFile(services, await packageWithAsset(), 'with-asset.ornpkg');
    expect(applied.saved).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ kind: 'replace', blobs: [ASSET_ID] });
    const blob = await adapter.getAssetBlob(ASSET_ID);
    expect(new Uint8Array(await (blob as Blob).arrayBuffer())).toEqual(ASSET_BYTES);
    // the stage was cleared: a later commit carries no blobs
    renameDataset(services, 'after');
    await adapter.flush();
    expect(seen[1]?.blobs).toEqual([]);
  });

  it('Undo import brings back the old state AND the old asset bytes', async () => {
    const world = newWorld();
    const first = await stateWithAsset(ASSET_BYTES);
    const { services } = await booter.boot({ world });
    await importFile(services, await fileOf(first, 'pkg', 'embed', (id) => (id === ASSET_ID ? ASSET_BYTES : undefined)), 'one.ornpkg');
    const before = await footprint(services, world);
    // a second import replaces the asset record with different bytes
    const newBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);
    const second = await stateWithAsset(newBytes);
    const applied = await importFile(services, await fileOf(second, 'pkg', 'embed', (id) => (id === ASSET_ID ? newBytes : undefined)), 'two.ornpkg', { request: { resolutions: [{ id: ASSET_ID, resolution: 'replace' }] } });
    expect(services.store.getState().records.asset[ASSET_ID as never]).toMatchObject({ sha256: await sha256Hex(newBytes) });

    const undone = await services.flows.undo();
    if (!undone.ok) throw new Error(undone.message);
    expect(undone).toMatchObject({ saved: true });
    expect(services.store.getState()).toEqual(before.state);
    const record = services.store.getState().records.asset[ASSET_ID as never] as { sha256: string };
    expect(record.sha256).toBe(await sha256Hex(ASSET_BYTES));
    const blob = await services.persistence?.getAssetBlob(ASSET_ID);
    expect(new Uint8Array(await (blob as Blob).arrayBuffer())).toEqual(ASSET_BYTES);
    expect(applied.snapshotId).toBeTruthy();
    // the second import's bytes are still stored under their own hash (content-addressed, nothing overwritten)
    const after = await footprint(services, world);
    expect(after.stored?.blobs).toContain(await sha256Hex(newBytes));
  });
});

describe('the batch report', () => {
  it("records the source file's SHA-256 and the clock time used, in the answer and in the stored row", async () => {
    const world = newWorld();
    const { services } = await booter.boot({ world });
    const bytes = await exportBytes(demoState());
    const applied = await importFile(services, blobOf(bytes));
    const sha = await sha256Hex(bytes);
    expect(applied.report.sourceSha256).toBe(sha);
    expect(applied.report.clockNowIso).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    const rows = (await services.persistence?.listImportBatches()) ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.report).toMatchObject({ sourceSha256: sha, clockNowIso: applied.report.clockNowIso, batchId: applied.report.batchId });
  });

  it('the clock time is the one the preview used (not the later apply time)', async () => {
    const { services, t } = await booter.boot({ world: newWorld() });
    const preview = await services.flows.preview(await demoFile(), 'demo.orn.json');
    if (!preview.ok) throw new Error(preview.message);
    const readsAtPreview = t.clockReads();
    const applied = await services.flows.apply(preview.plan.preview.batchId, preview.plan);
    if (!applied.ok) throw new Error(applied.message);
    expect(t.clockReads()).toBeGreaterThan(readsAtPreview);
    expect(Date.parse(applied.report.clockNowIso ?? '')).toBeLessThan(Date.parse(applied.report.appliedAt));
  });
});

/** Resolves when AppStatus.storage leaves `asking` (the request is asked after the answer; nothing waits for it). */
async function storageSettled(services: Awaited<ReturnType<typeof booter.bootEnv>>): Promise<void> {
  await vi.waitFor(() => expect(services.status.get().storage.persistence).not.toBe('asking'));
}

describe('persistent storage', () => {
  it('is requested ONCE after the first successful import in a writer tab; the answer is a status', async () => {
    let asks = 0;
    const t = testEnv({ world: newWorld() });
    const services = await booter.bootEnv(t, { ...t.env, storage: { persist: async () => (asks += 1, true) } });
    expect(services.status.get().storage).toEqual({ persistence: 'unknown', message: null });
    await importFile(services, await fileOf(smallState()));
    await storageSettled(services);
    expect(asks).toBe(1);
    expect(services.status.get().storage).toEqual({ persistence: 'persisted', message: null });
    await importFile(services, await demoFile());
    expect(asks).toBe(1);
  });

  it('a refusal is a status, never an error and never part of the answer', async () => {
    const t = testEnv({ world: newWorld() });
    const services = await booter.bootEnv(t, { ...t.env, storage: { persist: async () => false } });
    const applied = await importFile(services, await demoFile());
    await storageSettled(services);
    expect(services.status.get().storage).toMatchObject({ persistence: 'refused', message: expect.stringContaining('persistent storage') });
    expect(applied.saved).toBe(true);
  });

  it('a request that throws, or an environment without the API, leaves it unknown with the reason', async () => {
    const t = testEnv({ world: newWorld() });
    const throwing = await booter.bootEnv(t, { ...t.env, storage: { persist: async () => { throw new Error('denied by policy'); } } });
    await importFile(throwing, await fileOf(smallState()));
    await storageSettled(throwing);
    expect(throwing.status.get().storage).toMatchObject({ persistence: 'unknown', message: expect.stringContaining('denied by policy') });
    const none = await booter.boot({ world: newWorld() });
    await importFile(none.services, await fileOf(smallState()));
    expect(none.services.status.get().storage).toMatchObject({ persistence: 'unknown', message: expect.stringContaining('cannot be asked') });
  });

  it('a request that rejects synchronously (not a promise) is a status too', async () => {
    const t = testEnv({ world: newWorld() });
    const services = await booter.bootEnv(t, { ...t.env, storage: { persist: () => { throw new Error('no permission API'); } } });
    const applied = await importFile(services, await fileOf(smallState()));
    expect(applied.saved).toBe(true);
    expect(services.status.get().storage).toMatchObject({ persistence: 'unknown', message: expect.stringContaining('no permission API') });
  });

  it('a request that never resolves (Firefox waiting for a prompt) holds no flow: the apply answers, the slot is free, a second import works', async () => {
    let asks = 0;
    const t = testEnv({ world: newWorld() });
    const services = await booter.bootEnv(t, { ...t.env, storage: { persist: () => (asks += 1, new Promise<boolean>(() => undefined)) } });
    const first = await importFile(services, await fileOf(smallState()));
    expect(first.saved).toBe(true);
    expect(services.status.get().operation).toBeNull();
    expect(services.status.get().storage).toMatchObject({ persistence: 'asking' });
    const second = await importFile(services, await demoFile());
    expect(second.saved).toBe(true);
    expect(asks).toBe(1);
    expect(services.status.get().storage.persistence).toBe('asking');
  });

  it('a refused import does not use the one request', async () => {
    let asks = 0;
    const t = testEnv({ world: newWorld() });
    const services = await booter.bootEnv(t, { ...t.env, storage: { persist: async () => (asks += 1, true) } });
    const preview = await services.flows.preview(await demoFile(), 'x.orn.json');
    if (!preview.ok) throw new Error(preview.message);
    const answer = await services.flows.apply('imp_other', preview.plan);
    expect(answer).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    expect(asks).toBe(0);
  });
});

describe('derived services follow an import', () => {
  it('search finds the imported records after the import', async () => {
    const kit = engineKit({ molecules: fakeMoleculesFor(demoState()) });
    const t = testEnv({ world: newWorld(), workers: kit.factories });
    const services = await booter.bootEnv(t);
    await importFile(services, await demoFile());
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(200));
    t.scheduler.fireAfter(200);
    await services.searchSync()?.flush();
    const hits = await services.search.search('palette', { text: 'ethanol', limit: 5 });
    expect(hits.ok).toBe(true);
    if (hits.ok) expect(hits.value.length).toBeGreaterThan(0);
    expect(services.status.get().search).toMatchObject({ state: 'idle', indexRevision: 1 });
  });

  it('L4 runs again over the imported state (checkAll after the replace)', async () => {
    const kit = engineKit({ molecules: fakeMoleculesFor(demoState()) });
    const t = testEnv({ world: newWorld(), workers: kit.factories });
    const services = await booter.bootEnv(t);
    await importFile(services, await demoFile());
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(400));
    t.scheduler.fireAfter(400);
    await services.l4.flush();
    const species = Object.keys(services.store.getState().records.species)[0] ?? '';
    expect(services.l4.statusOf({ kind: 'species', id: species } as never).state).not.toBe('none');
    expect(services.l4.stats().calls.checkSpecies).toBeGreaterThan(0);
  });
});

describe('P-02 through the services on the demo', () => {
  /** A constant clock: the export's `exportedAt` is the only thing that differs between two runs otherwise. */
  const frozen = (t: ReturnType<typeof testEnv>) => ({ ...t.env, clock: { nowMs: () => 1_790_000_000_000 } });

  it('export, import into an empty store, export: byte-identical', async () => {
    const full = { scope: 'full', includeDependencies: false, assets: 'none' } as const;
    const first = await booter.boot({ world: await worldHolding(demoState(), 1) }, frozen);
    const out1 = await first.services.flows.export(full, 'orn.json');
    if (!out1.ok) throw new Error(out1.message);
    const second = await booter.boot({ world: newWorld() }, frozen);
    await importFile(second.services, blobOf(out1.result.bytes), 'roundtrip.orn.json', { request: { mode: 'replace_all' } });
    const out2 = await second.services.flows.export(full, 'orn.json');
    if (!out2.ok) throw new Error(out2.message);
    expect(out2.result.bytes).toEqual(out1.result.bytes);
    expect(out2.result.counts).toEqual(out1.result.counts);
  });
});
