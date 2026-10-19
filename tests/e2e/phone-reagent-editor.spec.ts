/**
 * New reagent on a phone (step 6.2b part 3; ADR-039 addendum: authoring is desktop-first, but the editor opens full-screen and must work),
 * PRODUCTION build, on the two touch devices: Pixel 7 (Chromium) and iPhone 14 (WebKit). More > New reagent opens the editor full-screen;
 * the long sections start closed and open by tap; a name, a family, a profile with an alias, Save; the reagent is found by the alias on the
 * Search tab. Screenshots: screenshots/phone-reagent-editor-<pixel7|iphone14>.png.
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, openPhoneApp, watch } from './kit';
import { searchFor, shotsDir } from './editor-kit';

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

async function walk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();

  await page.getByRole('button', { name: 'More' }).tap();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'New reagent' }).tap();
  const dialog = page.getByRole('dialog', { name: 'New reagent' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width ?? 0, 'the editor fills the width of the screen').toBeGreaterThanOrEqual((viewport?.width ?? 0) - 1);
  expect(box?.height ?? 0, 'the editor fills the height of the screen').toBeGreaterThanOrEqual((viewport?.height ?? 0) * 0.9);

  const families = dialog.getByRole('button', { name: /Families/ });
  await expect(families).toHaveAttribute('aria-expanded', 'false');
  await families.tap();
  await expect(families).toHaveAttribute('aria-expanded', 'true');
  await dialog.getByRole('checkbox', { name: 'Oxidant' }).check();

  await dialog.getByLabel('Canonical name (required)').fill('Phone oxidant');
  await dialog.getByRole('button', { name: 'Add profile' }).tap();
  await dialog.getByLabel('Profile 1 label').fill('Cold and dilute');
  await dialog.getByRole('button', { name: 'Add alias to profile 1' }).tap();
  await dialog.getByLabel('Profile 1 alias 1', { exact: true }).fill('Phone Baeyer');
  await dialog.getByLabel('Profile 1 label').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/phone-reagent-editor-${device}.png` });
  await dialog.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(dialog).toBeHidden();

  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Search' }).tap();
  const palette = page.getByRole('dialog', { name: 'Search' });
  await expect(palette).toBeVisible();
  await searchFor(page, 'g: phone baeyer');
  await expect(palette.getByRole('option', { name: /Phone oxidant/ })).toBeVisible({ timeout: 60_000 });
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('More > New reagent opens full-screen, sections collapse, a profile with an alias, Save works', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await walk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('More > New reagent opens full-screen, sections collapse, a profile with an alias, Save works', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await walk(page, 'iphone14');
  });
});
