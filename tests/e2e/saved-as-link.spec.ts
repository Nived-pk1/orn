/**
 * The "Saved as <route>" link on a found route (step 7.2b), the STUDIO production build. The demo saves one of the two routes from Ethanol
 * to Propan-2-ol, so the search shows "Saved as Ethanol → propan-2-ol" on one card. Desktop: the link is readable (axe, colour contrast);
 * Pixel 7: the same, and its height is reported (the 44 px target is a 7.3 Part A item, not asserted here). Screenshots:
 * saved-as-link-1280x800.png, saved-as-link-pixel7.png.
 */
import { devices, expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';
import { openDemo, shotsDir } from './editor-kit';

test.use({ actionTimeout: 60_000 });

const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const view = (page: Page) => page.getByRole('region', { name: 'Precursors', exact: true });

async function pick(page: Page, label: string, text: string, hitName: string, tap: boolean): Promise<void> {
  const box = view(page).getByRole('searchbox', { name: label, exact: true });
  const hit = view(page).getByRole('button', { name: hitName, exact: true });
  await expect(async () => {
    await box.fill('');
    await box.fill(text);
    await expect(hit).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60_000 });
  await (tap ? hit.tap() : hit.click());
}

async function search(page: Page, tap: boolean): Promise<ReturnType<Page['locator']>> {
  await pick(page, 'Compound to make', 'propan-2-ol', 'Choose Propan-2-ol', tap);
  await pick(page, 'Start from (optional)', 'ethanol', 'Start from Ethanol', tap);
  const go = view(page).getByRole('button', { name: 'Search', exact: true });
  await (tap ? go.tap() : go.click());
  const found = view(page).getByRole('region', { name: 'Routes found' });
  await expect(found.getByText('2 routes found')).toBeVisible();
  const link = found.getByRole('button', { name: 'Ethanol → propan-2-ol', exact: true });
  await expect(link).toBeVisible();
  await link.scrollIntoViewIfNeeded();
  return link;
}

async function dismissToasts(page: Page): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

test('desktop: the Saved as link is readable', async ({ page }) => {
  test.setTimeout(300_000);
  const seen = await watch(page);
  await openDemo(page);
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Precursors' }).click();
  await search(page, false);
  expect(await axeProblems(page)).toEqual([]);
  await dismissToasts(page);
  await page.screenshot({ path: `${shotsDir()}/saved-as-link-1280x800.png` });
  await expectClean(seen);
});

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('the Saved as link: readable, its height reported', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openPhoneApp(page);
    await page.getByRole('button', { name: 'Load demo dataset' }).tap();
    await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Explore' }).tap();
    await page.getByRole('group', { name: 'Explorer' }).getByRole('button', { name: 'Precursors' }).tap();
    const link = await search(page, true);
    expect(await axeProblems(page, 10)).toEqual([]);
    const box = await link.boundingBox();
    console.log(`SAVED-AS-LINK phone height: ${box?.height ?? 'none'} px, width ${box?.width ?? 'none'} px`);
    await page.screenshot({ path: `${shotsDir()}/saved-as-link-pixel7.png` });
    await expectClean(seen);
  });
});
