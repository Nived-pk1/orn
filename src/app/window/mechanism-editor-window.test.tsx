// @vitest-environment jsdom
/**
 * The mechanism editor through the real window (step 6.5a part 3): New mechanism from the Workbench page, the palette and More on a phone; a
 * mechanism with only a summary saves (MEC-001 is an INFO); the inspector's Edit opens a demo mechanism, a variant is renamed, Save, the
 * inspector's mechanism view shows it, and Undo restores it; a read-only tab says why.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mechanism } from '@/core/schema';
import { PHONE_QUERIES } from '@/ui/hooks';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { prefetchPalette } from './lazy-palette';
import { buildCommands, type CommandDeps } from './palette-commands';

const E2 = 'mec_e2-haloalkane';

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

const mechanisms = (app: FakeApp): Mechanism[] => Object.values(app.store.getState().records.mechanism) as Mechanism[];
const named = (app: FakeApp, name: string): Mechanism | undefined => mechanisms(app).find((m) => m.name === name);
const openWorkbench = (): void => {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: /Workbench/ }));
};
const newEditor = (): Promise<HTMLElement> => screen.findByRole('dialog', { name: 'New mechanism' });

describe('New mechanism (desktop)', () => {
  it('opens on a blank mechanism; Save is refused without a name; a name and a summary alone save as ONE entry that Undo removes', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New mechanism' }));
    const dialog = await newEditor();
    const before = mechanisms(app).length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    expect(mechanisms(app)).toHaveLength(before);
    fireEvent.change(within(dialog).getByLabelText('Name (required)'), { target: { value: 'Oxidation by PCC (outline)' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Summary' }), { target: { value: 'PCC stops at the aldehyde.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New mechanism' })).toBeNull());
    const created = named(app, 'Oxidation by PCC (outline)') as Mechanism;
    expect(created).toMatchObject({ summary: 'PCC stops at the aldehyde.', variants: [], provenance: { origin: 'user' }, review: { lifecycle: 'draft', status: 'unreviewed' } });
    expect(app.store.historyLabels().undo.at(-1)).toBe('Create mechanism Oxidation by PCC (outline)');
    const findings = app.store.findings.bySubject({ kind: 'mechanism', id: created.id });
    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(findings.map((f) => f.ruleId)).toContain('MEC-001');
    app.store.undo();
    expect(named(app, 'Oxidation by PCC (outline)')).toBeUndefined();
  });

  it('the palette lists "New mechanism"; a read-only tab says why on the Workbench button', () => {
    renderWithApp(fakeApp({ state: demoState(), status: { mode: 'follower', reason: 'other_tab_is_writer' } }));
    openWorkbench();
    expect(screen.getByRole('button', { name: 'New mechanism', description: 'This tab is read-only: edit in the tab that is saving' }).getAttribute('aria-disabled')).toBe('true');
    const run = vi.fn();
    const base = { mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writer', writerReason: null, importReason: undefined, askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined, ui: fakeApp({ state: demoState() }).navigator.ports.ui, exams: { options: [], omitted: 0 } };
    const command = buildCommands({ ...base, newMechanism: { reason: undefined, run } } as unknown as CommandDeps).find((c) => c.id === 'new-mechanism');
    expect(command?.title).toBe('New mechanism');
    command?.run();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('editing a demo mechanism', () => {
  it('the inspector Edit opens it; a variant is renamed and saved; the inspector view shows it; Undo restores it', async () => {
    const app = fakeApp({ state: demoState() });
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    act(() => app.inspectorStore.getState().open({ kind: 'mechanism', id: E2 }));
    const inspector = await screen.findByRole('complementary', { name: 'Inspector' });
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit E2 elimination of a haloalkane' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit variant 1' }));
    fireEvent.change(within(dialog).getByLabelText('Label of variant 1'), { target: { value: 'Zaitsev elimination (small base)' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Edit / })).toBeNull());
    expect(named(app, 'E2 elimination of a haloalkane')?.variants[0]?.label).toBe('Zaitsev elimination (small base)');
    expect(app.store.historyLabels().undo.at(-1)).toBe('Edit mechanism E2 elimination of a haloalkane');
    await waitFor(() => expect(within(screen.getByRole('complementary', { name: 'Inspector' })).getAllByText(/Zaitsev elimination \(small base\)/).length).toBeGreaterThan(0));
    act(() => void app.store.undo());
    expect(named(app, 'E2 elimination of a haloalkane')?.variants[0]?.label).toBe('Saytzeff elimination (small base)');
    await waitFor(() => expect(within(screen.getByRole('complementary', { name: 'Inspector' })).queryByText(/Zaitsev elimination \(small base\)/)).toBeNull());
  });
});

describe('New mechanism on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  });

  it('More > New mechanism opens the editor full-screen; Save works', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    renderWithApp(app);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'More' })).getByRole('button', { name: 'New mechanism' }));
    const dialog = await newEditor();
    fireEvent.change(within(dialog).getByLabelText('Name (required)'), { target: { value: 'Phone mechanism' } });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(named(app, 'Phone mechanism')).toBeDefined());
  });
});
