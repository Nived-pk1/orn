// @vitest-environment jsdom
/**
 * Mechanism pictures through the real window (step 6.5b part 2, ADR-038 addendum P1-P5): a picture added to a demo mechanism from its editor is
 * saved AT ONCE (its asset record attached to the mechanism, its bytes handed to the write path) while the editor's draft and the mechanism
 * record stay as they were; global Undo removes the record and keeps the bytes, Redo brings it back; Remove detaches and the asset stays;
 * equal bytes are stored once. The write path is a stand-in that keeps the staged bytes by hash (the real one is in tests/integration).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, Mechanism } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { PNG_BYTES } from '@/test-support/pictures-kit';
import { fakeApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { AppProvider } from './context';
import { Window } from './window';
import type { ParsedAsset } from '@/io';

const SN2 = 'mec_sn2-haloalkane';
const SN2_NAME = 'SN2 substitution of a haloalkane';

beforeAll(async () => {
  await import('@/features/workbench/layer');
  await import('./editor-session');
  stubDialog();
  fakeLayout();
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  const proto = Element.prototype as unknown as { scrollIntoView?: () => void; hasPointerCapture?: () => boolean; releasePointerCapture?: () => void };
  proto.scrollIntoView ??= () => undefined;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
  // and the picture dialog's first render, which only this file opens
  const rig = appWithPictures();
  fireEvent.click(within(await openEditor(rig)).getByRole('button', { name: 'Add picture' }));
  await screen.findByRole('dialog', { name: 'Add picture' }, { timeout: 30_000 });
  cleanup();
});
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:window/1');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

/** The app with the picture host: staged bytes are kept by hash when the commit that creates their record happens (what the write queue does). */
function appWithPictures() {
  const app = fakeApp({ state: demoState() });
  const blobs = new Map<string, Blob>();
  let staged: readonly ParsedAsset[] = [];
  let n = 0;
  app.store.subscribe((changes) => {
    for (const ref of changes.created) {
      const found = staged.find((asset) => asset.assetId === ref.id);
      const record = ref.kind === 'asset' ? (app.store.getState().records.asset[ref.id as never] as Asset | undefined) : undefined;
      if (found !== undefined && record !== undefined && !blobs.has(record.sha256)) blobs.set(record.sha256, new Blob([found.bytes as BlobPart]));
    }
  });
  const assets = {
    stage: { stage: (list: readonly ParsedAsset[]) => (staged = list), clear: () => (staged = []) },
    newId: (prefix: string) => `${prefix}_win${++n}`,
    now: () => new Date(Date.UTC(2026, 9, 20, 12, 0, n)).toISOString(),
    held: () => undefined,
    saved: async () => undefined,
  };
  const persistence = { getAssetBlob: async (id: string) => blobs.get((app.store.getState().records.asset[id as never] as Asset | undefined)?.sha256 ?? '') };
  const value = { ...app.value, services: { ...app.value.services, assets, persistence } as unknown as typeof app.value.services };
  return { app, blobs, value };
}
type Rig = ReturnType<typeof appWithPictures>;

const assetsOf = (app: FakeApp): Asset[] => Object.values(app.store.getState().records.asset) as Asset[];
const mine = (app: FakeApp): Asset[] => assetsOf(app).filter((a) => a.id.startsWith('ast_win'));
const pngFile = (name = 'step.png') => {
  const file = new File([PNG_BYTES], name, { type: 'image/png' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => PNG_BYTES.buffer.slice(PNG_BYTES.byteOffset, PNG_BYTES.byteOffset + PNG_BYTES.length) });
  return file;
};

async function openEditor(rig: Rig): Promise<HTMLElement> {
  rig.app.panels.getState().setInspectorOpen(true);
  render(
    <AppProvider value={rig.value}>
      <Window />
    </AppProvider>,
  );
  act(() => rig.app.inspectorStore.getState().open({ kind: 'mechanism', id: SN2 }));
  const inspector = await screen.findByRole('complementary', { name: 'Inspector' });
  fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
  return screen.findByRole('dialog', { name: `Edit ${SN2_NAME}` });
}

async function addPicture(editor: HTMLElement, alt: string, caption = ''): Promise<void> {
  fireEvent.click(within(editor).getByRole('button', { name: 'Add picture' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add picture' });
  fireEvent.change(within(dialog).getByLabelText('Picture file'), { target: { files: [pngFile()] } });
  await within(dialog).findByRole('img', { name: 'Preview of the chosen picture' });
  fireEvent.change(within(dialog).getByLabelText('Alt text (required)'), { target: { value: alt } });
  if (caption !== '') fireEvent.change(within(dialog).getByLabelText('Caption (optional)'), { target: { value: caption } });
  await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Add picture' })));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add picture' })).toBeNull());
}

describe('a picture on a demo mechanism', () => {
  it('is saved at once: one change holds the asset record and the bytes; the mechanism and the editor draft are untouched', async () => {
    const rig = appWithPictures();
    const { app } = rig;
    const before = app.store.getState().records.mechanism[SN2 as never] as Mechanism;
    const editor = await openEditor(rig);
    const revision = app.store.getRevision();
    await addPicture(editor, 'Backside attack', 'The *nucleophile* arrives.');
    expect(app.store.getRevision()).toBe(revision + 1);
    const [asset] = mine(app);
    expect(asset).toMatchObject({ mediaType: 'image/png', assetRole: 'mechanism_image', altText: 'Backside attack', caption: 'The *nucleophile* arrives.', attachedTo: [{ ref: { kind: 'mechanism', id: SN2 } }] });
    expect(rig.blobs.size).toBe(1);
    expect(app.store.getState().records.mechanism[SN2 as never]).toBe(before);
    // the editor's own draft never held it: its local Undo has nothing to undo
    expect(within(editor).getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe('true');
    expect(await within(editor).findByRole('img', { name: 'Backside attack' })).toBeTruthy();
  });

  it('global Undo removes the asset record and keeps the bytes; Redo brings it back', async () => {
    const rig = appWithPictures();
    const editor = await openEditor(rig);
    await addPicture(editor, 'Backside attack');
    act(() => void rig.app.store.undo());
    expect(mine(rig.app)).toEqual([]);
    expect(rig.blobs.size).toBe(1);
    await waitFor(() => expect(within(editor).getByText('No pictures yet.')).toBeTruthy());
    act(() => void rig.app.store.redo());
    expect(mine(rig.app)).toHaveLength(1);
    expect(await within(editor).findByRole('img', { name: 'Backside attack' })).toBeTruthy();
  });

  it('Remove asks, then detaches: the asset stays in the data attached to nothing; Undo restores the attachment', async () => {
    const rig = appWithPictures();
    const editor = await openEditor(rig);
    await addPicture(editor, 'Backside attack');
    fireEvent.click(within(editor).getByRole('button', { name: 'Remove picture 1 from this mechanism' }));
    fireEvent.click(within(editor).getByRole('button', { name: 'Remove from this mechanism' }));
    expect(mine(rig.app)).toHaveLength(1);
    expect(mine(rig.app)[0]?.attachedTo).toEqual([]);
    expect(within(editor).getByText('Removed from this mechanism. The picture stays in your data until deleting arrives (step 6.8).')).toBeTruthy();
    expect(rig.app.store.findings.bySubject({ kind: 'asset', id: mine(rig.app)[0]?.id as never }).map((f) => f.ruleId)).toContain('AST-001');
    act(() => void rig.app.store.undo());
    expect(mine(rig.app)[0]?.attachedTo).toHaveLength(1);
  });

  it('equal bytes added twice are two pictures and ONE stored file', async () => {
    const rig = appWithPictures();
    const editor = await openEditor(rig);
    await addPicture(editor, 'first');
    await addPicture(editor, 'second');
    expect(mine(rig.app)).toHaveLength(2);
    expect(rig.blobs.size).toBe(1);
  });

  it('Edit changes the alt text and caption through the same save', async () => {
    const rig = appWithPictures();
    const editor = await openEditor(rig);
    await addPicture(editor, 'first', 'old');
    fireEvent.click(within(editor).getByRole('button', { name: 'Edit picture 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit picture' });
    fireEvent.change(within(dialog).getByLabelText('Alt text (required)'), { target: { value: 'better alt' } });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save picture' })));
    await waitFor(() => expect(mine(rig.app)[0]?.altText).toBe('better alt'));
    expect(rig.app.store.historyLabels().undo[0]).toBe(`Edit picture of ${SN2_NAME}`);
  });
});
