/**
 * Step 8.4g, Part B (G2, G3, G5): Starred (the star, the key S, the view, reload, the phone tab), Recent (the palette, the Chapters strip, Clear recent)
 * and the shortcuts sheet. Studio, demo data, every engine; the phone block in Chromium and WebKit.
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loadDemo, openApp, openPhoneApp } from './kit';
import { familyIds } from './map-focus-kit';
import { phoneFamily } from './map-layout-kit';

const NAV = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const hash = (page: Page): Promise<string> => page.evaluate(() => location.hash);
const rail = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const goTo = (page: Page, name: string) => rail(page).getByRole('button', { name, exact: true }).click();
const palette = (page: Page) => page.getByRole('dialog', { name: 'Search' });
const shot = async (page: Page, name: string): Promise<void> => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `screenshots/8.4g/B/${name}-light.png` });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `screenshots/8.4g/B/${name}-dark.png` });
  await page.emulateMedia({ colorScheme: 'light' });
};

async function demo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(page.getByRole('group', { name: NAV })).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(600);
}

async function pickFamily(page: Page): Promise<string> {
  const [id] = await familyIds(page);
  await page.locator(`svg [data-node-id="${id as string}"]`).click();
  await expect.poll(() => hash(page)).toBe(`#/map/family/${id as string}`);
  return id as string;
}

test.describe('G2, G3, G5 (desktop)', () => {
  test('S stars the selected record; the Starred view lists it; the star survives a reload; the empty view says what to do', async ({ page }) => {
    await demo(page);
    await goTo(page, 'Starred');
    await expect(page.getByText('Nothing starred yet. Press the star on any reaction or compound to keep it here.')).toBeVisible();
    await expect.poll(() => hash(page)).toBe('#/starred');
    await shot(page, 'starred-empty');
    await goTo(page, 'Map');
    const id = await pickFamily(page);
    const star = page.getByRole('button', { name: 'Star for revision' });
    await expect(star).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('s');
    await expect(star).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1200); // the saved state is written after a short pause
    await page.reload();
    await expect(page.getByRole('group', { name: NAV })).toBeVisible({ timeout: 90_000 });
    await goTo(page, 'Starred');
    const row = page.locator(`[data-record-id="${id}"]`).first();
    await expect(row).toBeVisible();
    await expect(page.getByRole('region', { name: 'Classes' })).toBeVisible();
    await shot(page, 'starred-filled');
    await row.click();
    await expect(page.getByRole('button', { name: 'Star for revision' })).toHaveAttribute('aria-pressed', 'true');
    // step C, F2: the record IS listed in Starred, so the inspector never says it has no place in this view
    await expect(page.getByText(/has no place in this view/)).toHaveCount(0);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'screenshots/C/starred-filled-light.png' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(350);
    await page.screenshot({ path: 'screenshots/C/starred-filled-dark.png' });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.keyboard.press('s');
    await expect(page.getByRole('button', { name: 'Star for revision' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('Recent: the palette lists the records opened, Chapters shows "Continue where you left off", Clear recent empties both', async ({ page }) => {
    await demo(page);
    await pickFamily(page);
    await page.waitForTimeout(800); // the late chunk loads the recent list
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    await expect(palette(page).getByText('Recent', { exact: true })).toBeVisible();
    await expect(palette(page).getByRole('option').first()).toBeVisible();
    await shot(page, 'palette-recent');
    await page.keyboard.press('Escape');
    await goTo(page, 'Chapters');
    const strip = page.getByRole('region', { name: 'Continue where you left off' });
    await expect(strip).toBeVisible();
    expect(await strip.getByRole('button').count()).toBeLessThanOrEqual(5);
    await shot(page, 'chapters-strip');
    await goTo(page, 'Settings');
    await expect(page.getByText('Starred and recent are kept in this browser only.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear recent' }).click();
    await goTo(page, 'Chapters');
    await expect(page.getByRole('region', { name: 'Continue where you left off' })).toHaveCount(0);
  });

  test('the question mark opens the shortcuts sheet made from the key map; the palette and Settings open it too; Esc closes it', async ({ page }) => {
    await demo(page);
    await page.keyboard.press('Shift+?');
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(sheet).toBeVisible();
    for (const name of ['Anywhere', 'Map', 'Lists', 'Studio']) await expect(sheet.getByRole('heading', { name })).toBeVisible();
    await expect(sheet.getByText('Zoom in')).toBeVisible();
    await shot(page, 'shortcuts');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await page.keyboard.press('Control+k');
    await palette(page).getByRole('combobox').fill('>shortcuts');
    await palette(page).getByRole('option', { name: /Show keyboard shortcuts/ }).click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await goTo(page, 'Settings');
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await expect(sheet).toBeVisible();
  });
});

const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
test.describe('G2 (phone)', () => {
  test.use({ ...PIXEL });
  test('the fifth tab is Starred (Search is in the top bar); the star in the sheet; the Starred tab lists the record', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox has no mobile emulation');
    await openPhoneApp(page);
    await loadDemo(page);
    const tabs = page.getByRole('navigation', { name: 'Home' });
    await expect(tabs.getByRole('button', { name: 'Starred' })).toBeVisible();
    await expect(tabs.getByRole('button', { name: 'Search' })).toHaveCount(0);
    await tabs.getByRole('button', { name: 'Map' }).tap();
    await expect(page.getByRole('group', { name: NAV })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('button', { name: 'Fit', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
    const id = await phoneFamily(page);
    await page.locator(`svg [data-node-id="${id}"]`).tap();
    await page.getByRole('button', { name: 'Star for revision' }).tap();
    await expect(page.getByRole('button', { name: 'Star for revision' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-sheet]').getByRole('button', { name: 'Close inspector' }).tap(); // the sheet sits over the tabs
    await tabs.getByRole('button', { name: 'Starred' }).tap();
    await expect(page.locator(`[data-record-id="${id}"]`).first()).toBeVisible();
    await expect(tabs.getByRole('button', { name: 'Starred' })).toHaveAttribute('aria-current', 'page');
    await shot(page, 'phone-starred-tab');
  });
});
