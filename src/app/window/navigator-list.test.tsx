// @vitest-environment jsdom
/**
 * The List view (step 5.7, item j) at component level on the demo: the same projection as the map (counts and order equal the
 * projection, read here straight from `navigatorProjection`, not from the Scene), two accessible tables, sortable by name and by
 * count, a row opens the inspector, Enter on a family row opens its page, and the Map / List choice is saved and comes back.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_TRAVERSAL_LIMITS, navigatorProjection } from '@/core/graph';
import { indexEngine } from '@/core/indexes';
import { NAVIGATOR_MAX_EDGES, NAVIGATOR_MAX_NODES } from '@/features/navigator/limits';
import { drawnPaths } from '@/render/scene';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp, type FakeApp } from '@/test-support/window-kit';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => undefined;
  // jsdom does no layout: give every element a tall box so the virtual tables render all of the demo's rows (the e2e proves the windowing).
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 4000 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 900 });
  HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 900, bottom: 4000, width: 900, height: 4000, toJSON: () => ({}) });
});
afterEach(cleanup);

/** What the projection of the demo (the navigator's request) says: its hubs in order, and its drawn paths. */
function projectionOfDemo() {
  const state = demoState();
  const projection = navigatorProjection.build(
    { state, indexes: indexEngine.build(state, 1), scopeOf: () => 'unmapped' },
    { view: 'navigator', focus: [], expansion: { expanded: [], collapsedEdgeIds: [] }, filters: { scopes: [], topicIds: [], reagentFamilies: [] }, limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: NAVIGATOR_MAX_NODES, maxEdges: NAVIGATOR_MAX_EDGES } },
  );
  return { projection, paths: drawnPaths(projection) };
}

const toolbar = (): HTMLElement => screen.getByRole('toolbar', { name: 'Canvas tools' });
const listToggle = (): HTMLElement => within(toolbar()).getByRole('button', { name: 'List' });
const table = (name: string): HTMLElement => screen.getByRole('table', { name });
const bodyRows = (name: string): HTMLElement[] => [...table(name).querySelectorAll<HTMLElement>('[data-row-key]')];
const keysOf = (name: string): string[] => bodyRows(name).map((row) => row.getAttribute('data-row-key') as string);
const cellsOf = (row: HTMLElement): string[] => within(row).getAllByRole('cell').map((cell) => cell.textContent ?? '');
const stop = (name: string): string | null | undefined => table(name).querySelector('[role="row"][tabindex="0"]')?.getAttribute('data-row-key');

async function listed(app: FakeApp = fakeApp({ state: demoState() })): Promise<FakeApp> {
  renderWithApp(app);
  await screen.findByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ });
  fireEvent.click(listToggle());
  await screen.findByRole('table', { name: 'Families' });
  return app;
}

describe('the List view equals the projection', () => {
  it('has one family row per hub of the projection, in the projections order, with its reactions out and in', async () => {
    await listed();
    const { projection, paths } = projectionOfDemo();
    expect(keysOf('Families')).toEqual(projection.nodes.map((node) => node.id));
    for (const row of bodyRows('Families')) {
      const id = row.getAttribute('data-row-key') as string;
      const out = paths.filter((path) => path.from === id).reduce((sum, path) => sum + path.total, 0);
      const into = paths.filter((path) => path.to === id).reduce((sum, path) => sum + path.total, 0);
      const cells = cellsOf(row);
      expect(Number(cells[2]), `${id} out`).toBe(out);
      expect(Number(cells[3]), `${id} in`).toBe(into);
    }
    expect(table('Families').getAttribute('aria-rowcount')).toBe(String(projection.nodes.length + 1));
  });

  it('has one arrow row per drawn path with its from, to and number of reactions', async () => {
    await listed();
    const { paths, projection } = projectionOfDemo();
    expect(bodyRows('Arrows')).toHaveLength(paths.length);
    expect(table('Arrows').getAttribute('aria-rowcount')).toBe(String(paths.length + 1));
    const nameOf = new Map(bodyRows('Families').map((row) => [row.getAttribute('data-row-key') as string, cellsOf(row)[0]] as const));
    expect(nameOf.size).toBe(projection.nodes.length);
    const expected = paths.map((path) => `${nameOf.get(path.from)} > ${nameOf.get(path.to)} > ${path.total}`).sort();
    const shown = bodyRows('Arrows').map((row) => {
      const cells = cellsOf(row);
      return `${cells[0]} > ${cells[1]} > ${cells[2]}`;
    });
    expect([...shown].sort()).toEqual(expected);
    expect(new Set(keysOf('Arrows')).size).toBe(paths.length);
  });

  it('is accessible: tables with named columns, rows with positions, one tab stop per table', async () => {
    await listed();
    for (const name of ['Families', 'Arrows']) {
      const t = table(name);
      expect(within(t).getAllByRole('columnheader').length).toBeGreaterThanOrEqual(3);
      expect(bodyRows(name)[0]?.getAttribute('aria-rowindex')).toBe('2');
      expect(t.querySelectorAll('[role="row"][tabindex="0"]')).toHaveLength(1);
    }
    expect(within(table('Families')).getByRole('columnheader', { name: /^Family/ }).getAttribute('aria-sort')).toBe('none');
  });
});

describe('sorting', () => {
  it('sorts by name and by count, ascending then descending, then back to the maps order', async () => {
    await listed();
    const original = keysOf('Families');
    const header = (name: RegExp): HTMLElement => within(table('Families')).getByRole('button', { name });
    const names = (): string[] => bodyRows('Families').map((row) => cellsOf(row)[0] as string);
    fireEvent.click(header(/^Family/));
    expect(names()).toEqual([...names()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    expect(within(table('Families')).getByRole('columnheader', { name: /^Family/ }).getAttribute('aria-sort')).toBe('ascending');
    fireEvent.click(header(/^Family/));
    expect(names()).toEqual([...names()].sort((a, b) => b.localeCompare(a, 'en', { sensitivity: 'base' })));
    fireEvent.click(header(/^Family/));
    expect(keysOf('Families')).toEqual(original);
    fireEvent.click(header(/^Reactions out/));
    const outs = bodyRows('Families').map((row) => Number(cellsOf(row)[2]));
    expect(outs).toEqual([...outs].sort((a, b) => a - b));
    fireEvent.click(header(/^Reactions out/));
    const down = bodyRows('Families').map((row) => Number(cellsOf(row)[2]));
    expect(down).toEqual([...down].sort((a, b) => b - a));
    fireEvent.click(within(table('Arrows')).getByRole('button', { name: /^Reactions/ }));
    const counts = bodyRows('Arrows').map((row) => Number(cellsOf(row)[2]));
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });
});

describe('opening from a row', () => {
  it('a click shows the family in the inspector; Enter opens its page; a double click opens it too', async () => {
    const app = await listed();
    const row = bodyRows('Families').find((candidate) => candidate.getAttribute('data-row-key') === 'cls_alcohols') as HTMLElement;
    const reveals = app.navigator.ui.selection.getState().reveals;
    fireEvent.click(row);
    expect(app.navigator.ui.selection.getState().selected).toEqual({ kind: 'node', id: 'cls_alcohols' });
    expect(app.navigator.ui.selection.getState().reveals).toBe(reveals + 1);
    expect(app.navigator.ui.family.getState().open).toBeNull();
    act(() => row.focus());
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(app.navigator.ui.family.getState().open).toBe('cls_alcohols');
    act(() => app.navigator.ui.family.getState().closeFamily());
    await screen.findByRole('table', { name: 'Families' });
    fireEvent.doubleClick(bodyRows('Families').find((candidate) => candidate.getAttribute('data-row-key') === 'cls_aldehydes') as HTMLElement);
    expect(app.navigator.ui.family.getState().open).toBe('cls_aldehydes');
  });

  it('an arrow row shows the arrow in the inspector, on a click, Space and Enter', async () => {
    const app = await listed();
    const row = bodyRows('Arrows')[0] as HTMLElement;
    const id = row.getAttribute('data-row-key') as string;
    for (const gesture of [() => fireEvent.click(row), () => fireEvent.keyDown(row, { key: ' ' }), () => fireEvent.keyDown(row, { key: 'Enter' })]) {
      const before = app.navigator.ui.selection.getState().reveals;
      gesture();
      expect(app.navigator.ui.selection.getState().selected).toEqual({ kind: 'edge', id });
      expect(app.navigator.ui.selection.getState().reveals).toBe(before + 1);
    }
  });

  it('arrow keys move the one tab stop between rows', async () => {
    await listed();
    const rows = bodyRows('Families');
    act(() => rows[0]?.focus());
    fireEvent.keyDown(rows[0] as HTMLElement, { key: 'ArrowDown' });
    await waitFor(() => expect(stop('Families')).toBe(rows[1]?.getAttribute('data-row-key')));
    fireEvent.keyDown(bodyRows('Families')[1] as HTMLElement, { key: 'End' });
    await waitFor(() => expect(stop('Families')).toBe(rows.at(-1)?.getAttribute('data-row-key')));
  });
});

describe('Map / List is saved', () => {
  it('the choice is written to uiState and a new window comes back in the List view; the zoom buttons say why they are off', async () => {
    const app = await listed();
    expect(listToggle().getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('group', { name: /^Navigator:/ })).toBeNull();
    expect(within(toolbar()).getByRole('button', { name: 'Zoom in' }).getAttribute('aria-disabled')).toBe('true');
    act(() => app.navigator.timers.advance(300));
    await waitFor(() => expect(app.navigator.uiSaves.at(-1)).toMatchObject({ overviewMode: 'list' }));
    const stored = app.navigator.uiSaves.at(-1);
    cleanup();
    const second = fakeApp({ state: demoState(), navigator: { uiPort: { stored } } });
    renderWithApp(second);
    expect(await screen.findByRole('table', { name: 'Families' })).toBeTruthy();
    fireEvent.click(listToggle());
    expect(await screen.findByRole('group', { name: /^Navigator:/ })).toBeTruthy();
    expect(second.navigator.ui.overview.getState().mode).toBe('map');
  });

  it('a damaged mode is reset to the map and reported, never fatal', async () => {
    const app = fakeApp({ state: demoState(), navigator: { uiPort: { stored: { overviewMode: 'grid' } } } });
    renderWithApp(app);
    expect(await screen.findByRole('group', { name: /^Navigator:/ })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Saved view' }).textContent).toContain('overviewMode');
  });
});
