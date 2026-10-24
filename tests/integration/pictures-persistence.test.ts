/**
 * Mechanism pictures against the real app services and a real (fake-indexeddb) database (step 6.5b part 2, ADR-038 addendum P3): ONE
 * transaction holds the asset record and its bytes; a reload still has the picture; global Undo removes the record and keeps the bytes
 * (Redo brings the record back); Remove detaches and the asset record stays; equal bytes are stored once; a refused picture saves nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInspectorPorts } from '@/app/window/inspector-port';
import { createPicturesPort } from '@/app/window/pictures-port';
import type { Asset } from '@/core/schema';
import { createBooter, demoState } from '@/test-support/app-boot-kit';
import { testEnv, worldHolding } from '@/test-support/app-env-kit';

const booter = createBooter();
afterEach(() => {
  vi.restoreAllMocks();
  return booter.disposeAll();
});

const SN2 = 'mec_sn2-haloalkane';
const mech = (id: string) => ({ kind: 'mechanism' as const, id });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9, 9, 9]);
const file = (bytes: Uint8Array) => ({ name: 'step.png', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer });

async function boot() {
  const world = await worldHolding(demoState(), 2);
  const { services } = await booter.boot({ world });
  const persistence = services.persistence;
  if (persistence === undefined) throw new Error('this tab keeps nothing');
  const port = createPicturesPort({ store: services.store, assets: services.assets, getBlob: (id) => persistence.getAssetBlob(id) });
  const prepared = async (bytes = PNG) => {
    const result = await port.prepare(file(bytes));
    if (!result.ok) throw new Error(result.message);
    return result.picture;
  };
  return { world, services, persistence, port, prepared };
}
const assetsOf = (state: ReturnType<typeof demoState>): Asset[] => Object.values(state.records.asset) as Asset[];
const bytesOf = async (blob: Blob | undefined): Promise<number[] | undefined> => (blob === undefined ? undefined : [...new Uint8Array(await blob.arrayBuffer())]);

describe('a picture on a mechanism, with real storage', () => {
  it('ONE write holds the asset record and its bytes (the same ChangeSet and blobs reach the write queue, which writes them in one transaction)', async () => {
    const { services, persistence, port, prepared } = await boot();
    const picture = await prepared();
    await persistence.flush();
    const spy = vi.spyOn(persistence, 'writeChanges');
    const result = await port.add(mech(SN2), picture, { altText: 'Backside attack', caption: '' });
    expect(result).toEqual({ ok: true });
    await persistence.flush();
    expect(spy).toHaveBeenCalledTimes(1);
    const [changes, , blobs] = spy.mock.calls[0] ?? [];
    expect(changes?.created.map((ref) => ref.kind)).toEqual(['asset']);
    expect(changes?.updated).toEqual([]);
    expect(blobs).toHaveLength(1);
    expect(blobs?.[0]).toMatchObject({ assetId: changes?.created[0]?.id, sha256: picture.sha256 });
    const [asset] = assetsOf(services.store.getState()).filter((a) => a.attachedTo.some((one) => one.ref.id === SN2));
    expect(asset).toBeDefined();
    expect(await bytesOf(await persistence.getAssetBlob((asset as Asset).id))).toEqual([...PNG]);
    expect(services.status.get().save).toMatchObject({ state: 'saved', pendingRevisions: 0 });
  });

  it('a new picture can be shown at once, before its bytes are durable: both the editor and the inspector read what is held; nothing is held after the save', async () => {
    const { services, persistence, port, prepared } = await boot();
    const picture = await prepared();
    await persistence.flush();
    const adding = port.add(mech(SN2), picture, { altText: 'Backside attack', caption: '' }); // the commit has happened, the write has not
    const asset = assetsOf(services.store.getState()).find((a) => a.altText === 'Backside attack') as Asset;
    expect(services.assets.held(asset.sha256)).toBeDefined();
    const urls: string[] = [];
    vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => (urls.push(String(blob.size)), 'blob:held/1'), revokeObjectURL: () => undefined });
    expect(await port.image(asset.id, 'image/png')).toEqual({ ok: true, url: 'blob:held/1' });
    const inspector = createInspectorPorts(services, { depictions: undefined, facts: undefined, timers: { after: () => () => undefined }, ui: {} } as never, {} as never, {} as never);
    expect(await inspector.assets?.open(asset.id, 'image/png')).toEqual({ ok: true, url: 'blob:held/1' });
    vi.unstubAllGlobals();
    await adding;
    expect(services.assets.held(asset.sha256)).toBeUndefined();
    expect(await bytesOf(await persistence.getAssetBlob(asset.id))).toEqual([...PNG]);
  });

  it('a reload still has the picture, attached, with its bytes', async () => {
    const { world, services, port, prepared } = await boot();
    await port.add(mech(SN2), await prepared(), { altText: 'Backside attack', caption: 'cap' });
    await services.dispose();
    const again = await booter.bootEnv(testEnv({ world }));
    const found = assetsOf(again.store.getState()).filter((a) => a.attachedTo.some((one) => one.ref.id === SN2));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ altText: 'Backside attack', caption: 'cap', assetRole: 'mechanism_image' });
    expect(await bytesOf(await again.persistence?.getAssetBlob((found[0] as Asset).id))).toEqual([...PNG]);
  });

  it('global Undo removes the record and keeps the bytes; Redo brings the record back; the same file again reuses the stored bytes', async () => {
    const { services, persistence, port, prepared } = await boot();
    await port.add(mech(SN2), await prepared(), { altText: 'first', caption: '' });
    const id = (assetsOf(services.store.getState()).find((a) => a.altText === 'first') as Asset).id;
    const hash = (services.store.getState().records.asset[id as never] as Asset).sha256;
    services.store.undo();
    await persistence.flush();
    expect(services.store.getState().records.asset[id as never]).toBeUndefined();
    expect(await persistence.listAssetBlobHashes()).toContain(hash);
    services.store.redo();
    await persistence.flush();
    expect(services.store.getState().records.asset[id as never]).toBeDefined();
    expect(await bytesOf(await persistence.getAssetBlob(id))).toEqual([...PNG]);
  });

  it('equal bytes are stored once (two pictures, one stored file)', async () => {
    const { persistence, port, prepared } = await boot();
    const before = (await persistence.listAssetBlobHashes()).length;
    await port.add(mech(SN2), await prepared(), { altText: 'first', caption: '' });
    await port.add(mech('mec_e2-haloalkane'), await prepared(), { altText: 'second', caption: '' });
    await persistence.flush();
    expect((await persistence.listAssetBlobHashes()).length).toBe(before + 1);
  });

  it('Remove detaches: the record and its bytes stay, attached to nothing, and the reload agrees', async () => {
    const { world, services, persistence, port, prepared } = await boot();
    await port.add(mech(SN2), await prepared(), { altText: 'first', caption: '' });
    const id = (assetsOf(services.store.getState()).find((a) => a.altText === 'first') as Asset).id;
    expect(port.detach(mech(SN2), id)).toEqual({ ok: true });
    await persistence.flush();
    await services.dispose();
    const again = await booter.bootEnv(testEnv({ world }));
    expect((again.store.getState().records.asset[id as never] as Asset).attachedTo).toEqual([]);
    expect(await bytesOf(await again.persistence?.getAssetBlob(id))).toEqual([...PNG]);
  });

  it('a refused picture saves nothing: no revision, no stored bytes', async () => {
    const { services, persistence, port, prepared } = await boot();
    const picture = await prepared();
    const revision = services.store.getRevision();
    const hashes = (await persistence.listAssetBlobHashes()).length;
    expect((await port.add(mech('mec_never-saved'), picture, { altText: 'x', caption: '' })).ok).toBe(false);
    expect((await port.add(mech(SN2), picture, { altText: '  ', caption: '' })).ok).toBe(false);
    await persistence.flush();
    expect(services.store.getRevision()).toBe(revision);
    expect((await persistence.listAssetBlobHashes()).length).toBe(hashes);
  });
});
