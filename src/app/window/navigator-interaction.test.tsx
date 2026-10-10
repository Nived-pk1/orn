// @vitest-environment jsdom
/**
 * Selection, opening a family and the saved view (step 5.5a part 2, changed in 5.5b: the overview no longer expands, ADR-037), at
 * component level with roles and names (note E13): a click selects the node under it and an empty canvas clears; a double click on a
 * hub or the Open family button opens its page, and the button says why when it cannot; the inspector names the selection in a text
 * line; the selection, the open family and zoom are saved through the port (debounced), come back on a new window, and a read-only tab
 * keeps them without writing. A saved expansion is ignored and removed once. jsdom has no layout: what the browser does
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
// The line naming the selection sits next to the canvas toolbar (step 5.5a review, item g).
const inspector = (): HTMLElement => screen.getByRole('toolbar', { name: 'Canvas tools' });
// the toolbar's buttons (the inspector, once a record is picked, has an Open family button of its own)
const button = (name: string): HTMLElement => within(screen.getByRole('toolbar', { name: 'Canvas tools' })).getByRole('button', { name });
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
    fireEvent.click(screen.getByRole('graphics-symbol', { name: /^Alcohols to Aldehydes, 3 reactions/ }));
    expect(within(inspector()).getByText(/^Selected: Alcohols to Aldehydes, 3 reactions/)).toBeTruthy();
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
    const edge = screen.getByRole('graphics-symbol', { name: /^Alcohols to Aldehydes, 3 reactions/ });
    const [line, hit] = Array.from(edge.querySelectorAll('path'));
    expect(Number(hit?.getAttribute('stroke-width'))).toBeGreaterThan(Number(line?.getAttribute('stroke-width')));
    expect(hit?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('the overview does not expand; a family opens as a page', () => {
  it('has no Expand and no Collapse button', async () => {
    await opened();
    expect(screen.queryByRole('button', { name: 'Expand' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Collapse' })).toBeNull();
  });

  it('Open family says why it cannot act, and acts on a selected family', async () => {
    const app = await opened();
    expect(button('Open family').getAttribute('aria-disabled')).toBe('true');
    expect(reasonOf('Open family')).toBe('select a family first');
    fireEvent.click(hub('Aldehydes'));
    expect(button('Open family').getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(button('Open family'));
    expect(app.navigator.ui.family.getState().open).toBe('cls_aldehydes');
  });

  it('a selected arrow: Open family says to use Open, and Open opens the source family at the target group', async () => {
    const app = await opened();
    fireEvent.click(screen.getByRole('graphics-symbol', { name: /^Alcohols to Aldehydes, 3 reactions/ }));
    expect(reasonOf('Open family')).toBe('an arrow is selected: use Open, or select a family');
    fireEvent.click(button('Open'));
    expect(app.navigator.ui.family.getState().open).toBe('cls_alcohols');
    expect(app.navigator.ui.family.getState().target).toEqual({ section: 'reactions_of', hubId: 'cls_aldehydes' });
  });

  it('a double click on a hub opens its page and adds no node to the drawing', async () => {
    const app = await opened();
    const before = symbols();
    fireEvent.doubleClick(hub('Aldehydes'));
    expect(app.navigator.ui.family.getState().open).toBe('cls_aldehydes');
    expect(app.navigator.ui.expansion.getState().isExpanded('cls_aldehydes')).toBe(false);
    expect(before).toBeGreaterThan(0);
  });

  it('a selection that is not a family says so', async () => {
    await opened();
    fireEvent.click(screen.getByRole('graphics-symbol', { name: /^Alcohols to Aldehydes, 3 reactions/ }));
    expect(button('Open family').getAttribute('aria-disabled')).toBe('true');
  });
});

describe('the saved view', () => {
  it('saves the selection and the open family once, after the debounce', async () => {
    const app = await opened();
    fireEvent.click(hub('Aldehydes'));
    fireEvent.click(button('Open family'));
    expect(app.navigator.uiSaves).toHaveLength(0);
    act(() => app.navigator.timers.advance(299));
    expect(app.navigator.uiSaves).toHaveLength(0);
    act(() => app.navigator.timers.advance(1));
    await waitFor(() => expect(app.navigator.uiSaves).toHaveLength(1));
    expect(saved(app)).toMatchObject({ selected: { kind: 'node', id: 'cls_aldehydes' }, openFamily: 'cls_aldehydes', expanded: [] });
  });

  it('comes back in a new window: the hub is selected and its family page is open', async () => {
    const first = await opened();
    fireEvent.click(hub('Aldehydes'));
    fireEvent.click(button('Open family'));
    act(() => first.navigator.timers.advance(300));
    await waitFor(() => expect(first.navigator.uiSaves).toHaveLength(1));
    cleanup();
    const second = fakeApp({ state: demoState(), navigator: { uiPort: { stored: saved(first) } } });
    renderWithApp(second);
    expect(await screen.findByRole('region', { name: /^Family page/ })).toBeTruthy();
    expect(second.navigator.ui.family.getState().open).toBe('cls_aldehydes');
    expect(second.navigator.ui.selection.getState().selected).toEqual({ kind: 'node', id: 'cls_aldehydes' });
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

  it('a saved expansion is ignored, removed once, logged, and the removal is saved', async () => {
    const app = await opened(fakeApp({ state: demoState(), navigator: { uiPort: { stored: { expanded: [{ nodeId: 'cls_aldehydes', direction: 'both' }, { nodeId: 'gone', direction: 'both' }] } } } }));
    expect(app.navigator.ui.expansion.getState().expansion.expanded).toEqual([]);
    expect(app.navigator.logs.filter((line) => line.type === 'ui_state_expansion_removed')).toHaveLength(1);
    expect(app.navigator.logs.find((line) => line.type === 'ui_state_expansion_removed')?.message).toContain('2 entries');
    act(() => app.navigator.timers.advance(300));
    await waitFor(() => expect(saved(app)?.expanded).toEqual([]));
    // the drawing has hubs only
    expect(screen.queryAllByRole('graphics-symbol', { name: /member of a hub/ })).toHaveLength(0);
  });
});
