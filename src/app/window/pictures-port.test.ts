/**
 * The mechanism editor's pictures port (step 6.5b part 2, ADR-038 addendum P1-P5): a chosen file is checked (size cap, magic bytes, hash) and a
 * refusal is words; a picture is ONE change (the asset record attached to the mechanism, its bytes staged for the same write), the mechanism
 * record is never touched; edit changes alt text and caption; remove detaches and the asset stays; the list is the mechanism's own, oldest first.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import type { Asset, Mechanism } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import type { AssetHost } from '@/app/services/contracts';
import { createPicturesPort } from './pictures-port';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const SN2 = 'mec_sn2-haloalkane';
const SN2_NAME = 'SN2 substitution of a haloalkane';
const file = (bytes: Uint8Array, name = 'My picture.png') => ({ name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer });

function hostOf(calls: string[]): AssetHost {
  let n = 0;
  let clock = 0;
  return {
    stage: { stage: (staged) => calls.push(`stage:${staged.map((s) => s.assetId).join(',')}`), clear: () => calls.push('clear') },
    newId: (prefix) => `${prefix}_test${++n}`,
    now: () => new Date(Date.UTC(2026, 9, 20, 12, 0, ++clock)).toISOString(),
    held: () => undefined,
    saved: async () => {
      calls.push('saved');
    },
  };
}

function rig() {
  const store = createCanonicalStore({ initial: demoState(), revision: 1, validateInitial: false });
  const calls: string[] = [];
  store.subscribe(() => calls.push('commit'));
  const port = createPicturesPort({ store, assets: hostOf(calls), getBlob: async () => undefined });
  return { store, calls, port };
}
type Rig = ReturnType<typeof rig>;
const asAsset = (store: Rig['store'], id: string) => store.getState().records.asset[id as never] as Asset | undefined;
async function prepared(port: Rig['port'], bytes = PNG, name?: string) {
  const result = await port.prepare(file(bytes, name));
  if (!result.ok) throw new Error(result.message);
  return result.picture;
}

describe('prepare', () => {
  it('a PNG passes: the type comes from its magic bytes, the hash is SHA-256 of the bytes', async () => {
    const { port } = rig();
    const picture = await prepared(port);
    expect(picture).toMatchObject({ mediaType: 'image/png', byteSize: PNG.length, filename: 'My picture.png', sha256: createHash('sha256').update(PNG).digest('hex') });
    expect(picture.preview.type).toBe('image/png');
  });
  it('a file over the cap is refused in words that give both sizes, without reading it', async () => {
    const { port } = rig();
    const read = vi.fn();
    const result = await port.prepare({ name: 'big.png', size: 25 * 1024 * 1024, arrayBuffer: read });
    expect(result).toEqual({ ok: false, message: 'This file is 25.0 MB. The largest picture the app keeps is 20 MB.' });
    expect(read).not.toHaveBeenCalled();
  });
  it('a file whose bytes are not a supported picture is refused, whatever its name says', async () => {
    const { port } = rig();
    const result = await port.prepare(file(new TextEncoder().encode('MZ this is not a picture'), 'cheat.png'));
    expect(result).toEqual({ ok: false, message: 'This file is not a picture the app can show: PNG, JPEG, WebP, GIF or SVG.' });
  });
  it('an empty file and an unreadable file are refused in words', async () => {
    const { port } = rig();
    expect(await port.prepare(file(new Uint8Array(0)))).toEqual({ ok: false, message: 'This file is empty.' });
    expect(await port.prepare({ name: 'x.png', size: 10, arrayBuffer: () => Promise.reject(new Error('denied')) })).toEqual({ ok: false, message: 'This file could not be read.' });
  });
  it('a file name is kept as a base name only, never a path', async () => {
    const { port } = rig();
    expect((await prepared(port, PNG, 'C:\\Users\\me\\Pictures\\step 1.png')).filename).toBe('step 1.png');
    expect((await prepared(port, PNG, '../../etc/pic.png')).filename).toBe('pic.png');
  });
});

describe('add', () => {
  it('makes ONE change: the asset record attached to the mechanism, its bytes staged before the commit and cleared after; the mechanism is untouched', async () => {
    const { store, calls, port } = rig();
    const before = store.getState().records.mechanism[SN2 as never] as Mechanism;
    const revision = store.getRevision();
    const result = await port.add(SN2, await prepared(port), { altText: ' Backside attack ', caption: 'The *nucleophile* arrives.', width: 64, height: 32 });
    expect(result).toEqual({ ok: true });
    expect(store.getRevision()).toBe(revision + 1);
    expect(calls).toEqual(['stage:ast_test1', 'commit', 'clear', 'saved']); // the answer waits until the write queue has the bytes
    expect(store.getState().records.mechanism[SN2 as never]).toBe(before);
    expect(asAsset(store, 'ast_test1')).toMatchObject({
      kind: 'asset',
      mediaType: 'image/png',
      byteSize: PNG.length,
      sha256: createHash('sha256').update(PNG).digest('hex'),
      assetRole: 'mechanism_image',
      attachedTo: [{ ref: { kind: 'mechanism', id: SN2 } }],
      altText: ' Backside attack ',
      caption: 'The *nucleophile* arrives.',
      width: 64,
      height: 32,
      filename: 'My picture.png',
      provenance: { origin: 'user' },
      review: { lifecycle: 'draft', status: 'unreviewed' },
    });
    expect(store.historyLabels().undo[0]).toBe(`Add picture to ${SN2_NAME}`);
  });
  it('alt text is required; a blank caption is left out; nothing is saved when refused', async () => {
    const { store, port } = rig();
    const revision = store.getRevision();
    expect(await port.add(SN2, await prepared(port), { altText: '   ', caption: '' })).toEqual({ ok: false, message: 'Write the alt text: it describes what the picture shows.' });
    expect(store.getRevision()).toBe(revision);
    await port.add(SN2, await prepared(port), { altText: 'x', caption: '  ' });
    expect(Object.hasOwn(asAsset(store, 'ast_test1') as object, 'caption')).toBe(false);
  });
  it('a mechanism that is not saved yet, and a read-only tab, are refused in words; nothing is saved or staged', async () => {
    const { store, calls, port } = rig();
    const revision = store.getRevision();
    const picture = await prepared(port);
    expect(await port.add('mec_new-never-saved', picture, { altText: 'x', caption: '' })).toEqual({ ok: false, message: 'Save the mechanism once before adding pictures.' });
    const readOnly = createCanonicalStore({ initial: demoState(), revision: 1, validateInitial: false, readOnly: () => true });
    const other = createPicturesPort({ store: readOnly, assets: hostOf([]), getBlob: async () => undefined });
    const refused = await other.add(SN2, picture, { altText: 'x', caption: '' });
    expect(refused.ok).toBe(false);
    expect(store.getRevision()).toBe(revision);
    expect(calls).toEqual([]);
  });
  it('global Undo removes the asset record, Redo brings it back', async () => {
    const { store, port } = rig();
    await port.add(SN2, await prepared(port), { altText: 'x', caption: '' });
    store.undo();
    expect(asAsset(store, 'ast_test1')).toBeUndefined();
    store.redo();
    expect(asAsset(store, 'ast_test1')?.attachedTo).toHaveLength(1);
  });
});

describe('list, edit and detach', () => {
  it('lists the pictures of THIS mechanism, oldest first', async () => {
    const { port } = rig();
    await port.add(SN2, await prepared(port), { altText: 'first', caption: '' });
    await port.add('mec_e2-haloalkane', await prepared(port), { altText: 'elsewhere', caption: '' });
    await port.add(SN2, await prepared(port), { altText: 'second', caption: 'cap' });
    expect(port.list(SN2).map((p) => [p.id, p.altText, p.caption, p.filename])).toEqual([
      ['ast_test1', 'first', '', 'My picture.png'],
      ['ast_test3', 'second', 'cap', 'My picture.png'],
    ]);
    expect(port.list('mec_aldol-ethanal')).toEqual([]);
  });
  it('edit changes alt text and caption only (a blank caption is removed) and is one undoable entry', async () => {
    const { store, port } = rig();
    await port.add(SN2, await prepared(port), { altText: 'first', caption: 'old' });
    expect(await port.edit('ast_test1', { altText: 'new alt', caption: '' })).toEqual({ ok: true });
    const asset = asAsset(store, 'ast_test1') as Asset;
    expect(asset.altText).toBe('new alt');
    expect(Object.hasOwn(asset, 'caption')).toBe(false);
    expect(asset.sha256).toBe(createHash('sha256').update(PNG).digest('hex'));
    expect(store.historyLabels().undo[0]).toBe(`Edit picture of ${SN2_NAME}`);
    expect(await port.edit('ast_test1', { altText: ' ', caption: '' })).toEqual({ ok: false, message: 'Write the alt text: it describes what the picture shows.' });
    store.undo();
    expect(asAsset(store, 'ast_test1')?.caption).toBe('old');
  });
  it('detach keeps the asset record, attached to nothing; Undo restores the attachment', async () => {
    const { store, port } = rig();
    await port.add(SN2, await prepared(port), { altText: 'first', caption: '' });
    expect(port.detach(SN2, 'ast_test1')).toEqual({ ok: true });
    expect(asAsset(store, 'ast_test1')?.attachedTo).toEqual([]);
    expect(port.list(SN2)).toEqual([]);
    expect(store.historyLabels().undo[0]).toBe(`Remove picture from ${SN2_NAME}`);
    store.undo();
    expect(port.list(SN2).map((p) => p.id)).toEqual(['ast_test1']);
  });
});
