// @vitest-environment jsdom
/**
 * The names editor through the real window (ADR-040, step 6.1a part 4): the inspector's "Edit names" button, the editor as a lazy dialog,
 * Save, the top bar's Undo and Redo with the store's labels, the global keys and their two guards, the palette command, a read-only
 * tab, and the phone (full sheet only, Undo and Redo in More).
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Species } from '@/core/schema';
import { PHONE_QUERIES } from '@/ui/hooks';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { buildCommands, type CommandDeps } from './palette-commands';
import { prefetchPalette } from './lazy-palette';

beforeAll(async () => {
  await prefetchPalette(); // the palette is a lazy chunk since step 6.1a: load it once so these tests open it at once
  await import('@/features/workbench/layer'); // the editor and the drafts list are a lazy chunk (ADR-040): load it once so findBy* never races a slow machine
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

const pane = (): HTMLElement => screen.getByRole('complementary', { name: 'Inspector' });
const speciesIds = (app: FakeApp): string[] => Object.keys(app.store.getState().records.species).sort();
const speciesNamed = (app: FakeApp, id: string): string => (app.store.getState().records.species[id as never] as Species).names.canonical;

function inspectSpecies(app: FakeApp, id = speciesIds(app)[0] as string): string {
  app.panels.getState().setInspectorOpen(true);
  renderWithApp(app);
  act(() => app.inspectorStore.getState().open({ kind: 'species', id }));
  return id;
}
const editor = (): Promise<HTMLElement> => screen.findByRole('dialog', { name: /^Edit / });

describe('Edit names in the inspector (desktop)', () => {
  it('a species has the button; it opens the editor, Save changes the name everywhere and one history entry is made', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    const id = inspectSpecies(app);
    const old = speciesNamed(app, id);
    fireEvent.click(within(pane()).getByRole('button', { name: 'Edit' }));
    const dialog = await editor();
    fireEvent.change(within(dialog).getByLabelText('Canonical name (required)'), { target: { value: 'Brand new name' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Edit / })).toBeNull());
    expect(speciesNamed(app, id)).toBe('Brand new name');
    expect(within(pane()).getByRole('heading', { name: 'Brand new name' })).toBeTruthy();
    expect(app.store.historyLabels().undo).toEqual([`Edit species of ${old}`]);
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  it('the top bar\'s Undo and Redo work with the store and carry the label ("Undo Edit names of ...")', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    const id = inspectSpecies(app);
    const old = speciesNamed(app, id);
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(within(pane()).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(await editor()).getByLabelText('Canonical name (required)'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const undo = await screen.findByRole('button', { name: `Undo Edit species of ${old}` });
    fireEvent.click(undo);
    expect(speciesNamed(app, id)).toBe(old);
    fireEvent.click(await screen.findByRole('button', { name: `Redo Edit species of ${old}` }));
    expect(speciesNamed(app, id)).toBe('Changed');
  });

  it('a record without names (a reaction) has no button', () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    const reaction = Object.keys(app.store.getState().records.reaction)[0] as string;
    act(() => app.inspectorStore.getState().open({ kind: 'reaction', id: reaction }));
    expect(within(pane()).queryByRole('button', { name: 'Edit names' })).toBeNull();
  });

  it('a read-only tab: the button is unavailable with the reason', () => {
    const app = fakeApp({ state: demoState(), status: { mode: 'follower', reason: 'other_tab_is_writer' }, navigator: { depictions: true } });
    inspectSpecies(app);
    const button = within(pane()).getByRole('button', { name: 'Edit', description: 'This tab is read-only: edit in the tab that is saving' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(screen.queryByRole('dialog', { name: /^Edit / })).toBeNull();
  });

  it('opening the editor again for the same record reopens its session, with its undo history', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    inspectSpecies(app);
    fireEvent.click(within(pane()).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(await editor()).getByLabelText('Canonical name (required)'), { target: { value: 'Half done' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close (keeps the draft)' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Edit / })).toBeNull());
    fireEvent.click(within(pane()).getByRole('button', { name: 'Edit' }));
    const dialog = await editor();
    expect((within(dialog).getByLabelText('Canonical name (required)') as HTMLInputElement).value).toBe('Half done');
    expect(within(dialog).getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBeNull();
    expect(app.drafts.view().count).toBe(1);
  });
});

describe('the global Undo and Redo keys', () => {
  async function withOneEdit() {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    const id = inspectSpecies(app);
    const old = speciesNamed(app, id);
    const result = app.store.dispatch({ label: 'Edit names of x', commands: [{ type: 'record.update', record: { ...(app.store.getState().records.species[id as never] as Species), names: { ...(app.store.getState().records.species[id as never] as Species).names, canonical: 'After' } } }] });
    expect(result.ok).toBe(true);
    return { app, id, old };
  }

  it('Ctrl+Z outside a field undoes the last commit; Ctrl+Shift+Z and Ctrl+Y redo it', async () => {
    const { app, id, old } = await withOneEdit();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(speciesNamed(app, id)).toBe(old);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(speciesNamed(app, id)).toBe('After');
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    expect(speciesNamed(app, id)).toBe(old);
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
    expect(speciesNamed(app, id)).toBe('After');
  });

  it('in a text field the key is the field\'s own (the palette input): the global history is not touched', async () => {
    const { app, id } = await withOneEdit();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    const input = within(dialog).getByRole('combobox');
    const accepted = fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(accepted).toBe(true); // not prevented
    expect(speciesNamed(app, id)).toBe('After');
  });

  it('while an editor is open the global history is left alone (the keys are the draft\'s)', async () => {
    const { app, id } = await withOneEdit();
    fireEvent.click(within(pane()).getByRole('button', { name: 'Edit' }));
    await editor();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(speciesNamed(app, id)).toBe('After');
  });

  it('with nothing to undo the reason is said in a toast', () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(screen.getByText(/^Undo is unavailable: Nothing to undo/)).toBeTruthy();
  });
});

describe('the palette command "Edit names of the selection"', () => {
  const deps = (editNames: CommandDeps['editNames']): CommandDeps => {
    const app = fakeApp({ state: demoState() });
    return {
      mode: 'navigator',
      setMode: () => undefined,
      hasData: true,
      writerMode: 'writer',
      writerReason: null,
      importReason: undefined,
      askReplace: () => undefined,
      undoImport: () => undefined,
      pickFile: () => undefined,
      openExport: () => undefined,
      editNames,
      ui: app.navigator.ui,
      exams: { options: [] } as never,
    };
  };

  it('runs when a record with names is in the inspector, and says why it cannot otherwise', () => {
    const run = vi.fn();
    const ok = buildCommands(deps({ reason: undefined, run })).find((c) => c.id === 'edit-names');
    expect(ok?.title).toBe('Edit names of the selection');
    expect(ok?.unavailable).toBeUndefined();
    ok?.run();
    expect(run).toHaveBeenCalledTimes(1);
    const blocked = buildCommands(deps({ reason: 'This tab is read-only: edit in the tab that is saving', run })).find((c) => c.id === 'edit-names');
    expect(blocked?.unavailable).toBe('This tab is read-only: edit in the tab that is saving');
  });

  it('is listed through the palette with its reason when nothing with names is shown', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: '>Edit names' } });
    const item = await within(dialog).findByText('Edit names of the selection');
    expect(item).toBeTruthy();
    expect(dialog.textContent).toContain('show a species, class or reagent in the inspector first');
  });
});

describe('on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  });

  it('the button is in the FULL sheet part of the inspector, not in the peek', () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    renderWithApp(app);
    act(() => app.inspectorStore.getState().open({ kind: 'species', id: speciesIds(app)[0] as string }));
    const button = screen.getByRole('button', { name: 'Edit', hidden: true });
    expect(button.closest('[data-sheet-full]')).not.toBeNull();
  });

  it('More shows "Undo <label>" and "Redo <label>", unavailable with a reason when empty; Undo and Redo are not on the bar', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    renderWithApp(app);
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: /^Undo/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const more = within(screen.getByRole('dialog', { name: 'More' }));
    expect(more.getByRole('button', { name: 'Undo', description: 'Nothing to undo' }).getAttribute('aria-disabled')).toBe('true');
    expect(more.getByRole('button', { name: 'Redo', description: 'Nothing to redo' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(more.getByRole('button', { name: 'Close' }));
    const id = speciesIds(app)[0] as string;
    const record = app.store.getState().records.species[id as never] as Species;
    const done = app.store.dispatch({ label: 'Edit names of Ethanol', commands: [{ type: 'record.update', record: { ...record, names: { ...record.names, canonical: 'After' } } }] });
    expect(done.ok).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const again = within(screen.getByRole('dialog', { name: 'More' }));
    fireEvent.click(again.getByRole('button', { name: 'Undo Edit names of Ethanol' }));
    expect((app.store.getState().records.species[id as never] as Species).names.canonical).toBe(record.names.canonical);
  });
});
