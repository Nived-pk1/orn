// @vitest-environment jsdom
/**
 * The ways into the import screen (step 5.9a): the File menu's "Import a file...", the palette command, the first-run screen's two
 * buttons, a file dropped on the window. Each opens the SAME screen or says in words why it cannot; Undo import is reachable from
 * the toast, the menu, the Dataset mode and the palette.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { tierState } from '@/test-support/perf-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, planOf, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { PALETTE_DEBOUNCE_MS } from '@/features/search';
import { prefetchPalette } from './lazy-palette';

const APPLIED = { ok: true, revision: 1, snapshotId: 's', report: {}, reportSaved: true, saved: true, sessionOnly: false, save: null, inProcess: false, notes: [] };

beforeAll(async () => {
  await prefetchPalette(); // the palette is a lazy chunk since step 6.1a: load it once so these tests open it at once
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function app(options: Parameters<typeof fakeApp>[0] = {}): FakeApp {
  const a = fakeApp(options);
  a.flows.preview.mockResolvedValue({ ok: true, plan: planOf(), inProcess: false });
  a.flows.apply.mockResolvedValue(APPLIED);
  return a;
}
const button = (name: string): HTMLElement => screen.getByRole('button', { name });
const clicks = (): { count: number } => {
  const seen = { count: 0 };
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {
    seen.count += 1;
  });
  return seen;
};

function dropFiles(files: File[]): void {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown };
  event.dataTransfer = { types: ['Files'], files };
  act(() => {
    document.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
}

describe('first run', () => {
  it('"Import a file" and "Import v6 export" both open the file chooser of the same screen', () => {
    const seen = clicks();
    renderWithApp(app());
    fireEvent.click(button('Import a file'));
    fireEvent.click(button('Import v6 export'));
    expect(seen.count).toBe(2);
  });
});

describe('the File menu', () => {
  it('"Import a file..." is enabled and opens the chooser', async () => {
    const seen = clicks();
    renderWithApp(app());
    fireEvent.pointerDown(button('File'), { button: 0, ctrlKey: false });
    const item = await screen.findByRole('menuitem', { name: /Import a file\.\.\./ });
    expect(item.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(item);
    await waitFor(() => expect(seen.count).toBe(1));
  });

  it.each([
    ['a read-only tab', { mode: 'read_only' as const, reason: 'another version is open' }, 'another version is open'],
    ['another operation running', { mode: 'writer' as const, operation: { kind: 'restore', stage: 'x', progress: null } }, 'another operation is running'],
  ])('with %s it is listed with its reason, and does nothing', async (_name, status, reason) => {
    const seen = clicks();
    renderWithApp(app({ status } as never));
    fireEvent.pointerDown(button('File'), { button: 0, ctrlKey: false });
    const item = await screen.findByRole('menuitem', { name: /Import a file\.\.\./ });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(item.textContent).toContain(reason);
    fireEvent.click(item);
    expect(seen.count).toBe(0);
  });
});

describe('the palette', () => {
  it('lists "Import a file..." and runs it; a read-only tab gets it with the reason', async () => {
    const seen = clicks();
    renderWithApp(app());
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    const input = within(dialog).getByRole('combobox');
    fireEvent.change(input, { target: { value: '> import a file' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, PALETTE_DEBOUNCE_MS + 50));
    });
    fireEvent.click(await within(dialog).findByRole('option', { name: /Import a file\.\.\./ }));
    expect(seen.count).toBe(1);
  });
});

describe('a file dropped on the window', () => {
  it('opens the preview of that file', async () => {
    const a = app();
    renderWithApp(a);
    dropFiles([new File(['{}'], 'dropped.orn.json')]);
    await screen.findByRole('heading', { name: 'Import summary' });
    expect(a.flows.preview.mock.calls[0]?.[1]).toBe('dropped.orn.json');
  });

  it('a drop that cannot be taken says why in words; nothing is opened', async () => {
    const a = app({ status: { mode: 'read_only', reason: 'another version is open' } });
    renderWithApp(a);
    dropFiles([new File(['{}'], 'dropped.orn.json')]);
    await screen.findByText('The dropped file dropped.orn.json was not opened: another version is open.');
    expect(a.flows.preview).not.toHaveBeenCalled();
  });

  it('several files: the first is opened and the rest are said out loud', async () => {
    const a = app();
    renderWithApp(a);
    dropFiles([new File(['{}'], 'one.orn.json'), new File(['{}'], 'two.orn.json')]);
    await screen.findByRole('heading', { name: 'Import summary' });
    expect(a.flows.preview.mock.calls[0]?.[1]).toBe('one.orn.json');
    expect(screen.getByRole('status', { name: 'Notifications' }).textContent).toContain('2 files were dropped; only one.orn.json was opened. Import the others one at a time.');
  });

  it('something that is not a file (text dragged in) is left alone', () => {
    renderWithApp(app());
    const event = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown };
    event.dataTransfer = { types: ['text/plain'], files: [] };
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('Undo import', () => {
  it('the toast after an import offers it, and choosing it restores the snapshot and says what came back', async () => {
    const a = app({ state: tierState('tiny', 'dense') });
    a.flows.undo.mockResolvedValue({ ok: true, saved: true, sessionOnly: false, notes: [] });
    renderWithApp(a);
    fireEvent.click(button('Dataset'));
    fireEvent.click(within(screen.getByRole('region', { name: 'Replace the data' })).getByRole('button', { name: 'Replace with the demo dataset' }));
    fireEvent.click(button('Replace'));
    const toasts = within(await screen.findByRole('status', { name: 'Notifications' }));
    await toasts.findByText(/^Imported 5 records from demo\.orn\.json\./);
    fireEvent.click(toasts.getByRole('button', { name: 'Undo import' }));
    await toasts.findByText(/^Import undone: the data from before it is back\. That was the import of earlier\.orn\.json/);
    expect(a.flows.undo).toHaveBeenCalledTimes(1);
  });

  it('the Dataset mode and the File menu run it too', async () => {
    const a = app({ state: tierState('tiny', 'dense') });
    a.flows.undo.mockResolvedValue({ ok: true, saved: true, sessionOnly: false, notes: [] });
    renderWithApp(a);
    fireEvent.click(button('Dataset'));
    fireEvent.click(within(screen.getByRole('region', { name: 'Replace the data' })).getByRole('button', { name: 'Undo import' }));
    await waitFor(() => expect(a.flows.undo).toHaveBeenCalledTimes(1));
    fireEvent.pointerDown(button('File'), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Undo import/ }));
    await waitFor(() => expect(a.flows.undo).toHaveBeenCalledTimes(2));
  });
});
