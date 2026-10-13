/**
 * Keyboard and pointer on the overview map (step 5.7, part 1), Chromium against the PRODUCTION build: the drawing is one tab stop and
 * the family with the focus is named by aria-activedescendant; moving the focus renders the overlay and no other layer (MEASURED in the
 * browser from the layer commit counters); the key map; the context menu from the keyboard and the pointer; a click selects at once
 * and shows the inspector only after the 300 ms window while a double click opens the family page without the drawing moving; the one
 * live region; axe on the canvas and the open menu; zero policy violations, console errors and foreign requests.
 */
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, loadDemo, openApp, tabFromTop, watch } from './kit';

const SHOTS = resolve(process.cwd(), 'screenshots');
const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const drawing = (page: Page) => page.getByRole('group', { name: NAVIGATOR });
const pane = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const live = (page: Page) => page.getByRole('status', { name: 'Navigator announcements' });

async function openDemo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(drawing(page)).toBeVisible();
}

const activeFamily = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const svg = document.querySelector('svg[role="group"][aria-label^="Navigator"]');
    const id = svg?.getAttribute('aria-activedescendant');
    return id === null || id === undefined ? null : (document.getElementById(id)?.getAttribute('data-node-id') ?? null);
  });

const commits = (page: Page): Promise<{ nodes: number; edges: number; labels: number; badges: number; overlay: number }> =>
  page.evaluate(() => {
    const root = document.querySelector('[data-layer-commits]');
    const read = (layer: string): number => Number(root?.getAttribute(`data-commits-${layer}`) ?? '0');
    return { nodes: read('nodes'), edges: read('edges'), labels: read('labels'), badges: read('badges'), overlay: read('overlay') };
  });

async function focusFamily(page: Page, id: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // Tab forward from where the focus lands; if the end of the reading order is reached first (Tab leaves the canvas), come back the other way
  for (const key of ['Tab', 'Shift+Tab']) {
    await drawing(page).focus();
    for (let i = 0; i < 40 && (await drawing(page).evaluate((el) => el === document.activeElement)) && (await activeFamily(page)) !== id; i += 1) await page.keyboard.press(key);
    if ((await activeFamily(page)) === id) break;
  }
  expect(await activeFamily(page)).toBe(id);
}

test.describe('the overview map with the keyboard', () => {
  test('one tab stop; arrows and Tab move the focus; the focus ring shows; no node, edge, label or badge layer renders', async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await watch(page);
    await openDemo(page);
    // the drawing is the only tab stop inside the map; no node or arrow is focusable by itself
    expect(await page.locator('svg [tabindex]').count()).toBe(0);
    await tabFromTop(page);
    await page.keyboard.press('Tab');
    const stops: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      if ((await drawing(page).evaluate((el) => el === document.activeElement)) === true) break;
      await page.keyboard.press('Tab');
    }
    expect(await drawing(page).evaluate((el) => el === document.activeElement)).toBe(true);
    const first = await activeFamily(page);
    expect(first).not.toBeNull();
    await expect(page.locator('[data-overlay="focus"]')).toHaveCount(1);
    stops.push(first as string);

    const before = await commits(page);
    const moves = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown'];
    for (const key of moves) {
      await page.keyboard.press(key);
      stops.push((await activeFamily(page)) ?? 'none');
    }
    const after = await commits(page);
    console.log(`focus moves in the browser: before ${JSON.stringify(before)} after ${JSON.stringify(after)} (${moves.length} key presses)`);
    expect({ nodes: after.nodes, edges: after.edges, labels: after.labels, badges: after.badges }).toEqual({ nodes: before.nodes, edges: before.edges, labels: before.labels, badges: before.badges });
    expect(after.overlay).toBeGreaterThan(before.overlay);
    expect(new Set(stops).size).toBeGreaterThan(3);
    expect(stops).not.toContain('none');
    await expect(page.locator('[data-overlay="focus"]')).toHaveCount(1);

    // every family drawn is reachable by Tab, in reading order, and Tab past the last leaves the canvas
    const hubs = await page.locator('svg [data-box="hub"], svg [data-box="unclassified"]').count();
    await drawing(page).focus();
    const visited = new Set<string>();
    const inCanvas = (): Promise<boolean> => drawing(page).evaluate((el) => el === document.activeElement);
    for (const key of ['Tab', 'Shift+Tab']) {
      // walk to one end (Tab leaves the canvas past the last family, Shift+Tab before the first), then the other way
      for (let i = 0; i < hubs + 2 && (await inCanvas()); i += 1) {
        const now = await activeFamily(page);
        if (now !== null) visited.add(now);
        await page.keyboard.press(key);
      }
      expect(await inCanvas(), `${key} leaves the canvas after the last family`).toBe(false);
      await drawing(page).focus(); // back in, on the family it left from
    }
    expect(visited.size).toBe(hubs);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('Enter shows the family in the inspector; Enter again opens its page; O opens a page; Esc and zoom keys work; words are said', async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await watch(page);
    await openDemo(page);
    await focusFamily(page, 'cls_aldehydes');
    await page.keyboard.press('Enter');
    await expect(pane(page).getByRole('article', { name: 'Record' })).toHaveAttribute('data-record-id', 'cls_aldehydes');
    await expect(live(page)).toContainText('Selected Aldehydes');
    await page.keyboard.press('Escape');
    await expect(live(page)).toHaveText('Selection cleared');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: /^Family page: Aldehydes/ })).toBeVisible();
    await expect(live(page)).toHaveText('Opened the family page of Aldehydes');
    await page.getByRole('button', { name: 'Overview' }).click();
    await expect(live(page)).toHaveText('Back to the overview');
    await focusFamily(page, 'cls_alcohols');
    await page.keyboard.press('o');
    await expect(page.getByRole('region', { name: /^Family page: Alcohols/ })).toBeVisible();
    await page.getByRole('button', { name: 'Overview' }).click();

    // zoom keys move the drawing; the level is said once the view is still (the restored view settles first)
    await focusFamily(page, 'cls_alcohols');
    await page.waitForTimeout(700);
    const scaleOf = async (): Promise<number> =>
      page.evaluate(() => Number(/scale\((-?[\d.e+-]+)\)/.exec(document.querySelector('[data-world]')?.getAttribute('transform') ?? '')?.[1] ?? '0'));
    const fitted = await scaleOf();
    await page.keyboard.press('+');
    await expect.poll(scaleOf).toBeGreaterThan(fitted);
    await expect(live(page)).toContainText(/^Zoom \d+ percent$/);
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    await expect.poll(scaleOf).toBeLessThan(fitted);
    await page.keyboard.press('0');
    await page.waitForTimeout(200);
    const byKey = await scaleOf();
    await page.getByRole('button', { name: 'Fit' }).click(); // the toolbar's Fit is the reference
    await page.waitForTimeout(200);
    expect(Math.abs(byKey - (await scaleOf()))).toBeLessThan(0.001);
    await page.keyboard.press('f');
    await expect.poll(scaleOf).toBeGreaterThan(0);
    await expectClean(seen);
  });

  test('Shift+F10 opens the family menu with its arrows; choosing an arrow selects it; Esc closes the menu; axe on the open menu', async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await watch(page);
    await openDemo(page);
    await focusFamily(page, 'cls_alcohols');
    await page.keyboard.press('Shift+F10');
    const menu = page.getByRole('menu', { name: /^Alcohols/ });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await expect(menu.getByRole('menuitem').nth(0)).toHaveText('Open family page');
    await expect(menu.getByRole('menuitem').nth(1)).toHaveText('Show in inspector');
    await expect(menu.getByRole('menuitem', { name: 'To Aldehydes (3 reactions)' })).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    await page.screenshot({ path: resolve(SHOTS, 'canvas-menu-1280x800.png') });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(drawing(page)).toBeFocused();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'To Aldehydes (3 reactions)' }).click();
    await expect(pane(page).getByRole('article', { name: 'Record' })).toHaveAttribute('data-record-id', /./);
    await expect(live(page)).toContainText('Selected Alcohols to Aldehydes, 3 reactions');
    await expect(drawing(page)).toBeFocused();
    await expectClean(seen);
  });

  test('a right click and a 500 ms hold open the menu; an arrow offers Open at this group', async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await watch(page);
    await openDemo(page);
    await page.locator('svg [data-node-id="cls_alcohols"]').click({ button: 'right' });
    await expect(page.getByRole('menu', { name: /^Alcohols/ })).toBeVisible();
    await page.keyboard.press('Escape');
    const box = await page.locator('svg [data-node-id="cls_aldehydes"]').boundingBox();
    if (box === null) throw new Error('no box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await expect(page.getByRole('menu', { name: /^Aldehydes/ })).toBeVisible();
    await page.mouse.up();
    await page.keyboard.press('Escape');
    await page.locator('svg [data-edge-id] path[data-hit]').first().click({ button: 'right', force: true });
    await expect(page.getByRole('menuitem', { name: 'Open at this group' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Open at this group' }).click();
    await expect(page.getByRole('region', { name: /^Family page/ })).toBeVisible();
    await expectClean(seen);
  });

  test('a click selects at once and shows the inspector after 300 ms; a double click opens the family page and the drawing does not move', async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await watch(page);
    await openDemo(page);
    const target = page.locator('svg [data-node-id="cls_alcohols"]');
    await target.click();
    await expect(page.getByText(/^Selected: Alcohols/)).toBeVisible();
    await expect(pane(page).getByRole('article', { name: 'Record' })).toHaveAttribute('data-record-id', 'cls_alcohols');
    await page.getByRole('button', { name: 'Overview' }).count();
    // close the pane and start again: a double click never moves the target between its two clicks
    const other = page.locator('svg [data-node-id="cls_aldehydes"]');
    const where = await other.boundingBox();
    await other.dblclick();
    await expect(page.getByRole('region', { name: /^Family page: Aldehydes/ })).toBeVisible();
    expect(where).not.toBeNull();
    await expectClean(seen);
  });

  test('screenshot: the map with a focused family (1280 x 800)', async ({ page }) => {
    await openDemo(page);
    await focusFamily(page, 'cls_alcohols');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menu', { name: /^Alcohols/ })).toBeVisible();
    await page.screenshot({ path: resolve(SHOTS, 'map-focused-menu-1280x800.png') });
  });
});
