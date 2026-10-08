// @vitest-environment jsdom
/**
 * Selection, expansion and the saved view (step 5.5a part 2), at component level with roles and names (note E13): a click selects the
 * node under it and an empty canvas clears; a double click on a hub or the Expand / Collapse buttons toggle it, and the buttons say why
 * when they cannot; the inspector names the selection in a text line; the selection, expansion and zoom are saved through the port
 * (debounced), come back on a new window, and a read-only tab keeps them without writing. jsdom has no layout: what the browser does
 * with the drawing is proved by tests/e2e/navigator.spec.ts.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp, type FakeApp } from '@/test-support/window-kit';

afterEach(cleanup);

const drawing = (): Promise<HTMLElement> => screen.findByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ });
const hub = (name: string): HTMLElement => screen.getByRole('graphics-symbol', { name: new RegExp(`^${name}, class hub`) });
const symbols = (): number => screen.getAllByRole('graphics-symbol').length;
const inspector = (): HTMLElement => screen.getByRole('region', { name: 'Inspector empty state' });
const button = (name: string): HTMLElement => screen.getByRole('button', { name });
const reasonOf = (name: string): string | null => {
  const id = button(name).getAttribute('aria-describedby');
  return id === null ? null : (document.getElementById(id)?.textContent ?? null);
};
const saved = (app: FakeApp): Record<string, unknown> | undefined => app.navigator.uiSaves[app.navigator.uiSaves.length - 1];

async function opened(app: FakeApp = fakeApp({ state: demoState() })): Promise<FakeApp> {
  renderWithApp(app);
  await drawing();
  return app;
}

describe('selection', () => {
  it('a click on a hub selects it and the inspector names it in a text line', async () => {
    await opened();
    expect(within(inspector()).getByText('Nothing is selected.')).toBeTruthy();
    fireEvent.click(hub('Aldehydes'));
    expect(within(inspector()).getByText(/^Selected: Aldehydes, class hub/)).toBeTruthy();
  });

  it('a click on an arrow selects the arrow', async () => {
    await opened();
    fireEvent.click(screen.getByRole('graphics-symbol', { name: 'Alcohols to Aldehydes, 3 reactions' }));
    expect(within(inspector()).getByText('Selected: Alcohols to Aldehydes, 3 reactions.')).toBeTruthy();
  });

  it('a click on empty canvas clears the selection', async () => {
    await opened();
    fireEvent.click(hub('Aldehydes'));
    fireEvent.click(await drawing());
    expect(within(inspector()).getByText('Nothing is selected.')).toBeTruthy();
  });

  it('a click is handled by ONE listener on the svg: no node or arrow carries a handler of its own', async () => {
    await opened();
    const root = await drawing();
    expect(root.tagName.toLowerCase()).toBe('svg');
    for (const el of root.querySelectorAll('[data-node-id], [data-edge-id]')) expect(el.getAttribute('onclick')).toBeNull();
  });

  it('an arrow has an invisible hit path wider than its stroke', async () => {
    await opened();
    const edge = screen.getByRole('graphics-symbol', { name: 'Alcohols to Aldehydes, 3 reactions' });
    const [line, hit] = Array.from(edge.querySelectorAll('path'));
    expect(Number(hit?.getAttribute('stroke-width'))).toBeGreaterThan(Number(line?.getAttribute('stroke-width')));
    expect(hit?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('expansion', () => {
  it('Expand and Collapse say why they cannot act', async () => {
    await opened();
    expect(button('Expand').getAttribute('aria-disabled')).toBe('true');
    expect(reasonOf('Expand')).toBe('select a hub first');
    expect(reasonOf('Collapse')).toBe('select a hub first');
    fireEvent.click(hub('Aldehydes'));
    expect(button('Expand').getAttribute('aria-disabled')).toBeNull();
    expect(reasonOf('Collapse')).toBe('this hub is not expanded');
  });

  it('a double click on a hub expands it, a second one collapses it', async () => {
    const app = await opened();
    const before = symbols();
    fireEvent.doubleClick(hub('Aldehydes'));
    await waitFor(() => expect(symbols()).toBeGreaterThan(before));
    expect(app.navigator.ui.expansion.getState().isExpanded('cls_aldehydes')).toBe(true);
    fireEvent.doubleClick(hub('Aldehydes'));
    await waitFor(() => expect(symbols()).toBe(before));
    expect(app.navigator.ui.expansion.getState().isExpanded('cls_aldehydes')).toBe(false);
  });

  it('the toolbar expands and collapses the selected hub', async () => {
    await opened();
    const before = symbols();
    fireEvent.click(hub('Aldehydes'));
    fireEvent.click(button('Expand'));
    await waitFor(() => expect(symbols()).toBeGreaterThan(before));
    expect(reasonOf('Expand')).toBe('this hub is already expanded');
    fireEvent.click(button('Collapse'));
    await waitFor(() => expect(symbols()).toBe(before));
  });

  it('a selected member is not a hub: both buttons say so', async () => {
    await opened();
    fireEvent.doubleClick(hub('Aldehydes'));
    const member = await screen.findByRole('graphics-symbol', { name: /^Ethanal, species, member of a hub/ });
    fireEvent.click(member);
    expect(reasonOf('Expand')).toBe('the selection is not a hub');
    expect(reasonOf('Collapse')).toBe('the selection is not a hub');
  });

  it('a selection that leaves the drawing is cleared, and the app log says so', async () => {
    const app = await opened();
    fireEvent.doubleClick(hub('Aldehydes'));
    fireEvent.click(await screen.findByRole('graphics-symbol', { name: /^Ethanal, species, member of a hub/ }));
    fireEvent.doubleClick(hub('Aldehydes'));
    await waitFor(() => expect(within(inspector()).getByText('Nothing is selected.')).toBeTruthy());
    expect(app.navigator.logs.some((line) => line.type === 'selection_cleared')).toBe(true);
  });
});

describe('the saved view', () => {
  it('saves the selection and the expansion once, after the debounce', async () => {
    const app = await opened();
    fireEvent.click(hub('Aldehydes'));
    fireEvent.doubleClick(hub('Aldehydes'));
    expect(app.navigator.uiSaves).toHaveLength(0);
    act(() => app.navigator.timers.advance(299));
    expect(app.navigator.uiSaves).toHaveLength(0);
    act(() => app.navigator.timers.advance(1));
    await waitFor(() => expect(app.navigator.uiSaves).toHaveLength(1));
    expect(saved(app)).toMatchObject({ selected: { kind: 'node', id: 'cls_aldehydes' }, expanded: [{ nodeId: 'cls_aldehydes', direction: 'both' }] });
  });

  it('comes back in a new window: the hub is selected and expanded', async () => {
    const first = await opened();
    fireEvent.click(hub('Aldehydes'));
    fireEvent.doubleClick(hub('Aldehydes'));
    act(() => first.navigator.timers.advance(300));
    await waitFor(() => expect(first.navigator.uiSaves).toHaveLength(1));
    const grown = symbols();
    cleanup();
    const second = await opened(fakeApp({ state: demoState(), navigator: { uiPort: { stored: saved(first) } } }));
    await waitFor(() => expect(symbols()).toBe(grown));
    expect(within(inspector()).getByText(/^Selected: Aldehydes, class hub/)).toBeTruthy();
    expect(second.navigator.ui.expansion.getState().isExpanded('cls_aldehydes')).toBe(true);
  });

  it('a read-only tab keeps its values and writes nothing, and says so', async () => {
    const app = await opened(fakeApp({ state: demoState(), navigator: { uiPort: { mode: () => 'read_only' } } }));
    fireEvent.click(hub('Aldehydes'));
    act(() => app.navigator.timers.advance(1000));
    expect(app.navigator.uiSaves).toHaveLength(0);
    expect(within(inspector()).getByText(/^Selected: Aldehydes/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Saved view' }).textContent).toContain('not saved: this tab is read-only');
  });

  it('a session-only tab writes nothing either, and says so', async () => {
    const app = await opened(fakeApp({ state: demoState(), navigator: { uiPort: { mode: () => 'session_only' } } }));
    fireEvent.click(hub('Aldehydes'));
    act(() => app.navigator.timers.advance(1000));
    expect(app.navigator.uiSaves).toHaveLength(0);
    expect(screen.getByRole('region', { name: 'Saved view' }).textContent).toContain('nothing is saved in this session');
  });

  it('a damaged entry is reset to the defaults and reported, never fatal', async () => {
    const app = await opened(fakeApp({ state: demoState(), navigator: { uiPort: { stored: { selected: 7, expanded: 'all', viewports: { navigator: { x: 'a' } } } } } }));
    expect(within(inspector()).getByText('Nothing is selected.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Saved view' }).textContent).toContain('damaged and was reset (selected, expanded, viewports.navigator)');
    expect(app.navigator.logs.some((line) => line.type === 'ui_state_reset')).toBe(true);
  });

  it('an expansion entry that names no hub is removed, logged, and the removal is saved', async () => {
    const app = await opened(fakeApp({ state: demoState(), navigator: { uiPort: { stored: { expanded: [{ nodeId: 'cls_aldehydes', direction: 'both' }, { nodeId: 'gone', direction: 'both' }] } } } }));
    await waitFor(() => expect(app.navigator.ui.expansion.getState().expansion.expanded).toEqual([{ nodeId: 'cls_aldehydes', direction: 'both' }]));
    expect(app.navigator.logs.find((line) => line.type === 'expansion_pruned')?.message).toContain('gone');
    act(() => app.navigator.timers.advance(300));
    await waitFor(() => expect(saved(app)?.expanded).toEqual([{ nodeId: 'cls_aldehydes', direction: 'both' }]));
  });
});
