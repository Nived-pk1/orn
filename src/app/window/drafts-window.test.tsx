// @vitest-environment jsdom
/** "Drafts (N)" in the File menu (and on the phone in More > File) opens the drafts list; the start-up line's "Show drafts" does too (ADR-040). */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PHONE_QUERIES } from '@/ui/hooks';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { createLocalTimeFormatter } from './local-time';

beforeAll(async () => {
  await import('@/features/workbench/layer'); // the drafts list is a lazy chunk (ADR-040): load it once so findBy* never races a slow machine
  stubDialog();
  fakeLayout();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function draft(app: FakeApp): string {
  const id = Object.keys(app.store.getState().records.species).sort()[0] as string;
  const opened = app.drafts.open({ kind: 'species', id });
  if (!opened.ok) throw new Error(opened.message);
  app.drafts.edit(opened.id, (d) => void ((d.names as { canonical: string }).canonical = 'Edited'));
  return opened.id;
}

describe('Drafts in the window', () => {
  it('the File menu says "Drafts (0)" with none, and its list says there are none', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'File' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Drafts (0)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Drafts' });
    expect(within(dialog).getByText('No unfinished drafts.')).toBeTruthy();
  });

  it('the File menu counts the drafts; the list shows them and discarding asks first', async () => {
    const app = fakeApp({ state: demoState() });
    draft(app);
    renderWithApp(app);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'File' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Drafts (1)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Drafts' });
    const row = within(dialog).getByRole('listitem');
    expect(row.textContent).toContain('Edited');
    fireEvent.click(within(row).getByRole('button', { name: 'Discard' }));
    expect(within(dialog).getByText('Discard this draft? It cannot be undone.')).toBeTruthy();
    expect(app.drafts.view().count).toBe(1);
    await act(async () => fireEvent.click(within(within(dialog).getByRole('group', { name: 'Discard this draft?' })).getByRole('button', { name: 'Discard' })));
    expect(app.drafts.view().count).toBe(0);
    expect(within(dialog).getByText('No unfinished drafts.')).toBeTruthy();
  });

  it('the start-up line offers "Show drafts", which opens the same list', async () => {
    const app = fakeApp({ state: demoState() });
    draft(app);
    renderWithApp(app);
    const region = screen.getByRole('region', { name: 'Start-up report' });
    expect(region.textContent).toContain('1 unfinished draft');
    fireEvent.click(within(region).getByRole('button', { name: 'Show drafts' }));
    expect(await screen.findByRole('dialog', { name: 'Drafts' })).toBeTruthy();
  });

  it('on a phone it is under More > File', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const app = fakeApp({ state: demoState() });
    draft(app);
    renderWithApp(app);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const file = within(within(screen.getByRole('dialog', { name: 'More' })).getByRole('region', { name: 'File' }));
    fireEvent.click(file.getByRole('button', { name: 'Drafts (1)' }));
    expect(await screen.findByRole('dialog', { name: 'Drafts' })).toBeTruthy();
  });
});

describe('Times in the drafts list and the Workbench are local (step 6.3 review)', () => {
  it('the list and the Workbench page show the injected zone, never "UTC" (zone pinned to India)', async () => {
    const app = fakeApp({ state: demoState() });
    app.value.formatTime = createLocalTimeFormatter('Asia/Kolkata');
    draft(app);
    renderWithApp(app);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: /Workbench/ }));
    const page = screen.getByRole('region', { name: 'Workbench' });
    expect(page.textContent).toMatch(/last changed \d{4}-\d{2}-\d{2} \d{2}:\d{2} GMT\+5:30/);
    expect(page.textContent).not.toContain('UTC');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'File' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Drafts (1)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Drafts' });
    expect(dialog.textContent).toMatch(/edited \d{4}-\d{2}-\d{2} \d{2}:\d{2} GMT\+5:30/);
    expect(dialog.textContent).not.toContain('UTC');
  });
});
