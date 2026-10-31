/**
 * The Chapters view on a phone (step 7.3b E1, E2), the STUDIO production build: Pixel 7 in Chromium, iPhone 14 in WebKit. The bottom tabs
 * are "Chapters | Families | Map | Explore | Search", each 44 px or more and inside the screen; the Chapters tab lists the chapters in one
 * column; a chapter page has its filters behind "Filters (n)" and full-width study cards; every "Read more" is a 44 px target. Axe on each
 * state, zero CSP violations. Screenshots: phone-chapters-pixel7.png, phone-chapter-page-pixel7.png, phone-chapters-iphone14.png.
 */
import { devices, expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { axeProblems, chooseFile, expectClean, expectPreview, openPhoneApp, watch } from './kit';
import { shotsDir } from './editor-kit';
import { CHAPTER_A, chaptersDemo } from './chapters-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const view = (page: Page) => page.getByRole('region', { name: 'Chapters', exact: true });
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Home' });

async function walk(page: Page, device: string, page2: boolean): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await chooseFile(page, chaptersDemo());
  await expectPreview(page);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible({ timeout: 90_000 });

  // the five tabs: in this order, 44 px or more, inside the screen
  const buttons = tabs(page).getByRole('button');
  expect(await buttons.allTextContents()).toEqual(['Chapters', 'Families', 'Map', 'Explore', 'Search']);
  const width = page.viewportSize()?.width ?? 0;
  for (const box of await buttons.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as { x: number; width: number; height: number }))) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
  }

  await tabs(page).getByRole('button', { name: 'Chapters' }).tap();
  await expect(view(page)).toBeVisible();
  await expect(view(page).locator('[data-chapter-id]').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); // one column, no sideways scroll
  expect(await axeProblems(page, 10)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/phone-chapters-${device}.png` });

  if (page2) {
    await view(page).getByRole('button', { name: CHAPTER_A }).tap();
    await expect(view(page).getByRole('heading', { level: 2, name: CHAPTER_A })).toBeVisible();
    await expect(view(page).getByRole('button', { name: /^Filters \(\d+\)$/ })).toBeVisible(); // the filters are behind a button
    await expect(view(page).getByLabel('Find in this chapter')).toHaveCount(0);
    await expect(view(page).locator('article[data-reaction-id], article[data-record-kind]').first()).toBeVisible({ timeout: 60_000 });
    for (const more of await view(page).getByRole('button', { name: /^Read more of / }).all()) {
      const box = await more.boundingBox();
      expect(box !== null && box.height >= 44, 'Read more is a 44 px target').toBe(true);
    }
    await view(page).getByRole('button', { name: /^Filters \(\d+\)$/ }).tap();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet.getByLabel('Find in this chapter')).toBeVisible();
    await sheet.getByRole('button', { name: /^Show \d+ records?$/ }).tap();
    await expect(sheet).toBeHidden();
    expect(await axeProblems(page, 10)).toEqual([]);
    await page.screenshot({ path: `${shotsDir()}/phone-chapter-page-${device}.png` });
  }
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('five tabs, the chapter list and a chapter page', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(400_000);
    await walk(page, 'pixel7', true);
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('five tabs and the chapter list', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(400_000);
    await walk(page, 'iphone14', false);
  });
});
