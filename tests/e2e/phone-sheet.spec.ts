/**
 * The phone inspector sheet (phone mode, part 3; ADR-039), PRODUCTION build, on the two touch devices: Pixel 7 (Chromium) and iPhone 14
 * (WebKit). A tap on a family opens the sheet at PEEK (about 35% of the screen, the map still visible above it, "Open family" a large
 * button); a swipe up makes it FULL, a swipe down goes back to peek and then closes it; the family page opens from the button. axe at peek
 * and at full. The swipe is made with the pointer on the sheet's head (pointer events are what the sheet listens to, in every engine).
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

/** The middle of a hub once the page has stopped moving: two equal reads in a row. */
async function centreOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  let previous = '';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const box = await page.locator(`svg [data-node-id="${id}"]`).boundingBox();
    if (box === null) throw new Error(`${id} is not drawn`);
    const now = `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)}`;
    if (now === previous) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    previous = now;
    await page.waitForTimeout(250);
  }
  throw new Error(`${id} keeps moving`);
}

/** Taps a family and waits for its sheet; the map may still be settling (a second layout), so a tap that selects nothing is made again. */
async function tapFamily(page: Page, id: string, name: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const at = await centreOf(page, id);
    await page.touchscreen.tap(at.x, at.y);
    if (await page.getByRole('complementary', { name }).isVisible({ timeout: 6_000 }).catch(() => false)) return;
    await page.waitForTimeout(1_000);
  }
}

const sheet = (page: Page) => page.locator('aside[data-sheet]');

async function swipe(page: Page, dy: number): Promise<void> {
  const handle = await page.getByRole('button', { name: /Show the whole record|Show less/ }).boundingBox();
  if (handle === null) throw new Error('no handle');
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy / 2, { steps: 4 });
  await page.mouse.move(x, y + dy, { steps: 4 });
  await page.mouse.up();
}

async function walk(page: Page, device: string): Promise<void> {
  try {
    await steps(page, device);
  } catch (error) {
    await page.screenshot({ path: `screenshots/phone2-${device}-sheet-FAILED.png` });
    throw error;
  }
}

async function steps(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible(); // the phone opens on the Families tab
  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Map' }).tap();
  await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
  await expect.poll(() => page.locator('svg[role="group"]').getAttribute('data-lod'), { message: 'LOD after the demo loads' }).not.toBe('0');
  await expect(sheet(page)).toBeHidden();

  // a tap on a family: the sheet opens at peek, named by the record
  await tapFamily(page, 'cls_alcohols', 'Alcohols');
  const region = page.getByRole('complementary', { name: 'Alcohols' });
  await expect(region).toBeVisible({ timeout: 30_000 });
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'peek');
  const viewport = page.viewportSize();
  const peek = await sheet(page).boundingBox();
  if (viewport === null || peek === null) throw new Error('no viewport');
  expect(peek.height / viewport.height, 'peek is about 35% of the screen').toBeGreaterThan(0.3);
  expect(peek.height / viewport.height).toBeLessThan(0.42);
  await expect(region.getByRole('button', { name: 'Open family' })).toBeVisible();
  const open = await region.getByRole('button', { name: 'Open family' }).boundingBox();
  expect(open?.height ?? 0, 'a large button').toBeGreaterThanOrEqual(44);
  // the content above stays visible, and the whole record is not shown yet
  await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
  await expect(region.getByRole('region', { name: /Level 2|Participants/ })).toHaveCount(0);
  expect(await axeProblems(page, 10), `axe at peek (${device})`).toEqual([]);
  await page.screenshot({ path: `screenshots/phone2-${device}-sheet-peek.png` });

  // swipe up: full; swipe down: peek, then closed
  await swipe(page, -240);
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'full');
  const full = await sheet(page).boundingBox();
  expect(full?.height ?? 0).toBeGreaterThan(peek.height * 1.5);
  expect(await axeProblems(page, 10), `axe at full (${device})`).toEqual([]);
  await page.screenshot({ path: `screenshots/phone2-${device}-sheet-full.png` });
  await swipe(page, 240);
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'peek');
  await swipe(page, 240);
  await expect(sheet(page)).toBeHidden();

  // the button opens the family page
  await tapFamily(page, 'cls_alcohols', 'Alcohols');
  await expect(page.getByRole('complementary', { name: 'Alcohols' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('complementary', { name: 'Alcohols' }).getByRole('button', { name: 'Open family' }).tap();
  await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
  await expectClean(seen);
}

test.describe('phone sheet: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('tap a family: peek, swipe up: full, swipe down: peek, closed; Open family', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Playwright has no mobile emulation for Firefox; WebKit runs the iPhone 14');
    test.setTimeout(180_000);
    await walk(page, 'pixel7');
  });
});

test.describe('phone sheet: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('tap a family: peek, swipe up: full, swipe down: peek, closed; Open family', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(180_000);
    await walk(page, 'iphone14');
  });
});
