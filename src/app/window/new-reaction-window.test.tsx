// @vitest-environment jsdom
/**
 * New reaction through the real window (step 6.3a decision D4): the Workbench page, the palette command and More on a phone open the editor on
 * a blank reaction; Save is refused until a name and a scope are given; without outcomes it saves as a draft with the RXN-002 warning; Published
 * is refused by the store's gate; ONE history entry that Undo removes.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reaction } from '@/core/schema';
import { PHONE_QUERIES } from '@/ui/hooks';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { prefetchPalette } from './lazy-palette';
import { buildCommands, type CommandDeps } from './palette-commands';

beforeAll(async () => {
  await prefetchPalette();
  await import('@/features/workbench/layer');
  await import('./editor-session'); // the editor opens through this lazy chunk (step 6.5a)
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
  vi.unstubAllGlobals();
});

const reactions = (app: FakeApp): Reaction[] => Object.values(app.store.getState().records.reaction) as Reaction[];
const named = (app: FakeApp, name: string): Reaction | undefined => reactions(app).find((r) => r.name === name);
const openWorkbench = (): void => {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: /Workbench/ }));
};
const editor = (): Promise<HTMLElement> => screen.findByRole('dialog', { name: 'New reaction' });

describe('New reaction (desktop)', () => {
  it('opens on a blank reaction; Save is refused until a name AND a scope are given; then ONE entry that Undo removes, with the RXN-002 warning', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New reaction' }));
    const dialog = await editor();
    const before = reactions(app).length;
    expect((within(dialog).getByLabelText('Scope (required)') as HTMLSelectElement).value).toBe('');
    expect(within(within(dialog).getByLabelText('Scope (required)')).getByRole('option', { name: 'Choose a scope' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    const refused = await within(dialog).findByRole('heading', { name: 'Save was refused' });
    expect(refused).toBeTruthy();
    expect(reactions(app)).toHaveLength(before);
    fireEvent.change(within(dialog).getByLabelText('Name (required)'), { target: { value: 'Propan-1-ol + PCC' } });
    fireEvent.change(within(dialog).getByLabelText('Scope (required)'), { target: { value: 'specific' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New reaction' })).toBeNull());
    const created = named(app, 'Propan-1-ol + PCC') as Reaction;
    expect(created).toMatchObject({ scope: 'specific', participants: [], stages: [], outcomes: [], provenance: { origin: 'user' }, review: { lifecycle: 'draft', status: 'unreviewed' } });
    expect(app.store.historyLabels().undo.at(-1)).toBe('Create reaction Propan-1-ol + PCC');
    const warnings = app.store.findings.bySubject({ kind: 'reaction', id: created.id }).filter((f) => f.severity === 'warning').map((f) => f.ruleId);
    expect(warnings).toContain('RXN-002');
    app.store.undo();
    expect(named(app, 'Propan-1-ol + PCC')).toBeUndefined();
  });

  it('Close keeps the draft; the Workbench lists it by its name (a reaction has `name`, not `names`)', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New reaction' }));
    const dialog = await editor();
    fireEvent.change(within(dialog).getByLabelText('Name (required)'), { target: { value: 'Unfinished one' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close (keeps the draft)' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New reaction' })).toBeNull());
    expect(within(screen.getByRole('list', { name: 'Drafts' })).getByText(/Unfinished one \(reaction, new,/)).toBeTruthy();
  });

  it('Published is refused by the gate while there is no outcome; the dialog stays open with the findings', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New reaction' }));
    const dialog = await editor();
    fireEvent.change(within(dialog).getByLabelText('Name (required)'), { target: { value: 'Too early' } });
    fireEvent.change(within(dialog).getByLabelText('Scope (required)'), { target: { value: 'specific' } });
    fireEvent.change(within(dialog).getByLabelText('Lifecycle'), { target: { value: 'published' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    expect(within(dialog).getAllByText(/has no outcome with a product/).length).toBeGreaterThan(0);
    expect(named(app, 'Too early')).toBeUndefined();
  });

  it('a read-only tab says why on New reaction; the palette lists the command', () => {
    renderWithApp(fakeApp({ state: demoState(), status: { mode: 'follower', reason: 'other_tab_is_writer' } }));
    openWorkbench();
    expect(screen.getByRole('button', { name: 'New reaction', description: 'This tab is read-only: edit in the tab that is saving' }).getAttribute('aria-disabled')).toBe('true');
    const run = vi.fn();
    const base = { mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writer', writerReason: null, importReason: undefined, askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined, ui: fakeApp({ state: demoState() }).navigator.ports.ui, exams: { options: [], omitted: 0 } };
    const command = buildCommands({ ...base, newKinds: [{ id: 'new-reaction', title: 'New reaction', keywords: [], reason: undefined, run }], } as unknown as CommandDeps).find((c) => c.id === 'new-reaction');
    expect(command?.title).toBe('New reaction');
    command?.run();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('New reaction on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  });

  it('More > New reaction opens the editor full-screen; Save works', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    renderWithApp(app);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'More' })).getByRole('button', { name: 'New reaction' }));
    const dialog = await editor();
    fireEvent.change(within(dialog).getByLabelText('Name (required)'), { target: { value: 'Phone reaction' } });
    fireEvent.change(within(dialog).getByLabelText('Scope (required)'), { target: { value: 'specific' } });
    expect(within(dialog).getByRole('list', { name: 'Participants' })).toBeTruthy();
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(named(app, 'Phone reaction')).toBeDefined());
  });
});
