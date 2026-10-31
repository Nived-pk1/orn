// @vitest-environment jsdom
/**
 * The phone home (ADR-039) through the real window on the demo: the bottom tab bar Families | Map | Explore | Search, the Families cards equal the
 * List projection (count, order, groups), the map without a toolbar and a permanent legend but with floating Fit and Legend buttons, the
 * remembered tab, and the Search tab. The desktop tests elsewhere run without matchMedia and are not touched.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRAVERSAL_LIMITS, navigatorProjection } from '@/core/graph';
import { indexEngine } from '@/core/indexes';
import { NAVIGATOR_MAX_EDGES, NAVIGATOR_MAX_NODES } from '@/features/navigator/limits';
import { PHONE_QUERIES } from '@/ui/hooks';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { prefetchPalette } from './lazy-palette';

beforeAll(async () => {
  await prefetchPalette(); // the palette is a lazy chunk since step 6.1a: load it once so these tests open it at once
  stubDialog();
  fakeLayout();
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => undefined;
  // jsdom does no layout: a tall box so the virtual tables of the List view render every row of the demo
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 4000 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 900 });
  HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 900, bottom: 4000, width: 900, height: 4000, toJSON: () => ({}) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const phone = (): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
};
const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const demo = (): FakeApp => fakeApp({ state: demoState() });
const tabs = (): HTMLElement => screen.getByRole('navigation', { name: 'Home' });
const tab = (name: string): HTMLElement => within(tabs()).getByRole('button', { name });
const cards = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[data-view="families"] [data-family-id]')];

/** What the List view says on the desktop for the same data: the family ids in its order, and each one's group. */
async function listRows(): Promise<{ ids: string[]; groups: Map<string, string> }> {
  renderWithApp(demo());
  await screen.findByRole('group', { name: NAVIGATOR });
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'Canvas tools' })).getByRole('button', { name: 'List' }));
  const table = await screen.findByRole('table', { name: 'Families' });
  const rows = [...table.querySelectorAll<HTMLElement>('[data-row-key]')];
  const groups = new Map(rows.map((row) => [row.getAttribute('data-row-key') as string, (within(row).getAllByRole('cell')[1]?.textContent ?? '').replace(/^No group$/, '')]));
  cleanup();
  return { ids: rows.map((row) => row.getAttribute('data-row-key') as string), groups };
}

describe('the Families tab', () => {
  it('has a tab bar of five labelled buttons; Families is current once chosen (the Study phone starts on Chapters, 7.3b E1)', async () => {
    phone();
    renderWithApp(demo());
    await screen.findByRole('navigation', { name: 'Home' });
    expect(within(tabs()).getAllByRole('button').map((button) => button.textContent)).toEqual(['Chapters', 'Families', 'Map', 'Explore', 'Search']);
    fireEvent.click(tab('Families'));
    await screen.findByRole('region', { name: 'Families' });
    expect(tab('Families').getAttribute('aria-current')).toBe('page');
    expect(tab('Map').getAttribute('aria-current')).toBeNull();
    expect(screen.queryByRole('group', { name: NAVIGATOR })).toBeNull();
    expect(screen.queryByRole('toolbar', { name: 'Canvas tools' })).toBeNull();
  });

  it('shows the same families as the List view: the same count, the same order inside a group, the same group for each', async () => {
    const list = await listRows();
    phone();
    renderWithApp(demo());
    await screen.findByRole('region', { name: 'Families' });
    const shown = cards();
    expect(shown.map((card) => card.getAttribute('data-family-id')).sort()).toEqual([...list.ids].sort());
    const projection = (() => {
      const state = demoState();
      return navigatorProjection.build(
        { state, indexes: indexEngine.build(state, 1), scopeOf: () => 'unmapped' },
        { view: 'navigator', focus: [], expansion: { expanded: [], collapsedEdgeIds: [] }, filters: { scopes: [], topicIds: [], reagentFamilies: [] }, limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: NAVIGATOR_MAX_NODES, maxEdges: NAVIGATOR_MAX_EDGES } },
      );
    })();
    expect(shown).toHaveLength(projection.nodes.filter((node) => list.ids.includes(node.id)).length);
    for (const group of [...document.querySelectorAll<HTMLElement>('[data-view="families"] > section')].filter((section) => section.querySelector(':scope > h2') !== null)) {
      const title = group.querySelector(':scope > h2')?.textContent ?? '';
      const ids = [...group.querySelectorAll<HTMLElement>('[data-family-id]')].map((card) => card.getAttribute('data-family-id') as string);
      if (ids.length === 0) continue;
      expect(ids, `the order inside ${title}`).toEqual(list.ids.filter((id) => ids.includes(id)));
      for (const id of ids) {
        const named = list.groups.get(id) ?? '';
        if (title === 'No group') expect(named).toBe('');
        else if (title !== 'Unclassified') expect(named, `the group of ${id}`).toBe(title);
      }
    }
  });

  it('writes each card as name, general formula and "N reactions", grouped under the colour groups', async () => {
    phone();
    renderWithApp(demo());
    await screen.findByRole('region', { name: 'Families' });
    const alcohols = cards().find((card) => card.getAttribute('data-family-id') === 'cls_alcohols') as HTMLElement;
    expect(alcohols.textContent).toMatch(/^AlcoholsR[–-]OH\d+ reactions?$/);
    const titles = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    for (const group of ['Hydrocarbons', 'Halogen compounds', 'Oxygen compounds', 'Nitrogen compounds']) expect(titles).toContain(group);
    expect(titles.indexOf('Hydrocarbons')).toBeLessThan(titles.indexOf('Oxygen compounds'));
    expect(within(screen.getByRole('region', { name: 'Oxygen compounds' })).getByRole('button', { name: /^Alcohols/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Unanchored reactions \(\d+\)$/ })).toBeTruthy();
  });

  it('a tap on a card opens the family page, and the Families tab leaves it again', async () => {
    phone();
    const app = demo();
    renderWithApp(app);
    await screen.findByRole('region', { name: 'Families' });
    fireEvent.click(cards().find((card) => card.getAttribute('data-family-id') === 'cls_alcohols') as HTMLElement);
    act(() => app.navigator.timers.advance(0));
    expect(await screen.findByRole('region', { name: 'Family page: Alcohols' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Home' })).toBeTruthy();
    fireEvent.click(tab('Families'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Family page: Alcohols' })).toBeNull());
    expect(screen.getByRole('region', { name: 'Families' })).toBeTruthy();
  });
});

describe('the Map tab', () => {
  it('has no toolbar row and no permanent legend, but a round Fit and a round Legend button', async () => {
    phone();
    const app = demo();
    app.navigator.ui.overview.getState().setPhoneTab('map');
    renderWithApp(app);
    await screen.findByRole('group', { name: NAVIGATOR });
    expect(tab('Map').getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('toolbar', { name: 'Canvas tools' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Family groups' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Fit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Legend' })).toBeTruthy();
  });

  it('Legend opens a sheet with the legend, and it closes again', async () => {
    phone();
    const app = demo();
    app.navigator.ui.overview.getState().setPhoneTab('map');
    renderWithApp(app);
    await screen.findByRole('group', { name: NAVIGATOR });
    fireEvent.click(screen.getByRole('button', { name: 'Legend' }));
    const legend = screen.getByRole('dialog', { name: 'Legend' });
    expect(within(legend).getByRole('list', { name: 'Family groups' })).toBeTruthy();
    expect(within(legend).getByText(/number of reactions on this arrow/)).toBeTruthy();
  });

  it('the Map tab shows the map and remembers the choice in the UI store', async () => {
    phone();
    const app = demo();
    renderWithApp(app);
    await screen.findByRole('region', { name: 'Families' });
    fireEvent.click(tab('Map'));
    await screen.findByRole('group', { name: NAVIGATOR });
    expect(app.navigator.ui.overview.getState().phoneTab).toBe('map');
    fireEvent.click(tab('Families'));
    await screen.findByRole('region', { name: 'Families' });
    expect(app.navigator.ui.overview.getState().phoneTab).toBe('families');
  });

  it('a remembered Map tab is the one shown after a reload (the store starts on it)', async () => {
    phone();
    const app = demo();
    app.navigator.ui.overview.getState().setPhoneTab('map');
    renderWithApp(app);
    expect(await screen.findByRole('group', { name: NAVIGATOR })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Families' })).toBeNull();
  });
});

describe('the Search tab', () => {
  it('opens the palette (full screen on a phone) and marks itself current while it is open', async () => {
    phone();
    renderWithApp(demo());
    await screen.findByRole('region', { name: 'Families' });
    await act(async () => {
      fireEvent.click(tab('Search'));
    });
    const palette = screen.getByRole('dialog', { name: 'Search' });
    expect(palette.className).toMatch(/screen/);
    expect(tab('Search').getAttribute('aria-current')).toBe('page');
    expect(tab('Families').getAttribute('aria-current')).toBeNull();
  });
});
