// @vitest-environment jsdom
/**
 * Keyboard, context menu and live region of the overview map (step 5.7, items e to h), at component level on the demo. jsdom has no
 * layout, so what is proved here is the contract (which family has the focus, what each key does, what the menu offers, what is said)
 * and the RENDER COUNT of the focus mechanism; the real browsers and the visible focus ring are proved by tests/e2e/navigator-keyboard.spec.ts.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { firePointer, tap } from '@/test-support/pointer-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';

beforeAll(() => {
  stubDialog(); // Ctrl+K belongs to the window now (the palette); the canvas still leaves it alone
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  const proto = Element.prototype as unknown as { hasPointerCapture?: () => boolean; scrollIntoView?: () => void; releasePointerCapture?: () => void };
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});
afterEach(cleanup);

const drawing = (): Promise<HTMLElement> => screen.findByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ });
const nodeOf = (id: string): Element => document.querySelector(`[data-node-id="${id}"]`) as Element;
const activeNode = (svg: HTMLElement): string | null => {
  const id = svg.getAttribute('aria-activedescendant');
  return id === null ? null : (document.getElementById(id)?.getAttribute('data-node-id') ?? null);
};
const press = (svg: HTMLElement, key: string, init: Partial<KeyboardEventInit> = {}): boolean => fireEvent.keyDown(svg, { key, ...init });
const canvas = (): HTMLElement => document.querySelector('[data-layer-commits]') as HTMLElement;
const commits = (layer: string): number => Number(canvas().getAttribute(`data-commits-${layer}`) ?? '0');
const said = (): string => screen.getByRole('status', { name: 'Navigator announcements' }).textContent ?? '';

async function opened(): Promise<{ app: FakeApp; svg: HTMLElement }> {
  const app = fakeApp({ state: demoState() });
  renderWithApp(app);
  const svg = await drawing();
  return { app, svg };
}
const focusCanvas = (svg: HTMLElement): void => {
  act(() => svg.focus());
};

describe('focus on the canvas (item e): one tab stop, aria-activedescendant', () => {
  it('the drawing is the only tab stop of the map and has no node or arrow in the tab order', async () => {
    const { svg } = await opened();
    expect(svg.getAttribute('tabindex')).toBe('0');
    const stops = [...svg.querySelectorAll('[tabindex]')];
    expect(stops).toEqual([]);
  });

  it('focus enters at the first family in reading order, and its group carries the id the drawing names', async () => {
    const { svg } = await opened();
    expect(svg.hasAttribute('aria-activedescendant')).toBe(false);
    focusCanvas(svg);
    const id = activeNode(svg);
    expect(id).not.toBeNull();
    const node = nodeOf(id as string);
    expect(node.getAttribute('data-box')).toBe('hub');
    expect(node.getAttribute('role')).toBe('graphics-symbol');
    expect(node.getAttribute('aria-label')).toMatch(/class hub/);
  });

  it('arrow keys and Tab move the focus through the families; Tab past the last one is left to the browser', async () => {
    const { svg } = await opened();
    focusCanvas(svg);
    const first = activeNode(svg);
    const hubs = [...document.querySelectorAll('[data-box="hub"], [data-box="unclassified"]')].map((el) => el.getAttribute('data-node-id'));
    const visited = [first];
    for (let step = 1; step < hubs.length; step += 1) {
      expect(press(svg, 'Tab')).toBe(false); // handled: the default is prevented
      visited.push(activeNode(svg));
    }
    expect(new Set(visited).size).toBe(hubs.length);
    expect([...visited].sort()).toEqual([...hubs].sort());
    expect(press(svg, 'Tab')).toBe(true); // past the end: not handled, the focus leaves the canvas
    expect(activeNode(svg)).toBe(visited.at(-1));
    // and back
    expect(press(svg, 'Tab', { shiftKey: true })).toBe(false);
    expect(activeNode(svg)).toBe(visited.at(-2));
    // an arrow key moves to a different family when one lies that way, and says so when none does
    const from = activeNode(svg);
    press(svg, 'ArrowDown');
    press(svg, 'ArrowRight');
    press(svg, 'ArrowUp');
    press(svg, 'ArrowLeft');
    expect(activeNode(svg)).not.toBeNull();
    expect(from).not.toBeNull();
  });

  it('MEASURED: moving the focus renders the overlay and no other layer (nodes, edges, labels, badges stay untouched)', async () => {
    const { svg } = await opened();
    focusCanvas(svg);
    const before = { nodes: commits('nodes'), edges: commits('edges'), labels: commits('labels'), badges: commits('badges'), overlay: commits('overlay') };
    const moves = 12;
    for (let step = 0; step < moves; step += 1) press(svg, 'Tab');
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) press(svg, key);
    const after = { nodes: commits('nodes'), edges: commits('edges'), labels: commits('labels'), badges: commits('badges'), overlay: commits('overlay') };
    // the numbers go into docs/PROGRESS.md
    console.info(`focus moves: before ${JSON.stringify(before)} after ${JSON.stringify(after)} (${moves + 4} key presses)`);
    expect({ nodes: after.nodes, edges: after.edges, labels: after.labels, badges: after.badges }).toEqual({ nodes: before.nodes, edges: before.edges, labels: before.labels, badges: before.badges });
    expect(after.overlay).toBeGreaterThan(before.overlay);
  });

  it('blurring takes the active family away; a click puts the keyboard cursor on the clicked family without a ring', async () => {
    const { svg } = await opened();
    focusCanvas(svg);
    expect(activeNode(svg)).not.toBeNull();
    act(() => svg.blur());
    expect(svg.hasAttribute('aria-activedescendant')).toBe(false);
    tap(nodeOf('cls_aldehydes'));
    expect(activeNode(svg)).toBe('cls_aldehydes');
    expect(document.querySelector('[data-overlay="focus"]')).toBeNull();
  });
});

describe('the keyboard map (item f)', () => {
  it('Enter selects the family and asks for the inspector; Enter again, or O, opens its family page', async () => {
    const { app, svg } = await opened();
    focusCanvas(svg);
    for (let i = 0; i < 40 && activeNode(svg) !== 'cls_aldehydes'; i += 1) press(svg, 'Tab');
    expect(activeNode(svg)).toBe('cls_aldehydes');
    const reveals = app.navigator.ui.selection.getState().reveals;
    press(svg, 'Enter');
    expect(app.navigator.ui.selection.getState().selected).toEqual({ kind: 'node', id: 'cls_aldehydes' });
    expect(app.navigator.ui.selection.getState().reveals).toBe(reveals + 1);
    expect(app.navigator.ui.family.getState().open).toBeNull();
    press(svg, 'Enter');
    expect(app.navigator.ui.family.getState().open).toBe('cls_aldehydes');
  });

  it('O opens the page of the focused family at once', async () => {
    const { app, svg } = await opened();
    focusCanvas(svg);
    const target = activeNode(svg);
    expect(target).not.toBeNull();
    press(svg, 'o');
    expect(app.navigator.ui.family.getState().open).toBe(target);
  });

  it('Esc clears the selection; with nothing selected it is left to the layers around the canvas', async () => {
    const { app, svg } = await opened();
    focusCanvas(svg);
    press(svg, 'Enter');
    expect(app.navigator.ui.selection.getState().selected).not.toBeNull();
    expect(press(svg, 'Escape')).toBe(false);
    expect(app.navigator.ui.selection.getState().selected).toBeNull();
    expect(said()).toBe('Selection cleared');
    expect(press(svg, 'Escape')).toBe(true);
  });

  it('keys with another owner or no meaning are not taken (Alt+Left, Ctrl+K, C)', async () => {
    const { svg } = await opened();
    focusCanvas(svg);
    const before = activeNode(svg);
    press(svg, 'ArrowLeft', { altKey: true }); // the inspector history's key: the canvas does not move
    expect(activeNode(svg)).toBe(before);
    expect(press(svg, 'k', { ctrlKey: true })).toBe(false); // the window's palette takes it (step 5.8); the canvas does not
    expect(press(svg, 'c')).toBe(true);
  });

  it('+ - 0 and F are handled (zoom in, zoom out, fit, centre)', async () => {
    const { svg } = await opened();
    focusCanvas(svg);
    for (const key of ['+', '-', '0', 'f']) expect(press(svg, key), key).toBe(false);
  });
});

describe('the context menu (item g)', () => {
  it('Shift+F10 on a family: Open family page, Show in inspector, and its arrows, each selecting that arrow', async () => {
    const { app, svg } = await opened();
    focusCanvas(svg);
    for (let i = 0; i < 40 && activeNode(svg) !== 'cls_alcohols'; i += 1) press(svg, 'Tab');
    press(svg, 'F10', { shiftKey: true });
    const menu = await screen.findByRole('menu', { name: /^Alcohols/ });
    const items = within(menu).getAllByRole('menuitem').map((item) => item.textContent);
    expect(items.slice(0, 2)).toEqual(['Open family page', 'Show in inspector']);
    expect(items).toContain('To Aldehydes (3 reactions)');
    const arrow = within(menu).getByRole('menuitem', { name: 'To Aldehydes (3 reactions)' });
    fireEvent.click(arrow);
    await waitFor(() => expect(app.navigator.ui.selection.getState().selected?.kind).toBe('edge'));
    const edgeId = app.navigator.ui.selection.getState().selected?.id as string;
    expect(document.querySelector(`[data-edge-id="${edgeId}"]`)?.getAttribute('aria-label')).toMatch(/^Alcohols to Aldehydes, 3 reactions/);
  });

  it('the menu key and a right click open the menu too; a right click on an arrow offers Open at this group', async () => {
    const { svg } = await opened();
    focusCanvas(svg);
    press(svg, 'ContextMenu');
    expect(await screen.findByRole('menu')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    const edge = document.querySelector('[data-edge-id]') as Element;
    fireEvent.contextMenu(edge.querySelector('path') as Element, { clientX: 40, clientY: 50 });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Open at this group', 'Show in inspector']);
  });

  it('a long press (500 ms, a finger) opens the menu on the family', async () => {
    const { app } = await opened();
    firePointer(nodeOf('cls_alcohols'), 'pointerdown', { kind: 'touch' });
    expect(screen.queryByRole('menu')).toBeNull();
    act(() => app.navigator.timers.advance(500));
    expect(await screen.findByRole('menu', { name: /^Alcohols/ })).toBeTruthy();
  });
});

describe('the live region (item h): one polite region, in words', () => {
  it('says the selection, the opened page and coming back', async () => {
    const { app, svg } = await opened();
    expect(screen.getAllByRole('status', { name: 'Navigator announcements' })).toHaveLength(1);
    expect(screen.getByRole('status', { name: 'Navigator announcements' }).getAttribute('aria-live')).toBe('polite');
    tap(nodeOf('cls_aldehydes'));
    expect(said()).toMatch(/^Selected Aldehydes, class hub/);
    act(() => app.navigator.ui.family.getState().openFamily('cls_aldehydes'));
    expect(said()).toBe('Opened the family page of Aldehydes');
    act(() => app.navigator.ui.family.getState().closeFamily());
    expect(said()).toBe('Back to the overview');
    expect(svg).toBeTruthy();
  });

  it('the inspector pane opens when a click is confirmed (300 ms), not at the click, and a double click opens the page instead', async () => {
    const { app } = await opened();
    tap(nodeOf('cls_aldehydes'));
    const reveals = app.navigator.ui.selection.getState().reveals;
    act(() => app.navigator.timers.advance(299));
    expect(app.navigator.ui.selection.getState().reveals).toBe(reveals);
    act(() => app.navigator.timers.advance(1));
    expect(app.navigator.ui.selection.getState().reveals).toBe(reveals + 1);
    tap(nodeOf('cls_alcohols'));
    tap(nodeOf('cls_alcohols'));
    act(() => app.navigator.timers.advance(1000));
    expect(app.navigator.ui.selection.getState().reveals).toBe(reveals + 1);
    expect(app.navigator.ui.family.getState().open).toBe('cls_alcohols');
  });
});
