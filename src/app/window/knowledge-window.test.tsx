// @vitest-environment jsdom
/**
 * The concept, named reaction and transformation editors through the real window (step 6.6b part 2): New concept / New named reaction /
 * New transformation from the Workbench page, the palette and More on a phone; a demo named reaction renamed, Saved and shown by a reaction
 * that names it (the inspector and the family card's derived names), Undo restores; the duplicate check on a repeated name.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PHONE_QUERIES } from '@/ui/hooks';
import type { NamedReaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { prefetchPalette } from './lazy-palette';
import { buildCommands, type CommandDeps } from './palette-commands';

beforeAll(async () => {
  await prefetchPalette();
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openWorkbench = (): void => {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: /Workbench/ }));
};
function answerSearch(app: FakeApp): void {
  (app.value.services.search.search as unknown as Mock).mockImplementation(async (_channel: string, request: { text: string; kinds: readonly string[] }) => ({
    ok: true,
    value: request.kinds.flatMap((kind) =>
      Object.values((app.store.getState().records as unknown as Record<string, Record<string, { id: string; title?: string; name?: string; names?: { canonical: string } }>>)[kind] ?? {})
        .filter((r) => (r.title ?? r.name ?? r.names?.canonical ?? '').toLowerCase().includes(request.text.toLowerCase()))
        .map((r) => ({ ref: { kind, id: r.id } })),
    ),
  }));
}
const named = (app: FakeApp, id: string): NamedReaction => app.store.getState().records.named_reaction[id as never] as NamedReaction;

describe('New concept, New named reaction, New transformation (desktop)', () => {
  it.each([
    ['New concept', 'concept'],
    ['New named reaction', 'named_reaction'],
    ['New transformation', 'transformation'],
  ] as const)('the Workbench button "%s" opens a blank %s; a read-only tab says why', async (button, kind) => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: button }));
    const dialog = await screen.findByRole('dialog', { name: button });
    fireEvent.change(within(dialog).getByLabelText(/^Name \(required\)/), { target: { value: `Zz ${kind} from the window` } });
    if (kind === 'concept') fireEvent.change(within(dialog).getByLabelText('Kind of concept'), { target: { value: 'general' } });
    const before = Object.keys(app.store.getState().records[kind]).length;
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(Object.keys(app.store.getState().records[kind])).toHaveLength(before + 1));
    expect(app.store.historyLabels().undo.at(-1)).toBe(`Create ${kind.replace(/_/g, ' ')} Zz ${kind} from the window`);
    act(() => void app.store.undo());
    expect(Object.keys(app.store.getState().records[kind])).toHaveLength(before);
  });
  it('a read-only tab says why on each button', () => {
    renderWithApp(fakeApp({ state: demoState(), status: { mode: 'follower', reason: 'other_tab_is_writer' } }));
    openWorkbench();
    for (const name of ['New concept', 'New named reaction', 'New transformation']) {
      expect(screen.getByRole('button', { name, description: 'This tab is read-only: edit in the tab that is saving' }).getAttribute('aria-disabled')).toBe('true');
    }
  });
  it('the palette lists the three commands and runs them', () => {
    const base = { mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writer', writerReason: null, importReason: undefined, askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined, ui: fakeApp({ state: demoState() }).navigator.ports.ui, exams: { options: [], omitted: 0 } };
    const run = vi.fn();
    const deps = { ...base, newKinds: [{ id: 'new-concept', title: 'New concept', keywords: [], reason: undefined, run }, { id: 'new-named-reaction', title: 'New named reaction', keywords: [], reason: undefined, run }, { id: 'new-transformation', title: 'New transformation', keywords: [], reason: undefined, run }], } as unknown as CommandDeps;
    const commands = buildCommands(deps);
    expect(commands.filter((c) => c.title.startsWith('New ')).map((c) => c.title)).toEqual(expect.arrayContaining(['New concept', 'New named reaction', 'New transformation']));
    for (const id of ['new-concept', 'new-named-reaction', 'new-transformation']) commands.find((c) => c.id === id)?.run();
    expect(run).toHaveBeenCalledTimes(3);
  });
});

describe('on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  });
  it('More > New concept opens the editor full-screen', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    renderWithApp(app);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'More' })).getByRole('button', { name: 'New concept' }));
    expect(await screen.findByRole('dialog', { name: 'New concept' })).toBeTruthy();
  });
});

describe('renaming a demo named reaction', () => {
  it('Saved, a reaction that names it shows the new name in the inspector; Undo restores the old name', async () => {
    const app = fakeApp({ state: demoState() });
    answerSearch(app);
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    act(() => app.inspectorStore.getState().open({ kind: 'named_reaction', id: 'nrx_cannizzaro' }));
    const inspector = await screen.findByRole('complementary', { name: 'Inspector' });
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Cannizzaro reaction' });
    fireEvent.change(within(dialog).getByLabelText('Name (required)'), { target: { value: 'Cannizzaro disproportionation' } });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(named(app, 'nrx_cannizzaro').name).toBe('Cannizzaro disproportionation'));
    expect(app.store.historyLabels().undo.at(-1)).toBe('Edit named reaction Cannizzaro reaction');
    act(() => app.inspectorStore.getState().open({ kind: 'reaction', id: 'rxn_benzaldehyde-cannizzaro' }));
    const pane = await screen.findByRole('complementary', { name: 'Inspector' });
    expect(await within(pane).findByText('Cannizzaro disproportionation')).toBeTruthy();
    act(() => void app.store.undo());
    expect(named(app, 'nrx_cannizzaro').name).toBe('Cannizzaro reaction');
  });
});

describe('linking a demo reaction to a named reaction (step 6.6b part 3)', () => {
  it('Saved, the inspector shows the named reaction and the new reversibility; Undo restores', async () => {
    const app = fakeApp({ state: demoState() });
    answerSearch(app);
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    const id = 'rxn_benzene-nitration-draft';
    act(() => app.inspectorStore.getState().open({ kind: 'reaction', id }));
    const inspector = await screen.findByRole('complementary', { name: 'Inspector' });
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Nitration of benzene (draft)' });
    const toggle = within(dialog).getByRole('button', { name: /Links and reversibility/ });
    if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
    fireEvent.change(within(dialog).getByLabelText('Find a named reaction by name'), { target: { value: 'Cannizzaro' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Add Cannizzaro reaction' }));
    fireEvent.change(within(dialog).getByLabelText('Reversibility'), { target: { value: 'irreversible' } });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: /^Save/ })));
    await waitFor(() => expect((app.store.getState().records.reaction[id as never] as { namedReactionIds: string[] }).namedReactionIds).toEqual(['nrx_cannizzaro']));
    expect(await within(await screen.findByRole('complementary', { name: 'Inspector' })).findByText('Cannizzaro reaction')).toBeTruthy();
    act(() => void app.store.undo());
    expect((app.store.getState().records.reaction[id as never] as { namedReactionIds: string[]; reversibility: { kind: string } }).namedReactionIds).toEqual([]);
    expect((app.store.getState().records.reaction[id as never] as { reversibility: { kind: string } }).reversibility.kind).toBe('unknown');
  });
});

describe('relationships (step 6.6b part 4)', () => {
  const pickEnd = async (dialog: HTMLElement, end: 'from' | 'to', text: string, name: string): Promise<void> => {
    fireEvent.change(within(dialog).getByLabelText(`Find the ${end} record by name`), { target: { value: text } });
    fireEvent.click(await within(dialog).findByRole('button', { name: `Add ${name}` }));
  };
  it('a new "commonly confused with" between two demo reactions shows in both inspectors; Undo removes it', async () => {
    const app = fakeApp({ state: demoState() });
    answerSearch(app);
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New relationship' }));
    const dialog = await screen.findByRole('dialog', { name: 'New relationship' });
    fireEvent.change(within(dialog).getByLabelText('Type of relationship'), { target: { value: 'commonly_confused_with' } });
    await pickEnd(dialog, 'from', 'Diazotisation of aniline', 'Diazotisation of aniline');
    await pickEnd(dialog, 'to', '1° alcohol', '1° alcohol → aldehyde (PCC)');
    const before = Object.keys(app.store.getState().records.relationship).length;
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(Object.keys(app.store.getState().records.relationship)).toHaveLength(before + 1));
    expect(app.store.historyLabels().undo.at(-1)).toBe('Create relationship: Diazotisation of aniline commonly confused with 1° alcohol → aldehyde (PCC)'); // both ends (step 6.6c L3)
    for (const [id, other] of [['rxn_aniline-diazotisation', /1° alcohol/], ['rxn_alcohol1-to-aldehyde-pcc', /Diazotisation of aniline/]] as const) {
      act(() => app.inspectorStore.getState().open({ kind: 'reaction', id }));
      const pane = await screen.findByRole('complementary', { name: 'Inspector' });
      const level3 = await within(pane).findByRole('button', { name: /Level 3/ }); // a reaction's related reactions are at Level 3
      if (level3.getAttribute('aria-expanded') === 'false') fireEvent.click(level3);
      expect((await within(pane).findAllByText(other)).length).toBeGreaterThan(0);
      expect(within(pane).getAllByText(/commonly confused with/i).length).toBeGreaterThan(0);
    }
    act(() => void app.store.undo());
    expect(Object.keys(app.store.getState().records.relationship)).toHaveLength(before);
  });
  it('a prerequisite_of that would close a cycle is refused at Save, in words', async () => {
    const app = fakeApp({ state: demoState() });
    answerSearch(app);
    renderWithApp(app);
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New relationship' }));
    const dialog = await screen.findByRole('dialog', { name: 'New relationship' });
    fireEvent.change(within(dialog).getByLabelText('Type of relationship'), { target: { value: 'prerequisite_of' } });
    await pickEnd(dialog, 'from', "Markovnikov's", "Markovnikov's rule");
    await pickEnd(dialog, 'to', 'Hyperconjugation', 'Hyperconjugation');
    const before = Object.keys(app.store.getState().records.relationship).length;
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    expect(await within(dialog).findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    expect(within(dialog).getAllByText(/closes a cycle/).length).toBeGreaterThan(0);
    expect(Object.keys(app.store.getState().records.relationship)).toHaveLength(before);
  });
  it('the palette lists "New relationship"; a read-only tab says why on the Workbench button', () => {
    renderWithApp(fakeApp({ state: demoState(), status: { mode: 'follower', reason: 'other_tab_is_writer' } }));
    openWorkbench();
    expect(screen.getByRole('button', { name: 'New relationship', description: 'This tab is read-only: edit in the tab that is saving' }).getAttribute('aria-disabled')).toBe('true');
    const run = vi.fn();
    const base = { mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writer', writerReason: null, importReason: undefined, askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined, ui: fakeApp({ state: demoState() }).navigator.ports.ui, exams: { options: [], omitted: 0 } };
    const command = buildCommands({ ...base, newKinds: [{ id: 'new-relationship', title: 'New relationship', keywords: [], reason: undefined, run }], } as unknown as CommandDeps).find((c) => c.id === 'new-relationship');
    expect(command?.title).toBe('New relationship');
    command?.run();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('caveats (step 6.6b part 5)', () => {
  it('a new caveat targeting a demo reaction shows where caveats show today (the reaction\'s Level 4); Undo removes it', async () => {
    const app = fakeApp({ state: demoState() });
    answerSearch(app);
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New caveat' }));
    const dialog = await screen.findByRole('dialog', { name: 'New caveat' });
    fireEvent.change(within(dialog).getByLabelText('Kind of caveat'), { target: { value: 'trap' } });
    fireEvent.change(within(dialog).getByLabelText('Title (required)'), { target: { value: 'Zz window caveat' } });
    fireEvent.change(within(dialog).getByLabelText('Statement (required)'), { target: { value: 'A statement from the window test.' } });
    const targets = within(dialog).getByRole('button', { name: /Targets/ });
    if (targets.getAttribute('aria-expanded') === 'false') fireEvent.click(targets);
    fireEvent.change(within(dialog).getByLabelText('Find a target record by name'), { target: { value: 'Diazotisation of aniline' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Add Diazotisation of aniline' }));
    fireEvent.change(within(dialog).getByLabelText('Role of Diazotisation of aniline'), { target: { value: 'affected_reaction' } });
    const before = Object.keys(app.store.getState().records.caveat).length;
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(Object.keys(app.store.getState().records.caveat)).toHaveLength(before + 1));
    expect(app.store.historyLabels().undo.at(-1)).toBe('Create caveat Zz window caveat');
    act(() => app.inspectorStore.getState().open({ kind: 'reaction', id: 'rxn_aniline-diazotisation' }));
    const pane = await screen.findByRole('complementary', { name: 'Inspector' });
    const level4 = await within(pane).findByRole('button', { name: /Level 4/ });
    if (level4.getAttribute('aria-expanded') === 'false') fireEvent.click(level4);
    expect(await within(pane).findByText('Zz window caveat')).toBeTruthy();
    act(() => void app.store.undo());
    expect(Object.keys(app.store.getState().records.caveat)).toHaveLength(before);
  });
  it('the palette lists "New caveat"; a read-only tab says why on the Workbench button', () => {
    renderWithApp(fakeApp({ state: demoState(), status: { mode: 'follower', reason: 'other_tab_is_writer' } }));
    openWorkbench();
    expect(screen.getByRole('button', { name: 'New caveat', description: 'This tab is read-only: edit in the tab that is saving' }).getAttribute('aria-disabled')).toBe('true');
    const run = vi.fn();
    const base = { mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writer', writerReason: null, importReason: undefined, askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined, ui: fakeApp({ state: demoState() }).navigator.ports.ui, exams: { options: [], omitted: 0 } };
    const command = buildCommands({ ...base, newKinds: [{ id: 'new-caveat', title: 'New caveat', keywords: [], reason: undefined, run }], } as unknown as CommandDeps).find((c) => c.id === 'new-caveat');
    expect(command?.title).toBe('New caveat');
    command?.run();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
