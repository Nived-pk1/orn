// @vitest-environment jsdom
/**
 * The shared fields and the source editor through the real window (step 6.6a part 2): New source from the Workbench page, the palette and More on a
 * phone; a tag and a citation added to a demo species, Saved, shown by the inspector, and restored by Undo; every other editor shows the same
 * Tags section (species, class, reagent, reaction, mechanism); Concepts only where the schema has conceptIds.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { CanonicalState, Reference, Species } from '@/core/schema';
import { PHONE_QUERIES } from '@/ui/hooks';
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

const SOURCE: Reference = {
  id: 'ref_morrison-boyd',
  kind: 'reference',
  refKind: 'textbook',
  title: 'Morrison and Boyd, Organic Chemistry',
  authors: ['Morrison', 'Boyd'],
  year: 2010,
  tags: [],
  citations: [],
  provenance: { origin: 'user', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' },
  review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] },
} as unknown as Reference;
const withSource = (): CanonicalState => {
  const state = demoState();
  return { ...state, records: { ...state.records, reference: { [SOURCE.id]: SOURCE } } } as CanonicalState;
};
const sources = (app: FakeApp): Reference[] => Object.values(app.store.getState().records.reference) as Reference[];
const openWorkbench = (): void => {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: /Workbench/ }));
};
/** The search service answers with the records of the kinds asked whose title or name contains the text. */
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

describe('New source (desktop)', () => {
  it('the Workbench button opens a blank source; Save is refused without a kind and a title; then ONE entry that Undo removes', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New source' }));
    const dialog = await screen.findByRole('dialog', { name: 'New source' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    expect(sources(app)).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText('Kind of source'), { target: { value: 'textbook' } });
    fireEvent.change(within(dialog).getByLabelText('Title (required)'), { target: { value: 'NCERT Chemistry XII' } });
    fireEvent.change(within(dialog).getByLabelText('Year'), { target: { value: '2024' } });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(sources(app)).toHaveLength(1));
    expect(sources(app)[0]).toMatchObject({ title: 'NCERT Chemistry XII', refKind: 'textbook', year: 2024, provenance: { origin: 'user' } });
    expect(app.store.historyLabels().undo.at(-1)).toBe('Create reference NCERT Chemistry XII');
    act(() => void app.store.undo());
    expect(sources(app)).toHaveLength(0);
  });

  it('the palette lists "New source"; a read-only tab says why on the Workbench button', () => {
    renderWithApp(fakeApp({ state: demoState(), status: { mode: 'follower', reason: 'other_tab_is_writer' } }));
    openWorkbench();
    expect(screen.getByRole('button', { name: 'New source', description: 'This tab is read-only: edit in the tab that is saving' }).getAttribute('aria-disabled')).toBe('true');
    const run = vi.fn();
    const base = { mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writer', writerReason: null, importReason: undefined, askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined, ui: fakeApp({ state: demoState() }).navigator.ports.ui, exams: { options: [], omitted: 0 } };
    const command = buildCommands({ ...base, newKinds: [{ id: 'new-source', title: 'New source', keywords: [], reason: undefined, run }], } as unknown as CommandDeps).find((c) => c.id === 'new-source');
    expect(command?.title).toBe('New source');
    command?.run();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('New source on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  });
  it('More > New source opens the editor full-screen; Save works', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    renderWithApp(app);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'More' })).getByRole('button', { name: 'New source' }));
    const dialog = await screen.findByRole('dialog', { name: 'New source' });
    fireEvent.change(within(dialog).getByLabelText('Kind of source'), { target: { value: 'website' } });
    fireEvent.change(within(dialog).getByLabelText('Title (required)'), { target: { value: 'Phone source' } });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(sources(app)).toHaveLength(1));
  });
});

describe('a tag and a citation on a demo species', () => {
  it('added in the editor, Saved, shown by the inspector, and restored by Undo', async () => {
    const app = fakeApp({ state: withSource() });
    answerSearch(app);
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    const species = Object.values(app.store.getState().records.species)[0] as Species;
    act(() => app.inspectorStore.getState().open({ kind: 'species', id: species.id }));
    const inspector = await screen.findByRole('complementary', { name: 'Inspector' });
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: `Edit ${species.names.canonical}` });
    const tag = within(dialog).getByLabelText('Add a tag');
    fireEvent.change(tag, { target: { value: 'jee-main' } });
    fireEvent.keyDown(tag, { key: 'Enter' });
    fireEvent.change(within(dialog).getByLabelText('Find a source by title'), { target: { value: 'morrison' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: `Add ${SOURCE.title}` }));
    fireEvent.click(within(dialog).getByRole('button', { name: `Edit citation ${SOURCE.title} (2010)` }));
    fireEvent.change(within(dialog).getByLabelText('Locator'), { target: { value: 'ch. 4' } });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Edit / })).toBeNull());
    const saved = app.store.getState().records.species[species.id] as Species;
    expect(saved.tags).toEqual([...species.tags, 'jee-main']);
    expect(saved.citations.at(-1)).toEqual({ referenceId: SOURCE.id, locator: 'ch. 4' });
    fireEvent.click(await within(screen.getByRole('complementary', { name: 'Inspector' })).findByRole('button', { name: /Level 4: Notes and sources/ }));
    await waitFor(() => expect(screen.getByRole('complementary', { name: 'Inspector' }).textContent).toContain('jee-main'));
    expect(screen.getByRole('complementary', { name: 'Inspector' }).textContent).toContain('ch. 4');
    act(() => void app.store.undo());
    expect((app.store.getState().records.species[species.id] as Species).tags).toEqual(species.tags);
    expect((app.store.getState().records.species[species.id] as Species).citations).toEqual(species.citations);
  });
});

describe('the same shared section in every editor', () => {
  const cases: readonly { kind: 'species' | 'class' | 'reagent' | 'reaction' | 'mechanism'; concepts: boolean }[] = [
    { kind: 'species', concepts: false },
    { kind: 'class', concepts: false },
    { kind: 'reagent', concepts: false },
    { kind: 'reaction', concepts: true },
    { kind: 'mechanism', concepts: true },
  ];
  it.each(cases)('$kind has Tags and Citations; Concepts: $concepts', async ({ kind, concepts }) => {
    const app = fakeApp({ state: demoState() });
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    const id = Object.keys(app.store.getState().records[kind])[0] as string;
    act(() => app.inspectorStore.getState().open({ kind, id } as never));
    const inspector = await screen.findByRole('complementary', { name: 'Inspector' });
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    const toggle = within(dialog).getByRole('button', { name: /Notes, tags and citations/ });
    if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
    expect(within(dialog).getByLabelText('Add a tag')).toBeTruthy();
    expect(within(dialog).getByRole('group', { name: 'Citations section' })).toBeTruthy();
    expect(within(dialog).queryByLabelText('Find a concept by name') !== null).toBe(concepts);
  });
});
