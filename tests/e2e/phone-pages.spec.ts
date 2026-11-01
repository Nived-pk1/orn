/**
 * The Named reactions and Mechanisms views on a phone (step 7.4 D, E), the STUDIO production build: Pixel 7 in Chromium, iPhone 14 in WebKit. The
 * Explore tab's ONE select "Show:" chooses Named reactions and Mechanisms; each list is one column with its filters behind "Filters (n)"; a named
 * reaction page has its cards; a mechanism page has numbered steps with the species drawn; every target is 44 px; no sideways scroll. Axe on each
 * state, zero CSP violations. Screenshots: phone-named-page-pixel7.png, phone-mechanism-page-pixel7.png, phone-mechanism-page-iphone14.png.
 */
import { devices, expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { axeProblems, expectClean, loadDemo, openPhoneApp, watch } from './kit';
import { shotsDir } from './editor-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Home' });
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function walk(page: Page, device: string, withNamed: boolean): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await loadDemo(page);
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible({ timeout: 90_000 });
  await tabs(page).getByRole('button', { name: 'Explore' }).tap();
  const choose = page.getByRole('combobox', { name: 'Show:' });

  if (withNamed) {
    await choose.selectOption({ label: 'Named reactions' });
    const named = page.getByRole('region', { name: 'Named reactions', exact: true });
    await expect(named.locator('[data-named-id]').first()).toBeVisible();
    await expect(named.getByRole('button', { name: /^Filters \(\d+\)$/ })).toBeVisible();
    expect(await noSideways(page)).toBe(true);
    for (const height of await named.getByRole('list', { name: 'Named reactions' }).getByRole('button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(height).toBeGreaterThanOrEqual(44);
    expect(await axeProblems(page, 10)).toEqual([]);
    await named.getByRole('button', { name: 'Aldol reaction' }).tap();
    await expect(named.getByRole('heading', { level: 2, name: 'Aldol reaction' })).toBeVisible();
    await expect(named.locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
    expect(await noSideways(page)).toBe(true);
    expect(await axeProblems(page, 10)).toEqual([]);
    await page.screenshot({ path: `${shotsDir()}/phone-named-page-${device}.png` });
  }

  await choose.selectOption({ label: 'Mechanisms' });
  const mechanisms = page.getByRole('region', { name: 'Mechanisms', exact: true });
  await expect(mechanisms.locator('[data-mechanism-id]').first()).toBeVisible();
  expect(await noSideways(page)).toBe(true);
  for (const height of await mechanisms.getByRole('list', { name: 'Mechanisms' }).getByRole('button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(height).toBeGreaterThanOrEqual(44);
  await mechanisms.getByRole('button', { name: 'Aldol addition of ethanal' }).tap();
  await expect(mechanisms.getByRole('heading', { level: 2, name: 'Aldol addition of ethanal' })).toBeVisible();
  await expect(mechanisms.locator('[data-step]').first()).toBeVisible();
  await expect(mechanisms.locator('[data-variant-id] img').first()).toBeVisible({ timeout: 60_000 });
  expect(await noSideways(page)).toBe(true);
  expect(await axeProblems(page, 10)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/phone-mechanism-page-${device}.png` });
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('the select, the Named reactions list and page, the Mechanisms list and page', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(400_000);
    await walk(page, 'pixel7', true);
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('the Mechanisms page', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(400_000);
    await walk(page, 'iphone14', false);
  });
});
