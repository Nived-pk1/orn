/**
 * The keyboard-only walk (step 5.7, part 2, item k; the Phase 5 definition of done), Chromium against the PRODUCTION build, with NO
 * mouse: from the first-run screen load the demo, reach the map, move between families with the arrow keys, open the inspector, open a
 * family page, open a reaction card's detail, follow a link, go Back, return to the overview, switch to the List view. After every step
 * the focus is on a real control and VISIBLE (a focus ring, or the map's own ring for the family it holds). axe on the canvas, the list
 * and the menu; zero policy violations; the List view's rows are windowed (a large file keeps the DOM small).
 */
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, chooseFile, expectClean, generatedFileWithAnchors, openApp, watch } from './kit';

const SHOTS = resolve(process.cwd(), 'screenshots');
const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const pane = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const record = (page: Page) => pane(page).getByRole('article', { name: 'Record' });

interface Focus {
  readonly tag: string;
  readonly role: string | null;
  readonly name: string;
  readonly canvas: boolean;
  readonly recordLink: boolean;
  readonly family: string | null;
}

const focusOf = (page: Page): Promise<Focus> =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el === null) return { tag: 'none', role: null, name: '', canvas: false, recordLink: false, family: null };
    const canvas = el.matches('svg[role="group"][aria-label^="Navigator"]');
    const active = canvas ? el.getAttribute('aria-activedescendant') : null;
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
      canvas,
      recordLink: el.matches('a[data-record-id]'),
      family: active === null ? null : (document.getElementById(active)?.getAttribute('data-node-id') ?? null),
    };
  });

/** The focus is on a control (not the page) and something draws it: a focus ring, or the map's focus ring for its family. */
async function expectFocusVisible(page: Page, step: string): Promise<void> {
  const verdict = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el === null || el === document.body) return 'the focus is on the page, not on a control';
    if (el.matches('svg[role="group"][aria-label^="Navigator"]')) {
      return document.querySelector('[data-overlay="focus"]') !== null ? 'ok' : 'the map has the focus but draws no ring';
    }
    const style = getComputedStyle(el);
    const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    const shadow = style.boxShadow !== 'none';
    return el.matches(':focus-visible') && (outline || shadow) ? 'ok' : `no visible focus indicator on <${el.tagName.toLowerCase()}> (${style.outlineStyle} ${style.outlineWidth})`;
  });
  expect(verdict, `${step}: ${JSON.stringify(await focusOf(page))}`).toBe('ok');
}

/** Tab (never a click) until the focus satisfies the test; every stop on the way must be visible too. */
async function tabTo(page: Page, step: string, matches: (focus: Focus) => boolean, max = 150): Promise<Focus> {
  const trail: string[] = [];
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const focus = await focusOf(page);
    trail.push(`${focus.tag}:${focus.name.slice(0, 30)}`);
    if (matches(focus)) {
      await expectFocusVisible(page, step);
      return focus;
    }
  }
  throw new Error(`${step}: Tab never reached it in ${max} presses; the focus went through: ${trail.slice(0, 40).join(' | ')}`);
}

test.describe('the keyboard-only walk', () => {
  test('first-run screen, demo, map, inspector, family page, card, link, Back, overview, List: no mouse, focus always visible', async ({ page }) => {
    test.setTimeout(180_000);
    const seen = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    // 1. the first-run screen: Tab to "Load demo dataset" and press Enter
    await tabTo(page, 'first-run: Load demo dataset', (f) => f.tag === 'button' && f.name === 'Load demo dataset');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/^Imported \d+ records from demo\.orn\.json\./)).toBeVisible();

    // 2. the map takes the focus as one tab stop; the first family holds it
    const map = await tabTo(page, 'the map', (f) => f.canvas);
    expect(map.family).not.toBeNull();
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeFocused();
    expect(await axeProblems(page)).toEqual([]); // axe on the canvas with a focused family

    // 3. arrow keys move between families (the focus ring follows)
    const seenFamilies = new Set<string>([map.family as string]);
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) {
      await page.keyboard.press(key);
      const now = await focusOf(page);
      expect(now.canvas).toBe(true);
      if (now.family !== null) seenFamilies.add(now.family);
      await expectFocusVisible(page, `after ${key}`);
    }
    expect(seenFamilies.size).toBeGreaterThan(2);

    // 4. to Alcohols; Enter shows it in the inspector, Enter again opens its page
    for (let i = 0; i < 40 && (await focusOf(page)).family !== 'cls_alcohols'; i += 1) await page.keyboard.press('Tab');
    expect((await focusOf(page)).family).toBe('cls_alcohols');
    await page.keyboard.press('Enter');
    await expect(record(page)).toHaveAttribute('data-record-id', 'cls_alcohols');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: /^Family page: Alcohols/ })).toBeVisible();
    await expectFocusVisible(page, 'the family page took the focus (its Overview button)');
    expect((await focusOf(page)).name).toBe('Overview');

    // 5. a group button, then a reaction card: its detail opens in the inspector
    await tabTo(page, 'the Aldehydes group button', (f) => f.tag === 'button' && /^Aldehydes\s*3\s*reactions$/.test(f.name));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 3, name: 'To Aldehydes' }), 'the Aldehydes group was brought into view').toBeInViewport();
    await tabTo(page, 'the PCC card', (f) => f.tag === 'button' && f.name === 'Ethanol → ethanal (PCC)');
    await page.keyboard.press('Enter');
    await expect(record(page).getByRole('heading', { level: 3, name: 'Ethanol → ethanal (PCC)' })).toBeVisible();

    // 6. follow a record link inside the inspector with Enter, then go Back
    const reaction = await record(page).getAttribute('data-record-id');
    await tabTo(page, 'a record link in the inspector', (f) => f.recordLink);
    const linked = await page.evaluate(() => (document.activeElement as HTMLElement).getAttribute('data-record-id'));
    await page.keyboard.press('Enter');
    await expect(record(page)).toHaveAttribute('data-record-id', linked ?? '');
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(record(page)).toHaveAttribute('data-record-id', reaction ?? '');
    await page.keyboard.press('Alt+ArrowRight');
    await expect(record(page)).toHaveAttribute('data-record-id', linked ?? '');

    // 7. back to the overview: the focus lands on the family just left
    await page.getByRole('button', { name: 'Overview' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeFocused();
    expect((await focusOf(page)).family).toBe('cls_alcohols');
    await expectFocusVisible(page, 'back on the overview');
    await expect(page.getByRole('status', { name: 'Navigator announcements' })).toHaveText('Back to the overview');

    // 8. the context menu from the keyboard (axe on the open menu), then the List view
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menu', { name: /^Alcohols/ })).toBeVisible();
    await expect(page.getByRole('menuitem').first()).toBeFocused();
    expect(await axeProblems(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeFocused();
    await page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: 'List' }).focus();
    await expectFocusVisible(page, 'the List toggle');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('table', { name: 'Families' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Navigator announcements' })).toContainText('list of families and arrows');
    expect(await axeProblems(page)).toEqual([]); // axe on the list

    // 9. in the list (Firefox also makes the table's scrolling box a tab stop, so a row is matched by its role): Tab to the first family row, arrow down, Enter opens its page, the page's Overview button returns to the list
    await tabTo(page, 'a family row', (f) => f.name.length > 0 && f.role === 'row', 30);
    await page.keyboard.press('ArrowDown');
    await expectFocusVisible(page, 'the next list row');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: /^Family page/ })).toBeVisible();
    await page.keyboard.press('Enter'); // the focus is on Overview
    await expect(page.getByRole('table', { name: 'Families' })).toBeVisible();
    await expectFocusVisible(page, 'back in the list');
    await expectClean(seen);
  });

  test('screenshot: the List view (1280 x 800)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await page.getByRole('button', { name: 'Load demo dataset' }).click();
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
    await page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: 'List' }).click();
    await expect(page.getByRole('table', { name: 'Families' })).toBeVisible();
    await page.getByRole('table', { name: 'Families' }).getByRole('button', { name: /^Reactions out/ }).click();
    await page.getByRole('table', { name: 'Families' }).getByRole('button', { name: /^Reactions out/ }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(SHOTS, 'list-view-1280x800.png') });
  });

  test('the List view is windowed on a large file and equals the map in count', async ({ page }) => {
    test.setTimeout(180_000);
    const seen = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await chooseFile(page, generatedFileWithAnchors('initial', 'hub_explosion'));
    await expect(page.getByRole('heading', { name: 'Import summary' })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/^Imported \d+ records from generated-/)).toBeVisible({ timeout: 90_000 });
    const drawing = page.getByRole('group', { name: NAVIGATOR });
    await expect(drawing).toBeVisible({ timeout: 90_000 });
    const mapNodes = await page.locator('svg [data-box="hub"], svg [data-box="unclassified"]').count();
    const mapEdges = await page.locator('svg [data-edge-id]').count();
    await page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: 'List' }).click();
    const families = page.getByRole('table', { name: 'Families' });
    const arrows = page.getByRole('table', { name: 'Arrows' });
    await expect(families).toBeVisible();
    expect(Number(await families.getAttribute('aria-rowcount'))).toBe(mapNodes + 1);
    expect(Number(await arrows.getAttribute('aria-rowcount'))).toBe(mapEdges + 1);
    const inDom = await families.locator('[data-row-key]').count();
    expect(inDom).toBeGreaterThan(0);
    expect(inDom).toBeLessThan(mapNodes);
    // scrolling brings other rows in and keeps the DOM small
    const first = await families.locator('[data-row-key]').last().getAttribute('data-row-key');
    await families.locator('[data-virtual-table]').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect.poll(async () => families.locator('[data-row-key]').last().getAttribute('data-row-key')).not.toBe(first); // (the row with the tab stop always stays rendered, so the last row is the one that moves)
    expect(await families.locator('[data-row-key]').count()).toBeLessThan(mapNodes);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });
});
