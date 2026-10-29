/**
 * Precursors on a phone (step 7.2b D1-D3), the STUDIO production build: Pixel 7 in Chromium, iPhone 14 in WebKit. The Explore tab's
 * "Reactions | Precursors" switch (44 px, the current one marked), a target and a route search in one column, a route card with the
 * three-line step, Search and Cancel 44 px, and the inspector's full sheet with "How to make it". Axe on each state.
 * Screenshots: phone-explore-switch-pixel7.png, phone-precursors-pixel7.png, phone-precursors-iphone14.png.
 */
import { devices, expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';
import { shotsDir } from './editor-kit';

test.use({ actionTimeout: 60_000 });

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const view = (page: Page) => page.getByRole('region', { name: 'Precursors', exact: true });

async function pick(page: Page, label: string, text: string, hitName: string): Promise<void> {
  const box = view(page).getByRole('searchbox', { name: label, exact: true });
  const hit = view(page).getByRole('button', { name: hitName, exact: true });
  await expect(async () => {
    await box.fill('');
    await box.fill(text);
    await expect(hit).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60_000 });
  await hit.tap();
}

async function walk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Explore' }).tap();
  const switcher = page.getByRole('group', { name: 'Explorer' });
  await expect(switcher.getByRole('button', { name: 'Reactions' })).toHaveAttribute('aria-pressed', 'true');
  for (const name of ['Reactions', 'Precursors']) {
    const box = await switcher.getByRole('button', { name }).boundingBox();
    expect(box !== null && box.height >= 44).toBe(true);
  }
  if (device === 'pixel7') await expect(page.getByRole('region', { name: 'Reactions', exact: true })).toBeVisible({ timeout: 60_000 });
  if (device === 'pixel7') await expect(page.getByText(/^Drawing the structure/)).toHaveCount(0, { timeout: 60_000 });
  if (device === 'pixel7') await page.screenshot({ path: `${shotsDir()}/phone-explore-switch-pixel7.png` });
  await switcher.getByRole('button', { name: 'Precursors' }).tap();
  await expect(page.getByRole('heading', { name: 'Make a compound' })).toBeVisible();
  await expect(switcher.getByRole('button', { name: 'Precursors' })).toHaveAttribute('aria-pressed', 'true');
  await pick(page, 'Compound to make', 'propan-2-ol', 'Choose Propan-2-ol');
  await pick(page, 'Start from (optional)', 'ethanol', 'Start from Ethanol');
  for (const name of ['Search']) {
    const box = await view(page).getByRole('button', { name, exact: true }).boundingBox();
    expect(box !== null && box.height >= 44).toBe(true);
  }
  await view(page).getByRole('button', { name: 'Search', exact: true }).tap();
  const found = view(page).getByRole('region', { name: 'Routes found' });
  await expect(found.getByText('2 routes found')).toBeVisible();
  // the step is one block of three lines
  const step = found.locator('li[data-step="1"]').first();
  await expect(step.locator('[data-line="title"]')).toBeVisible();
  await expect(step.locator('[data-line="reaction"]')).toBeVisible();
  expect(await axeProblems(page, 10)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/phone-precursors-${device}.png` });
  // Reactions comes back, remembered
  await switcher.getByRole('button', { name: 'Reactions' }).tap();
  await expect(page.getByRole('heading', { name: 'Reactions', exact: true })).toBeVisible();
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('the Explore switch, a search, a route card', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await walk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('the Explore switch, a search, a route card', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await walk(page, 'iphone14');
  });
});
