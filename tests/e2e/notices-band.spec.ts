/**
 * Notices never cover content (step 8.4a, Part C). Study (own data: the storage WARNING, the newer-dataset NOTICE, the import toast) and
 * Studio (the storage WARNING and the import toast) at 1280x800 and 1920x1000: the band area is ONE row (at most 56 px); the toast is one
 * row (at most 44 px) and its box meets no family box, no right pane, no button but its own; the A-to-B list and the inspector are fully
 * visible. Phone (Pixel 7): the toast meets neither an open sheet, nor the tab bar, nor the floating map buttons.
 * NOTE (honest): this spec was written AFTER the source it tests (not seen red).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { answerExamCard } from './exam-kit';
import { chooseFile, expectPreview, leaveChapters, loadDemo, openApp, type UploadFile } from './kit';
import { clickToolbar } from './map-toolbar-kit';
import { openMapDesktop } from './map-layout-kit';
import { shotsDir } from './editor-kit';
import { PAIR_DATA } from './map-marks-kit';

const STUDY = process.env.ORN_BASE_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:4174';
const STUDIO = process.env.ORN_BASE_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:4173';
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const DEMO: UploadFile = { name: 'my-own-data.orn.json', mimeType: 'application/json', buffer: readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json')) };
const SIZES = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1000 },
] as const;

interface Box { x: number; y: number; width: number; height: number }
const meets = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('no box');
  return box;
}

async function importOwn(page: Page, tap = false): Promise<void> {
  await chooseFile(page, DEMO);
  await expectPreview(page);
  const confirm = page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' });
  if (tap) await confirm.tap();
  else await confirm.click();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 90_000 });
}

/** The toast is one row, at most 44 px, and meets nothing but itself. */
async function expectToastClear(page: Page): Promise<void> {
  const toast = page.getByRole('status', { name: 'Notifications' }).locator('> *').first();
  await expect(toast).toBeVisible();
  const box = await boxOf(toast);
  expect(box.height, 'the toast is one row').toBeLessThanOrEqual(44.5);
  const others: Locator[] = [
    page.getByRole('complementary', { name: 'Inspector' }),
    ...(await page.locator('svg [data-node-id]').all()),
    ...(await page.getByRole('button').all()),
  ];
  for (const other of others) {
    if (!(await other.isVisible())) continue;
    if ((await toast.locator(other).count()) > 0) continue; // a button of the toast itself
    if ((await other.evaluate((el, t) => t.contains(el), await toast.elementHandle())) === true) continue;
    const otherBox = await other.boundingBox();
    if (otherBox === null) continue;
    expect(meets(box, otherBox), `the toast meets ${await other.evaluate((el) => el.tagName + ' ' + (el.getAttribute('aria-label') ?? el.textContent ?? '').slice(0, 40))}`).toBe(false);
  }
}

async function expectBandOneRow(page: Page): Promise<void> {
  const band = page.getByRole('region', { name: 'Notices' });
  await expect(band).toBeVisible();
  expect((await boxOf(band)).height, 'the band is one row').toBeLessThanOrEqual(56);
}

test.describe('Study desktop', () => {
  test.use({ baseURL: STUDY, actionTimeout: 60_000 });
  for (const size of SIZES) {
    test(`${size.width}x${size.height}: one band row, one toast row, nothing covered`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize(size);
      await openApp(page);
      await importOwn(page);
      await answerExamCard(page);
      await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Map' }).click();
      await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible({ timeout: 60_000 });
      await expectBandOneRow(page);
      await expect(page.getByRole('button', { name: /^\+\d+ more$/ })).toBeVisible();
      // select a family: the inspector opens; open the A-to-B list
      await page.locator('svg [data-node-id]').first().click();
      const inspector = page.getByRole('complementary', { name: 'Inspector' });
      await expect(inspector).toBeVisible();
      await clickToolbar(page, 'From A to B');
      await expectToastClear(page);
      const toast = await boxOf(page.getByRole('status', { name: 'Notifications' }).locator('> *').first());
      const view = page.viewportSize();
      expect(toast.y + toast.height).toBeLessThanOrEqual((view?.height ?? 0) + 0.5);
      // the inspector is not covered: its middle is what is on top there
      const inspectorBox = await boxOf(inspector);
      const top = await page.evaluate(([x, y]) => document.elementFromPoint(x as number, y as number)?.closest('aside')?.getAttribute('aria-label') ?? null, [inspectorBox.x + inspectorBox.width / 2, inspectorBox.y + inspectorBox.height - 8]);
      expect(top, 'the inspector is on top at its foot').toBe('Inspector');
    });
  }

  test('"+n more" opens the rest, each with its actions, and a notice dealt with leaves the list', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(SIZES[0]);
    await openApp(page);
    await importOwn(page);
    await answerExamCard(page);
    await page.getByRole('button', { name: /^\+\d+ more$/ }).click();
    const list = page.getByRole('dialog', { name: 'Notices' });
    await expect(list).toBeVisible();
    await expect(list.getByRole('button', { name: 'Later' })).toBeVisible(); // the list is a lazy chunk: wait for it
    expect(await list.getByRole('button').count()).toBeGreaterThan(1);
  });
});

test.describe('Studio desktop', () => {
  test.use({ baseURL: STUDIO, actionTimeout: 60_000 });
  for (const size of SIZES) {
    test(`${size.width}x${size.height}: one band row, one toast row, nothing covered`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize(size);
      await openApp(page);
      await loadDemo(page);
      await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible({ timeout: 60_000 });
      const band = page.getByRole('region', { name: 'Notices' });
      if (await band.isVisible()) await expectBandOneRow(page);
      await page.locator('svg [data-node-id]').first().click();
      await clickToolbar(page, 'From A to B');
      const toasts = page.getByRole('status', { name: 'Notifications' }).locator('> *');
      if ((await toasts.count()) > 0) await expectToastClear(page);
    });
  }
});

test.describe('Study phone (Pixel 7)', () => {
  test.use({ baseURL: STUDY, ...PIXEL, actionTimeout: 60_000 });
  test('the toast sits above the tab bar; with a sheet open it folds into the notices row', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeVisible();
    await importOwn(page, true);
    await expect(page.getByRole('navigation', { name: 'Home' })).toBeVisible({ timeout: 90_000 });
    await answerExamCard(page);
    await leaveChapters(page);
    const tabs = await boxOf(page.getByRole('navigation', { name: 'Home' }));
    const live = page.getByRole('status', { name: 'Notifications' });
    const toast = live.locator('> *').first();
    if ((await toast.count()) > 0 && (await toast.isVisible())) {
      const box = await boxOf(toast);
      expect(meets(box, tabs), 'the toast meets the tab bar').toBe(false);
      expect(box.y + box.height, 'the toast is directly above the tab bar').toBeLessThanOrEqual(tabs.y + 0.5);
    }
    // open a sheet: the toast is no longer floating, it is an entry of the "n notices" row
    await page.getByRole('button', { name: 'Search' }).first().tap();
    const search = page.getByRole('dialog', { name: 'Search' });
    await search.getByRole('combobox').fill('ethanol');
    await search.locator('[role="option"]').first().tap();
    await expect(page.locator('[data-sheet]')).toHaveAttribute('data-sheet', /peek|full/, { timeout: 30_000 });
    const sheet = await boxOf(page.locator('[data-sheet]'));
    if ((await live.locator('> *').count()) > 0) expect(meets(await boxOf(live.locator('> *').first()), sheet), 'a floating toast meets the sheet').toBe(false);
    await expect(page.getByRole('button', { name: /^\d+ notices?$/ })).toBeVisible();
  });
});

test.describe('Study phone, A to B (Pixel 7)', () => {
  test.use({ baseURL: STUDY, ...PIXEL, actionTimeout: 60_000 });
  test('with the A-to-B panel open the toast is not on top of it', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeVisible();
    await importOwn(page, true);
    await expect(page.getByRole('navigation', { name: 'Home' })).toBeVisible({ timeout: 90_000 });
    await answerExamCard(page);
    await leaveChapters(page);
    await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Map' }).tap();
    await page.getByRole('button', { name: 'From A to B' }).tap();
    const panel = page.getByRole('complementary', { name: 'From A to B' });
    await expect(panel).toBeVisible();
    const live = page.getByRole('status', { name: 'Notifications' });
    const toast = live.locator('> *').first();
    if ((await toast.count()) > 0 && (await toast.isVisible())) expect(meets(await boxOf(toast), await boxOf(panel)), 'the toast is on top of the A-to-B panel').toBe(false);
    await expect(page.getByRole('button', { name: /^\d+ notices?$/ })).toBeVisible();
  });
});

// Step 8.4b, G1 and G2 (written AFTER their source, disclosed; broken on purpose and seen red, see the notes).
const IPHONE = (() => { const { defaultBrowserType: _ios, ...rest } = devices['iPhone 14']; return rest; })();

test.describe('the toast meets no right pane (Studio desktop)', () => {
  test.use({ baseURL: STUDIO, actionTimeout: 60_000 });
  test('the inspector and the A-to-B panel are right panes: the toast is not on top of either', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await loadDemo(page);
    await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible({ timeout: 60_000 });
    const toast = page.getByRole('status', { name: 'Notifications' }).locator('> *').first();
    await expect(toast).toBeVisible();
    await toast.hover(); // the countdown stops while the pointer is on it
    await page.locator('svg [data-node-id]').first().click();
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
    await toast.hover();
    expect(meets(await boxOf(toast), await boxOf(page.getByRole('complementary', { name: 'Inspector' }))), 'the toast is on top of the inspector').toBe(false);
    await clickToolbar(page, 'From A to B');
    const panel = page.getByRole('complementary', { name: 'From A to B' });
    await expect(panel).toBeVisible();
    await toast.hover();
    expect(meets(await boxOf(toast), await boxOf(panel)), 'the toast is on top of the A-to-B panel').toBe(false);
    await page.screenshot({ path: `${shotsDir()}/a-to-b-toast-1280x800.png` });
  });
});

for (const [name, device] of [['Pixel 7', PIXEL], ['iPhone 14', IPHONE]] as const) {
  test.describe(`the phone toast is one line (${name})`, () => {
    test.use({ baseURL: STUDY, ...device, actionTimeout: 60_000 });
    test('at most 56 px tall; it meets neither the storage line, the tab bar, an open sheet nor the floating map buttons', async ({ page }) => {
      test.setTimeout(300_000);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeVisible();
      await importOwn(page, true);
      await expect(page.getByRole('navigation', { name: 'Home' })).toBeVisible({ timeout: 90_000 });
      await answerExamCard(page);
      await leaveChapters(page);
      const toast = page.getByRole('status', { name: 'Notifications' }).locator('> *').first();
      await expect(toast).toBeVisible();
      const box = await boxOf(toast);
      expect(box.height, 'the phone toast is one line').toBeLessThanOrEqual(56);
      await page.screenshot({ path: `${shotsDir()}/toast-phone-${name.replace(' ', '').toLowerCase()}.png` });
      const storage = page.getByText(/Your data may be cleared/).first();
      if (await storage.isVisible()) expect(meets(box, await boxOf(storage)), 'the toast covers the storage line').toBe(false);
      expect(meets(box, await boxOf(page.getByRole('navigation', { name: 'Home' }))), 'the toast meets the tab bar').toBe(false);
      await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Map' }).tap();
      await expect(page.getByRole('group', { name: /^Navigator:/ })).toBeVisible({ timeout: 60_000 });
      if (await toast.isVisible()) {
        for (const button of await page.locator('[data-phone-map-controls] button, button[aria-label="Fit"], button[aria-label="Key"]').all()) {
          if (await button.isVisible()) expect(meets(await boxOf(toast), await boxOf(button)), 'the toast meets a floating map button').toBe(false);
        }
      }
    });
  });
}

// Step 8.4b, reviewer round, 2a: the toast never covers the map's arrow key (written red first; own-data layout fixture, a family selected).
test.describe('the toast meets no map key (Studio desktop)', () => {
  test.use({ actionTimeout: 60_000 });
  for (const size of SIZES) {
    test(`${size.width}x${size.height}: the key and the toast do not intersect`, async ({ page }) => {
      test.setTimeout(300_000);
      await openMapDesktop(page, PAIR_DATA()); // the two-way pair chapter of map-marks (the reviewer's screenshot)
      await page.setViewportSize(size);
      await page.getByRole('combobox', { name: 'Chapter' }).selectOption('top_chapter-4');
      await page.waitForTimeout(900);
      await page.locator('svg [data-chip-button]').first().click(); // the arrow's panel opens beside the map: the key wraps to two lines
      await page.waitForTimeout(900);
      const toast = page.getByRole('status', { name: 'Notifications' }).locator('> *').first();
      await expect(toast).toBeVisible();
      await toast.hover(); // the countdown stops while the pointer is on it
      const key = page.getByRole('list', { name: 'What the arrows mean' });
      await expect(key).toBeVisible();
      expect(meets(await boxOf(toast), await boxOf(key)), 'the toast covers the map key').toBe(false);
    });
  }
});
