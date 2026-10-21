// @vitest-environment jsdom
/**
 * The topic and topic mapping editors through the real window (step 6.6c part 2): New topic / New topic mapping from the Workbench page
 * and the palette; a demo reaction mapped to a demo topic as "supporting" from the reaction's own editor ("Map to a topic" keeps the
 * reaction's draft and opens a NEW mapping with the reaction already filled in), Saved, and the topic's inspector lists it; Undo removes it.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi, type Mock } from 'vitest';
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
afterEach(cleanup);

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

describe('New topic and New topic mapping (desktop)', () => {
  it.each([
    ['New topic', 'topic'],
    ['New topic mapping', 'topic mapping'],
  ] as const)('the Workbench button "%s" opens a blank %s editor', async (button, kind) => {
    renderWithApp(fakeApp({ state: demoState() }));
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: button }));
    const dialog = await screen.findByRole('dialog', { name: button });
    expect(within(dialog).getByText(kind)).toBeTruthy();
  });
  it('a read-only tab says why on the Workbench buttons', () => {
    renderWithApp(fakeApp({ state: demoState(), status: { mode: 'follower', reason: 'other_tab_is_writer' } }));
    openWorkbench();
    for (const name of ['New topic', 'New topic mapping']) expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe('true');
  });
  it('the palette lists both commands', () => {
    const run = vi.fn();
    const base = { mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writer', writerReason: null, importReason: undefined, askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined, ui: fakeApp({ state: demoState() }).navigator.ports.ui, exams: { options: [], omitted: 0 } };
    const commands = buildCommands({ ...base, newTopic: { reason: undefined, run }, newTopicMapping: { reason: undefined, run } } as unknown as CommandDeps);
    expect(commands.map((command) => command.title)).toEqual(expect.arrayContaining(['New topic', 'New topic mapping']));
    for (const id of ['new-topic', 'new-topic-mapping']) commands.find((c) => c.id === id)?.run();
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('mapping a demo reaction to a demo topic', () => {
  it('from the reaction\'s editor: "Map to a topic" opens a NEW mapping with the reaction filled in, the reaction\'s draft is kept; "supporting", Save, the topic lists it; Undo removes it', async () => {
    const app = fakeApp({ state: demoState() });
    answerSearch(app);
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    const reaction = 'rxn_aniline-diazotisation';
    const topic = 'top_alcohol-oxidation-dehydration';
    act(() => app.inspectorStore.getState().open({ kind: 'reaction', id: reaction }));
    const inspector = await screen.findByRole('complementary', { name: 'Inspector' });
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
    const editor = await screen.findByRole('dialog', { name: 'Edit Diazotisation of aniline' });
    const toggle = within(editor).getByRole('button', { name: /Syllabus topics/ });
    if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
    fireEvent.change(within(editor).getByLabelText('Name (required)'), { target: { value: 'Diazotisation of aniline (edited)' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Map to a topic' }));
    const mapping = await screen.findByRole('dialog', { name: 'New topic mapping' });
    expect(within(mapping).getByRole('list', { name: 'Target record' }).textContent).toContain('Diazotisation of aniline');
    fireEvent.change(within(mapping).getByLabelText('Topic'), { target: { value: topic } });
    fireEvent.change(within(mapping).getByLabelText('Role'), { target: { value: 'supporting' } });
    const before = Object.keys(app.store.getState().records.topic_mapping).length;
    await act(async () => void fireEvent.click(within(mapping).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(Object.keys(app.store.getState().records.topic_mapping)).toHaveLength(before + 1));
    const made = Object.values(app.store.getState().records.topic_mapping).find((m) => m.target.id === reaction && m.topicId === topic);
    expect(made).toMatchObject({ role: 'supporting', target: { kind: 'reaction', id: reaction } });
    expect(app.store.historyLabels().undo.at(-1)).toMatch(/^Create topic mapping: Diazotisation of aniline in Oxidation and dehydration of alcohols/);
    // the reaction's draft was kept: the reaction itself is unchanged until it is saved
    expect(app.store.getState().records.reaction[reaction as never]?.name).toBe('Diazotisation of aniline');
    act(() => app.inspectorStore.getState().open({ kind: 'topic', id: topic }));
    const pane = await screen.findByRole('complementary', { name: 'Inspector' });
    const level3 = await within(pane).findByRole('button', { name: /Level 3/ });
    if (level3.getAttribute('aria-expanded') === 'false') fireEvent.click(level3);
    const mapped = Object.values(app.store.getState().records.topic_mapping).filter((m) => m.topicId === topic).length;
    expect(mapped).toBeGreaterThan(1);
    expect(await within(pane).findByRole('heading', { name: `Mapped records (${mapped})` })).toBeTruthy();
    act(() => void app.store.undo());
    expect(Object.keys(app.store.getState().records.topic_mapping)).toHaveLength(before);
  });
});

describe('marking a demo reaction outside one exam version', () => {
  it('from the reaction\'s editor: "Mark exam relevance" opens a NEW one with the reaction filled in; "outside" for JEE Main 2026, Save; the exam scope treats it like the existing records', async () => {
    const { createScopeOf } = await import('@/core/graph/scope');
    const { indexEngine } = await import('@/core/indexes');
    const app = fakeApp({ state: demoState() });
    answerSearch(app);
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    const reaction = 'rxn_aniline-diazotisation';
    const scopeNow = () => createScopeOf(indexEngine.build(app.store.getState()), 'exm_jee-main' as never, 'exv_jee-main-2026' as never)({ kind: 'reaction', id: reaction } as never);
    const before = scopeNow();
    expect(before).not.toBe('outside');
    act(() => app.inspectorStore.getState().open({ kind: 'reaction', id: reaction }));
    const inspector = await screen.findByRole('complementary', { name: 'Inspector' });
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
    const editor = await screen.findByRole('dialog', { name: 'Edit Diazotisation of aniline' });
    const toggle = within(editor).getByRole('button', { name: /Exam relevance/ });
    if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
    fireEvent.click(within(editor).getByRole('button', { name: 'Mark exam relevance' }));
    const marking = await screen.findByRole('dialog', { name: 'New exam relevance' });
    expect(within(marking).getByRole('list', { name: 'Target record' }).textContent).toContain('Diazotisation of aniline');
    fireEvent.change(within(marking).getByLabelText('Exam'), { target: { value: 'exm_jee-main' } });
    fireEvent.click(within(marking).getByRole('checkbox', { name: 'JEE Main 2026 (provisional)' }));
    fireEvent.change(within(marking).getByLabelText('Scope'), { target: { value: 'outside' } });
    const count = Object.keys(app.store.getState().records.exam_relevance).length;
    await act(async () => void fireEvent.click(within(marking).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(Object.keys(app.store.getState().records.exam_relevance)).toHaveLength(count + 1));
    expect(scopeNow()).toBe('outside');
    expect(app.store.historyLabels().undo.at(-1)).toMatch(/^Create exam relevance: Diazotisation of aniline for JEE Main/);
    act(() => void app.store.undo());
    expect(scopeNow()).toBe(before);
  });
  it('the Workbench has "New exam relevance" and the palette lists it', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New exam relevance' }));
    expect(await screen.findByRole('dialog', { name: 'New exam relevance' })).toBeTruthy();
    const run = vi.fn();
    const base = { mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writer', writerReason: null, importReason: undefined, askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined, ui: fakeApp({ state: demoState() }).navigator.ports.ui, exams: { options: [], omitted: 0 } };
    const command = buildCommands({ ...base, newExamRelevance: { reason: undefined, run } } as unknown as CommandDeps).find((c) => c.id === 'new-exam-relevance');
    expect(command?.title).toBe('New exam relevance');
  });
});

describe('making a class a map family', () => {
  beforeAll(() => {
    // jsdom does no layout: give every element a tall box so the virtual List view renders all of its rows
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 4000 });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 900 });
  });
  it('a class with no family, made one in a free cell from its own editor, appears on the overview map and in the Families list; Undo removes it', async () => {
    const { arrangementsOf } = await import('@/core/graph/navigator/nodes');
    const { indexEngine } = await import('@/core/indexes');
    const app = fakeApp({ state: demoState() });
    answerSearch(app);
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    const cls = 'cls_acyl-halides';
    act(() => app.inspectorStore.getState().open({ kind: 'class', id: cls }));
    const inspector = await screen.findByRole('complementary', { name: 'Inspector' });
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
    const editor = await screen.findByRole('dialog', { name: 'Edit Acyl halides' });
    fireEvent.click(within(editor).getByRole('button', { name: 'Make this a map family' }));
    const family = await screen.findByRole('dialog', { name: 'New map family: Acyl halides' });
    fireEvent.change(within(family).getByLabelText('Group'), { target: { value: 'Oxygen compounds' } });
    fireEvent.change(within(family).getByLabelText('Order'), { target: { value: '14' } });
    fireEvent.click(within(family).getByRole('button', { name: /^Column 0, row 2:/ }));
    const before = Object.keys(app.store.getState().records.navigator_anchor).length;
    await act(async () => void fireEvent.click(within(family).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(Object.keys(app.store.getState().records.navigator_anchor)).toHaveLength(before + 1));
    const made = Object.values(app.store.getState().records.navigator_anchor).find((a) => a.target.id === cls);
    expect(made).toMatchObject({ order: 14, group: 'Oxygen compounds', tone: 'green', cell: { column: 0, row: 2 } });
    expect(app.store.historyLabels().undo.at(-1)).toBe('Create map family: Acyl halides');
    const arrangement = arrangementsOf({ indexes: indexEngine.build(app.store.getState()) } as never).get(cls);
    expect(arrangement).toEqual({ cell: { column: 0, row: 2 }, group: 'Oxygen compounds', tone: 'green' });
    // the overview map draws it, in its group
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: /Overview|Navigator/ }));
    const svg = await screen.findByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ });
    expect(svg.querySelectorAll('[data-box="hub"]')).toHaveLength(16);
    expect(screen.getByRole('graphics-symbol', { name: /^Acyl halides, class hub, Oxygen compounds/ })).toBeTruthy();
    // and the Families list has the row
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Canvas tools' })).getByRole('button', { name: 'List' }));
    const table = await screen.findByRole('table', { name: 'Families' });
    expect(within(table).getAllByText('Acyl halides').length).toBeGreaterThan(0);
    act(() => void app.store.undo());
    expect(Object.keys(app.store.getState().records.navigator_anchor)).toHaveLength(before);
  });
  it('the Workbench has "New map family" and the palette lists it', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    openWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New map family' }));
    expect(await screen.findByRole('dialog', { name: 'New map family' })).toBeTruthy();
    const run = vi.fn();
    const base = { mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writer', writerReason: null, importReason: undefined, askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined, ui: fakeApp({ state: demoState() }).navigator.ports.ui, exams: { options: [], omitted: 0 } };
    const command = buildCommands({ ...base, newMapFamily: { reason: undefined, run } } as unknown as CommandDeps).find((c) => c.id === 'new-map-family');
    expect(command?.title).toBe('New map family');
  });
});
