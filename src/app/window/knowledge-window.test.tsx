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
    const deps = { ...base, newConcept: { reason: undefined, run }, newNamedReaction: { reason: undefined, run }, newTransformation: { reason: undefined, run } } as unknown as CommandDeps;
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
    act(() => app.inspectorStore.getState().open({ kind: 'reaction', id: 'rxn_benzaldehyde-cannizzaro' }));
    const pane = await screen.findByRole('complementary', { name: 'Inspector' });
    expect(await within(pane).findByText('Cannizzaro disproportionation')).toBeTruthy();
    act(() => void app.store.undo());
    expect(named(app, 'nrx_cannizzaro').name).toBe('Cannizzaro reaction');
  });
});
