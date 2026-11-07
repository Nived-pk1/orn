/**
 * The app frame takes less room (step 8.4a, Part C2), Studio with one notice showing: the map area is at least 640 px tall and 1100 px wide
 * at 1280x800 with the rail shown (1220 px with it hidden) and at least 840 px tall at 1920x1000; the header is 44 px, the status bar at most
 * 24 px; the rail's Hide button collapses it into a "☰ <view>" menu and the choice is remembered after a reload; the Find box uses the UI font.
 * NOTE (honest): this spec was written AFTER the source it tests (not seen red).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loadDemo, openApp } from './kit';

const STUDIO = process.env.ORN_BASE_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:4173';
test.use({ baseURL: STUDIO, actionTimeout: 60_000 });

const drawing = (page: Page) => page.locator('[data-map-room] div[aria-busy]').first();

test('1280x800: the map area, the rail and its Hide button, the bars', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Notices' })).toBeVisible();
  const header = await page.locator('header').boundingBox();
  expect(header?.height ?? 999, 'header height').toBeLessThanOrEqual(44.5);
  const status = await page.locator('footer').boundingBox();
  expect(status?.height ?? 999, 'status bar height').toBeLessThanOrEqual(24.5);
  const shown = await drawing(page).boundingBox();
  expect(shown?.height ?? 0, 'map height').toBeGreaterThanOrEqual(640);
  expect(shown?.width ?? 0, 'map width with the rail').toBeGreaterThanOrEqual(1100);
  const rail = page.getByRole('navigation', { name: 'Modes' });
  const railBox = await rail.boundingBox();
  for (const row of await rail.getByRole('button').all()) {
    const box = await row.boundingBox();
    if (box !== null && (await row.textContent()) !== 'Hide') expect(box.height, 'a rail row').toBeLessThanOrEqual(33);
  }
  expect(railBox?.width ?? 999, 'the rail is as wide as its longest label plus padding').toBeLessThanOrEqual(200);
  await rail.getByRole('button', { name: 'Hide' }).click();
  await expect(rail).toHaveCount(0);
  const menu = page.locator('header').getByRole('button', { name: /^☰ / });
  await expect(menu).toBeVisible();
  const hidden = await drawing(page).boundingBox();
  expect(hidden?.width ?? 0, 'map width with the rail hidden').toBeGreaterThanOrEqual(1220);
  await page.waitForTimeout(1000); // the choice is saved after a short delay (a reload is not a flush)
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeVisible();
  await expect(page.locator('header').getByRole('button', { name: /^☰ / })).toBeVisible({ timeout: 60_000 }); // remembered
  await page.locator('header').getByRole('button', { name: /^☰ / }).click();
  await expect(page.getByRole('menuitemradio').first()).toBeVisible();
});

test('1920x1000: the map area is at least 840 px tall; the Find box uses the UI font', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openApp(page);
  await loadDemo(page);
  await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible({ timeout: 60_000 });
  const map = await drawing(page).boundingBox();
  expect(map?.height ?? 0, 'map height at 1920x1000').toBeGreaterThanOrEqual(840);
  const status = await page.locator('footer').boundingBox();
  expect(status?.height ?? 999).toBeLessThanOrEqual(24.5);
  const family = await page.getByRole('combobox', { name: 'Find a family' }).evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).not.toMatch(/mono/i);
});
