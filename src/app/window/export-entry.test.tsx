// @vitest-environment jsdom
/**
 * The ways into the export screen (step 5.9b): the File menu's "Export...", the palette command, the Dataset mode, the "Export now"
 * of a failed-save banner and the "Export a backup" of the storage warning. Each opens the SAME screen; a read-only or follower tab
 * can export (it only reads); the download is a Blob saved through an anchor.
 */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PALETTE_DEBOUNCE_MS } from '@/features/search';
import { fakeLayout } from '@/test-support/inspector-kit';
import { tierState } from '@/test-support/perf-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { INITIAL_STATUS } from '@/app/services/status';
import { bannersOf } from './banners';

const OK = { ok: true, result: { bytes: new TextEncoder().encode('{}\n'), counts: { species: 1 }, missingAssets: [], missingReferences: [] }, revision: 1, inProcess: false };

beforeAll(() => {
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
});
beforeEach(() => {
  // jsdom has no object URLs and does not follow an anchor: both are stubbed so a finished export can be saved.
  Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const app = (options: Parameters<typeof fakeApp>[0] = {}): FakeApp => {
  const a = fakeApp({ state: tierState('tiny', 'dense'), ...options });
  a.flows.export.mockResolvedValue(OK);
  return a;
};
const button = (name: string): HTMLElement => screen.getByRole('button', { name });
/** The screen is a lazy chunk: wait for its options, then take the dialog that holds them. */
const exportDialog = async (): Promise<HTMLElement> => {
  await screen.findByRole('group', { name: 'What to include' });
  return screen.getByRole('dialog', { name: 'Export your data' });
};

describe('the File menu', () => {
  it('"Export..." opens the export screen, with the options in words', async () => {
    renderWithApp(app());
    fireEvent.pointerDown(button('File'), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Export\.\.\./ }));
    const dialog = await exportDialog();
    expect(within(dialog).getByRole('group', { name: 'What to include' })).toBeTruthy();
    expect((within(dialog).getByRole('textbox', { name: 'File name' }) as HTMLInputElement).value).toMatch(/-2026-\d\d-\d\d$/);
  });

  it.each([
    ['a read-only tab', { mode: 'read_only' as const, reason: 'another version is open' }],
    ['a follower tab', { mode: 'follower' as const, reason: 'another tab is the writer' }],
    ['a session-only tab', { mode: 'session_only' as const, reason: 'no storage' }],
  ])('%s can export: it only reads', async (_name, status) => {
    renderWithApp(app({ status } as never));
    fireEvent.pointerDown(button('File'), { button: 0, ctrlKey: false });
    const item = await screen.findByRole('menuitem', { name: /Export\.\.\./ });
    expect(item.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(item);
    fireEvent.click(within(await exportDialog()).getByRole('button', { name: 'Export' }));
    await screen.findByRole('dialog', { name: 'Export finished' });
  });
});

describe('the palette and the Dataset mode', () => {
  it('"Export..." is a command and opens the same screen', async () => {
    renderWithApp(app());
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Search' });
    fireEvent.change(within(palette).getByRole('combobox'), { target: { value: '> export' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, PALETTE_DEBOUNCE_MS + 50));
    });
    fireEvent.click(await within(palette).findByRole('option', { name: /Export\.\.\./ }));
    await exportDialog();
  });

  it('the Dataset mode has an Export button', async () => {
    renderWithApp(app());
    fireEvent.click(button('Dataset'));
    fireEvent.click(within(screen.getByRole('region', { name: 'Back up the data' })).getByRole('button', { name: 'Export...' }));
    await exportDialog();
  });
});

describe('the banners', () => {
  const failedSave = { state: 'failed', lastError: 'QuotaExceededError', failureReason: null, pendingRevisions: 2, lastSavedRevision: 3 };

  it('a failed save offers "Export now" and it opens the export screen', async () => {
    renderWithApp(app({ status: { save: failedSave } as never }));
    const notices = screen.getByRole('region', { name: 'Notices' });
    expect(notices.textContent).toContain('NOT saved');
    fireEvent.click(within(notices).getByRole('button', { name: 'Export now' }));
    await exportDialog();
  });

  it('the storage warning offers "Export a backup" beside Dismiss', async () => {
    renderWithApp(app({ status: { storage: { persistence: 'refused', message: null } } as never }));
    const notices = screen.getByRole('region', { name: 'Notices' });
    expect(within(notices).getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    fireEvent.click(within(notices).getByRole('button', { name: 'Export a backup' }));
    await exportDialog();
  });

  it('the revision-gap banner keeps its own button and a healthy status shows none of these', () => {
    const gap = bannersOf({ ...INITIAL_STATUS, save: { ...failedSave, failureReason: 'revision_gap' } } as never);
    expect(gap.map((b) => b.id)).toEqual(['revision_gap']);
    expect(bannersOf(INITIAL_STATUS).map((b) => b.id)).not.toContain('save_failed');
  });
});

describe('the download', () => {
  it('a finished export is saved through an anchor with a download name, from a Blob', async () => {
    const created: Blob[] = [];
    const created_url = vi.fn((blob: Blob) => (created.push(blob), 'blob:test'));
    const revoked = vi.fn();
    Object.assign(URL, { createObjectURL: created_url, revokeObjectURL: revoked });
    const clicked: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.href });
    });
    renderWithApp(app());
    fireEvent.click(button('Dataset'));
    fireEvent.click(button('Export...'));
    fireEvent.click(within(await exportDialog()).getByRole('button', { name: 'Export' }));
    await screen.findByRole('dialog', { name: 'Export finished' });
    expect(created).toHaveLength(1);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toMatch(/\.orn\.json$/);
    expect(clicked[0]?.href).toBe('blob:test');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
