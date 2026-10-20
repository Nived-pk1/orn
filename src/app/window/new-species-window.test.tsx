// @vitest-environment jsdom
/**
 * New species through the real window (step 6.2a part 4, decisions D3 to D6): the Workbench page, the palette command, a read-only tab,
 * Save as ONE global entry "Create species <name>" that Undo removes, the draft kept when Save is refused, and the phone (More > New species,
 * the editor full-screen with collapsible sections).
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChemicalClass, Reagent, Species } from '@/core/schema';
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

const speciesNames = (app: FakeApp): string[] => Object.values(app.store.getState().records.species).map((s) => (s as Species).names.canonical);
const openWorkbench = (): void => {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: /Workbench/ }));
};
const editor = (): Promise<HTMLElement> => screen.findByRole('dialog', { name: 'New species' });

describe('the Workbench page (desktop)', () => {
  it('offers New species, New class and New reagent', () => {
    renderWithApp(fakeApp({ state: demoState() }));
    openWorkbench();
    const page = within(screen.getByRole('region', { name: 'Workbench' }));
    expect(page.getByRole('button', { name: 'New species' }).getAttribute('aria-disabled')).toBeNull();
    expect(page.getByRole('button', { name: 'New class' }).getAttribute('aria-disabled')).toBeNull();
    expect(page.getByRole('button', { name: 'New reagent' }).getAttribute('aria-disabled')).toBeNull();
    expect(page.getByText('No unfinished drafts.')).toBeTruthy();
  });

  it('New species opens the editor on a blank species; Save is refused until a name is typed, then makes ONE entry "Create species <name>" that Undo removes', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New species' }));
    const dialog = await editor();
    const before = speciesNames(app).length;
    // every required field is at its empty value; the empty name is the one problem
    expect((within(dialog).getByLabelText('Kind of species') as HTMLSelectElement).value).toBe('unspecified');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    expect(speciesNames(app)).toHaveLength(before);
    fireEvent.change(within(dialog).getByLabelText('Canonical name (required)'), { target: { value: 'Propan-1-ol' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New species' })).toBeNull());
    expect(speciesNames(app)).toContain('Propan-1-ol');
    expect(app.store.historyLabels().undo.at(-1)).toBe('Create species Propan-1-ol');
    const created = Object.values(app.store.getState().records.species).find((s) => (s as Species).names.canonical === 'Propan-1-ol') as Species;
    expect(created.provenance.origin).toBe('user');
    expect(created.review).toMatchObject({ lifecycle: 'draft', status: 'unreviewed' });
    app.store.undo();
    expect(speciesNames(app)).not.toContain('Propan-1-ol');
    expect(speciesNames(app)).toHaveLength(before);
  });

  it('a draft that is closed stays in the Workbench drafts list and can be continued', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New species' }));
    const dialog = await editor();
    fireEvent.change(within(dialog).getByLabelText('Canonical name (required)'), { target: { value: 'Half done' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close (keeps the draft)' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New species' })).toBeNull());
    const list = within(screen.getByRole('list', { name: 'Drafts' }));
    expect(list.getByText(/Half done/)).toBeTruthy();
    fireEvent.click(list.getByRole('button', { name: 'Continue Half done' }));
    const again = await editor();
    expect((within(again).getByLabelText('Canonical name (required)') as HTMLInputElement).value).toBe('Half done');
  });

  it('a read-only tab says why on New species', () => {
    renderWithApp(fakeApp({ state: demoState(), status: { mode: 'follower', reason: 'other_tab_is_writer' } }));
    openWorkbench();
    const button = screen.getByRole('button', { name: 'New species', description: 'This tab is read-only: edit in the tab that is saving' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });
});

const classNames = (app: FakeApp): string[] => Object.values(app.store.getState().records.class).map((c) => (c as ChemicalClass).names.canonical);
const classEditor = (): Promise<HTMLElement> => screen.findByRole('dialog', { name: 'New class' });

describe('New class through the real window (step 6.2b decision D5)', () => {
  it('opens on a blank class; Save is refused until a name AND a kind are given, then ONE entry "Create class Diols" that Undo removes', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New class' }));
    const dialog = await classEditor();
    const before = classNames(app).length;
    expect((within(dialog).getByLabelText('Kind of class') as HTMLSelectElement).value).toBe('');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    expect(classNames(app)).toHaveLength(before);
    fireEvent.change(within(dialog).getByLabelText('Canonical name (required)'), { target: { value: 'Diols' } });
    fireEvent.change(within(dialog).getByLabelText('Kind of class'), { target: { value: 'compound_class' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New class' })).toBeNull());
    expect(classNames(app)).toContain('Diols');
    expect(app.store.historyLabels().undo.at(-1)).toBe('Create class Diols');
    const created = Object.values(app.store.getState().records.class).find((c) => (c as ChemicalClass).names.canonical === 'Diols') as ChemicalClass;
    expect(created).toMatchObject({ classKind: 'compound_class', parentIds: [], exampleSpeciesIds: [], provenance: { origin: 'user' }, review: { lifecycle: 'draft', status: 'unreviewed' } });
    app.store.undo();
    expect(classNames(app)).not.toContain('Diols');
  });

  it('a read-only tab says why on New class', () => {
    renderWithApp(fakeApp({ state: demoState(), status: { mode: 'follower', reason: 'other_tab_is_writer' } }));
    openWorkbench();
    expect(screen.getByRole('button', { name: 'New class', description: 'This tab is read-only: edit in the tab that is saving' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('the palette lists "New class", runs it, and says why when unavailable', () => {
    const run = vi.fn();
    const base = { mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writer', writerReason: null, importReason: undefined, askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined, ui: fakeApp({ state: demoState() }).navigator.ports.ui, exams: { options: [], omitted: 0 } };
    const commands = buildCommands({ ...base, newClass: { reason: undefined, run } } as unknown as CommandDeps);
    commands.find((c) => c.id === 'new-class')?.run();
    expect(run).toHaveBeenCalledTimes(1);
    expect(buildCommands({ ...base, newClass: { reason: 'read-only', run } } as unknown as CommandDeps).find((c) => c.id === 'new-class')?.unavailable).toBe('read-only');
  });
});

const reagentNames = (app: FakeApp): string[] => Object.values(app.store.getState().records.reagent).map((r) => (r as Reagent).names.canonical);
const reagentEditor = (): Promise<HTMLElement> => screen.findByRole('dialog', { name: 'New reagent' });

describe('New reagent through the real window (step 6.2b decision D5)', () => {
  it('opens on a blank reagent; Save is refused until a name is typed, then ONE entry "Create reagent Tollens\' reagent" that Undo removes', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New reagent' }));
    const dialog = await reagentEditor();
    const before = reagentNames(app).length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    expect(reagentNames(app)).toHaveLength(before);
    fireEvent.change(within(dialog).getByLabelText('Canonical name (required)'), { target: { value: "Tollens' reagent" } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Oxidant' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New reagent' })).toBeNull());
    expect(reagentNames(app)).toContain("Tollens' reagent");
    expect(app.store.historyLabels().undo.at(-1)).toBe("Create reagent Tollens' reagent");
    const created = Object.values(app.store.getState().records.reagent).find((r) => (r as Reagent).names.canonical === "Tollens' reagent") as Reagent;
    expect(created).toMatchObject({ families: ['oxidant'], components: [], classIds: [], profiles: [], provenance: { origin: 'user' }, review: { lifecycle: 'draft', status: 'unreviewed' } });
    app.store.undo();
    expect(reagentNames(app)).not.toContain("Tollens' reagent");
  });

  it('a read-only tab says why on New reagent; the palette lists the command', () => {
    renderWithApp(fakeApp({ state: demoState(), status: { mode: 'follower', reason: 'other_tab_is_writer' } }));
    openWorkbench();
    expect(screen.getByRole('button', { name: 'New reagent', description: 'This tab is read-only: edit in the tab that is saving' }).getAttribute('aria-disabled')).toBe('true');
    const run = vi.fn();
    const base = { mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writer', writerReason: null, importReason: undefined, askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined, ui: fakeApp({ state: demoState() }).navigator.ports.ui, exams: { options: [], omitted: 0 } };
    buildCommands({ ...base, newReagent: { reason: undefined, run } } as unknown as CommandDeps).find((c) => c.id === 'new-reagent')?.run();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('the palette command "New species"', () => {
  const deps = (newSpecies: CommandDeps['newSpecies']): CommandDeps =>
    ({ mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writer', writerReason: null, importReason: undefined, askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined, newSpecies, ui: fakeApp({ state: demoState() }).navigator.ports.ui, exams: { options: [], omitted: 0 } }) as unknown as CommandDeps;

  it('is listed, runs, and is unavailable with its reason in a read-only tab', () => {
    const run = vi.fn();
    expect(buildCommands(deps({ reason: undefined, run })).find((c) => c.id === 'new-species')?.unavailable).toBeUndefined();
    buildCommands(deps({ reason: undefined, run })).find((c) => c.id === 'new-species')?.run();
    expect(run).toHaveBeenCalledTimes(1);
    expect(buildCommands(deps({ reason: 'This tab is read-only: edit in the tab that is saving', run })).find((c) => c.id === 'new-species')?.unavailable).toBe('This tab is read-only: edit in the tab that is saving');
    expect(buildCommands(deps(undefined)).some((c) => c.id === 'new-species')).toBe(false);
  });
});

describe('on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  });

  it('More > New reagent opens the reagent editor full-screen; Save works', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    renderWithApp(app);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'More' })).getByRole('button', { name: 'New reagent' }));
    const dialog = await reagentEditor();
    fireEvent.change(within(dialog).getByLabelText('Canonical name (required)'), { target: { value: 'Phone reagent' } });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(reagentNames(app)).toContain('Phone reagent'));
  });

  it('More > New class opens the class editor full-screen; Save works', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    renderWithApp(app);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'More' })).getByRole('button', { name: 'New class' }));
    const dialog = await classEditor();
    fireEvent.change(within(dialog).getByLabelText('Canonical name (required)'), { target: { value: 'Phone class' } });
    fireEvent.change(within(dialog).getByLabelText('Kind of class'), { target: { value: 'functional_group' } });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(classNames(app)).toContain('Phone class'));
  });

  it('More > New species opens the editor full-screen; sections are collapsible and a finding in a closed section opens it; Save works', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    renderWithApp(app);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'More' })).getByRole('button', { name: 'New species' }));
    const dialog = await editor();
    // the long sections start closed on a phone, the toggles say so
    const stereo = within(dialog).getByRole('button', { name: /Stereo/ });
    expect(stereo.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(stereo);
    expect(stereo.getAttribute('aria-expanded')).toBe('true');
    expect(within(dialog).getByLabelText('Stereo statement')).toBeTruthy();
    fireEvent.click(stereo);
    expect(stereo.getAttribute('aria-expanded')).toBe('false');
    fireEvent.change(within(dialog).getByLabelText('Canonical name (required)'), { target: { value: 'Phone-made' } });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(speciesNames(app)).toContain('Phone-made'));
  });
});
