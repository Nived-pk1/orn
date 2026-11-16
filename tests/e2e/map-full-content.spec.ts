/**
 * Step 8.4m: the map with every chapter, over a generated dataset the size of the owner's full content (17 families, 650 reactions, 170
 * ordered pairs; tests/fixtures/full-map). Desktop. M1: a hover or a click at Fit never moves the view, and no floating control lies over a
 * box, with the legend open too. M2: the whole map is drawn (no "not complete" notice, no "Not drawn" status). M3: a busy selected family
 * shows one line per neighbour and direction, the bar counts them, the panel lists them under "Links". M4: the same rules with the pane
 * open, and the bucket box inside the map area. F2: a reload keeps the selected family's lines.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { BUSY_FAMILY, CROWDED_FAMILY, familyId, fullMap, QUIET_FAMILY } from '../fixtures/full-map/full-map';
import { chipsSettled } from './map-focus-kit';
import { NAVIGATOR, openMapDesktop } from './map-layout-kit';
import { openKey } from './map-toolbar-kit';

const DATA = Buffer.from(JSON.stringify(fullMap().document));
const SIZES = [
  { width: 1920, height: 1040 },
  { width: 1366, height: 768 },
] as const;

const box = (page: Page, id: string) => page.locator(`svg [data-node-id="${id}"]`).first();
const view = (page: Page) => page.locator('svg [data-world]').getAttribute('transform');
const lines = (page: Page) => page.evaluate(() => new Set([...document.querySelectorAll('svg [data-layer="edges"] [data-edge-id]')].map((el) => el.getAttribute('data-edge-id'))).size);

async function settle(page: Page): Promise<void> {
  let previous = '';
  for (let i = 0; i < 40; i += 1) {
    const now = `${await view(page)}|${await page.evaluate(() => [...document.querySelectorAll('[data-map-control]')].map((el) => Math.round(el.getBoundingClientRect().width)).join())}`;
    if (now === previous) return;
    previous = now;
    await page.waitForTimeout(250);
  }
}

/** A3: no visible floating control meets a box; every box is whole inside the map area unless `cutAllowed`. Returns the problems in words. */
async function problems(page: Page, options: { readonly whole: boolean }): Promise<string[]> {
  return page.evaluate((whole) => {
    const out: string[] = [];
    const area = (document.querySelector('svg[role="group"]') as Element).getBoundingClientRect();
    const boxes = [...document.querySelectorAll('svg [data-node-id][data-box]')].map((el) => ({ id: el.getAttribute('data-node-id'), r: el.getBoundingClientRect() }));
    for (const control of document.querySelectorAll('[data-map-control]')) {
      if (getComputedStyle(control).visibility === 'hidden' && !control.hasAttribute('data-map-reserve')) continue;
      const c = control.getBoundingClientRect();
      if (c.width === 0 || c.height === 0) continue;
      for (const b of boxes) if (c.x < b.r.right && b.r.x < c.right && c.y < b.r.bottom && b.r.y < c.bottom) out.push(`a ${control.getAttribute('data-map-control')} (${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.width)}x${Math.round(c.height)}) lies over ${b.id}`);
    }
    if (whole) for (const b of boxes) if (b.r.x < area.x - 0.5 || b.r.right > area.right + 0.5 || b.r.y < area.y - 0.5 || b.r.bottom > area.bottom + 0.5) out.push(`${b.id} is cut by the edge of the map`);
    return out;
  }, options.whole);
}

async function showBucket(page: Page): Promise<void> {
  const show = (await openKey(page)).getByRole('button', { name: 'Show', exact: true });
  await show.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('svg [data-box="unclassified"]')).toHaveCount(1);
}

async function open(page: Page, size: { readonly width: number; readonly height: number }): Promise<void> {
  await openMapDesktop(page, DATA);
  // the "Imported ..." toast stays until dismissed and lifts the bottom controls while it shows (step 8.4b): these tests are about the map at rest
  for (const dismiss of await page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' }).all()) await dismiss.click();
  await page.setViewportSize(size);
  await page.waitForTimeout(900);
  await settle(page);
}

test.describe('the map with every chapter (8.4m)', () => {
  test.setTimeout(300_000);

  test('M2: the whole map is drawn: no "not complete" notice, no "Not drawn" status, every family box', async ({ page }) => {
    await open(page, SIZES[0]);
    await expect(page.locator('svg [data-box="hub"]')).toHaveCount(17);
    await expect(page.getByText(/This map is not complete/)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Drawing limits' })).toHaveCount(0);
    await expect(page.getByText(/^Not drawn:/)).toHaveCount(0);
  });

  for (const size of SIZES) {
    test(`M1: at Fit a hover, another hover and a click leave the view exactly where it was; no control over a box, the legend open too (${size.width} x ${size.height})`, async ({ page }) => {
      await open(page, size);
      await showBucket(page);
      await page.getByRole('button', { name: 'Fit', exact: true }).click();
      await settle(page);
      const fitted = await view(page);
      expect(await problems(page, { whole: false }), 'nothing selected').toEqual([]);
      await box(page, QUIET_FAMILY).hover();
      await expect.poll(() => lines(page)).toBeGreaterThan(0);
      await expect(page.locator('[data-arrow-key]'), 'the legend opened').toBeVisible();
      await settle(page);
      expect(await view(page), 'the first hover moved the view').toBe(fitted);
      expect(await problems(page, { whole: false }), 'hover, legend open').toEqual([]);
      await box(page, familyId(13)).hover();
      await page.waitForTimeout(600);
      await settle(page);
      expect(await view(page), 'the second hover moved the view').toBe(fitted);
      // a click selects: the bars change, the view must not. (Where the click also opens the pane, the map AREA changes and Fit fits again: that is M4.)
      const width = (): Promise<number> => page.evaluate(() => Math.round((document.querySelector('svg[role="group"]') as Element).getBoundingClientRect().width));
      const before = await width();
      await box(page, QUIET_FAMILY).click();
      await chipsSettled(page);
      await settle(page);
      if ((await width()) === before) expect(await view(page), 'the click moved the view').toBe(fitted);
      expect(await problems(page, { whole: false }), 'a family selected').toEqual([]);
    });

    test(`M4: the pane open at Fit: no control over a box, the bucket box whole inside the map (${size.width} x ${size.height})`, async ({ page }) => {
      await open(page, size);
      await showBucket(page);
      await box(page, BUSY_FAMILY).click();
      const hide = page.getByRole('button', { name: 'Hide inspector' });
      const show = page.getByRole('button', { name: 'Show inspector' });
      await expect(hide.or(show)).toBeVisible();
      // a pick opens the pane by itself a moment later: a click on "Show" while it opens would shut it
      const opened = await hide.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
      if (!opened) await show.click();
      await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
      await page.waitForTimeout(900);
      await page.getByRole('button', { name: 'Fit', exact: true }).click();
      await settle(page);
      expect(await problems(page, { whole: false })).toEqual([]);
      const state = await page.evaluate(() => {
        const area = (document.querySelector('svg[role="group"]') as Element).getBoundingClientRect();
        const boxes = [...document.querySelectorAll('svg [data-node-id][data-box]')].map((el) => el.getBoundingClientRect());
        const bucket = (document.querySelector('svg [data-box="unclassified"]') as Element).getBoundingClientRect();
        const left = Math.min(...boxes.map((b) => b.x)) - area.x;
        const rightCut = Math.max(...boxes.map((b) => b.right)) - area.right;
        return { left, rightCut, bucketInside: bucket.x >= area.x && bucket.right <= area.right && bucket.y >= area.y && bucket.bottom <= area.bottom };
      });
      expect(state.bucketInside, 'the "Not in a family yet" box is whole inside the map area').toBe(true);
      if (state.rightCut > 0.5) expect(state.left, 'cut on the right: the content starts at the left margin (no empty strip)').toBeLessThanOrEqual(40);
    });
  }

  test('M3: a busy selected family draws one line per neighbour and direction, the bar counts them, the panel lists them under Links', async ({ page }) => {
    await open(page, SIZES[0]);
    await box(page, BUSY_FAMILY).click();
    await chipsSettled(page);
    await expect.poll(() => lines(page), 'every line of the family: 10 out, 8 in').toBe(18);
    const bar = page.locator('[data-map-corner]');
    await expect(bar).toContainText(/\d+ reactions to 14 families/);
    await expect(bar).not.toContainText('listed in the panel');
    await expect(page.locator('svg [data-node-id][data-faded]'), 'the families it has no line with are faded').toHaveCount(2);
    const pane = page.getByRole('complementary', { name: 'Inspector' });
    const links = pane.getByRole('region', { name: 'Links' });
    await expect(links).toBeVisible();
    await expect(links.getByRole('list', { name: 'Turns into' }).getByRole('listitem')).toHaveCount(11); // 10 families and the bucket
    await expect(links.getByRole('list', { name: 'Made from' }).getByRole('listitem')).toHaveCount(9);
    const order = await pane.evaluate((el) => {
      const text = el.textContent ?? '';
      return text.indexOf('Links') < text.indexOf('Reactions that use it');
    });
    expect(order, 'Links comes before "Reactions that use it"').toBe(true);
    const row = links.getByRole('list', { name: 'Turns into' }).getByRole('button', { name: /^Family 12/ });
    await expect(row).toContainText(/Family 12 · \d+/);
    await row.click();
    await expect(pane.getByRole('article', { name: 'Arrow' })).toBeVisible();
    await expect(pane.getByRole('heading', { name: 'Family 08 → Family 12' })).toBeVisible();
  });

  test('M3: a family with more than 30 lines keeps the old rule (outlines, no line) and its bar points to the panel list that is there', async ({ page }) => {
    await open(page, SIZES[0]);
    await box(page, CROWDED_FAMILY).click();
    await page.waitForTimeout(600);
    expect(await lines(page)).toBe(0);
    const bar = page.locator('[data-map-corner]');
    await expect(bar).toContainText(/\d+ reactions to 16 families: listed in the panel/);
    await expect(page.getByRole('complementary', { name: 'Inspector' }).getByRole('region', { name: 'Links' })).toBeVisible();
  });

  test('F2: after a reload the selected family still shows its lines', async ({ page }) => {
    await open(page, SIZES[0]);
    await box(page, QUIET_FAMILY).click();
    await expect.poll(() => lines(page)).toBe(4);
    await page.waitForTimeout(1500); // the selection is saved
    await page.reload();
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-map-selected]')).toContainText('Family 17');
    await expect.poll(() => lines(page), 'the lines of the selected family are drawn again').toBe(4);
  });
});
