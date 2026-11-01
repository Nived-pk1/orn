/**
 * The Reagents view on a phone (step 7.3c E1-E3), the STUDIO production build: Pixel 7 in Chromium, iPhone 14 in WebKit. The Explore tab's
 * switch is ONE native select "Show:" of 44 px or more (7.4) that fits the width; at least 4 entries show above the tab bar (7.4 A6); the Reagents list is one column with its
 * filters behind "Filters (n)"; a reagent page puts the profile's conditions ABOVE its cards; every target is 44 px; no sideways scroll. Axe on
 * each state, zero CSP violations. Screenshots: phone-reagents-compact-pixel7.png, phone-reagent-page-pixel7.png, phone-reagents-compact-iphone14.png, phone-explore-select-pixel7.png.
 */
import { devices, expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { axeProblems, expectClean, loadDemo, openPhoneApp, watch } from './kit';
import { shotsDir } from './editor-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const view = (page: Page) => page.getByRole('region', { name: 'Reagents', exact: true });
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Home' });

async function walk(page: Page, device: string, withPage: boolean): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await loadDemo(page);
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible({ timeout: 90_000 });
  await tabs(page).getByRole('button', { name: 'Explore' }).tap();

  // the switch (7.4): ONE native select "Show:" with five choices, 44 px or more, inside the screen
  const choices = page.getByRole('combobox', { name: 'Show:' });
  expect(await choices.locator('option').allTextContents()).toEqual(['Reactions', 'Precursors', 'Reagents', 'Named reactions', 'Mechanisms']);
  const width = page.viewportSize()?.width ?? 0;
  const box = await choices.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width + 0.5);
  await expect(choices).toHaveValue('reactions');
  if (device === 'pixel7') await page.screenshot({ path: `${shotsDir()}/phone-explore-select-pixel7.png` });
  await choices.selectOption({ label: 'Reagents' });
  await expect(view(page)).toBeVisible();
  await expect(view(page).locator('[data-reagent-id]').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); // one column, no sideways scroll
  await expect(view(page).getByRole('button', { name: /^Filters \(\d+\)$/ })).toBeVisible(); // the filters are behind a button
  await expect(view(page).getByLabel('Find by name')).toHaveCount(0);
  for (const box of await view(page).getByRole('list', { name: 'Reagents' }).getByRole('button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
  expect(await axeProblems(page, 10)).toEqual([]);
  // A6 (7.4): at least 4 entries are visible above the tab bar with the filters closed
  const tabTop = (await tabs(page).boundingBox())?.y ?? 0;
  const visible = await view(page).locator('[data-reagent-id]').evaluateAll((els, limit) => els.filter((el) => el.getBoundingClientRect().top < limit).length, tabTop);
  expect(visible).toBeGreaterThanOrEqual(4);
  await page.screenshot({ path: `${shotsDir()}/phone-reagents-compact-${device}.png` });

  if (withPage) {
    await view(page).getByRole('button', { name: /^Filters \(\d+\)$/ }).tap();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await sheet.getByLabel('Find by name').fill('permanganate');
    await sheet.getByRole('button', { name: /^Show \d+ reagents?$/ }).tap();
    await expect(sheet).toBeHidden();
    await view(page).getByRole('button', { name: 'Potassium permanganate' }).tap();
    await expect(view(page).getByRole('heading', { level: 2, name: 'Potassium permanganate' })).toBeVisible();
    const section = view(page).getByRole('region', { name: "Baeyer's reagent" });
    await expect(section.locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
    // the conditions box is ABOVE the cards on a phone
    const boxTop = (await section.getByRole('complementary', { name: 'Usual conditions of this profile' }).boundingBox())?.y ?? Infinity;
    const cardTop = (await section.locator('article[data-reaction-id]').first().boundingBox())?.y ?? -Infinity;
    expect(boxTop).toBeLessThan(cardTop);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await axeProblems(page, 10)).toEqual([]);
    await page.screenshot({ path: `${shotsDir()}/phone-reagent-page-${device}.png` });
  }
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('the three-way switch, the reagent list and a reagent page', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(400_000);
    await walk(page, 'pixel7', true);
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('the three-way switch and the reagent list', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(400_000);
    await walk(page, 'iphone14', false);
  });
});
