/**
 * New species on a phone (step 6.2a part 4; ADR-039 addendum: authoring is desktop-first, but the editor opens full-screen and must work),
 * PRODUCTION build, on the two touch devices: Pixel 7 (Chromium) and iPhone 14 (WebKit). More > New species opens the editor full-screen;
 * the long sections start closed and open by tap; a name, a SMILES, Save; the species is found on the Search tab.
 * Screenshots: screenshots/phone-species-editor-<pixel7|iphone14>.png.
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
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'New species' }).tap();
  const dialog = page.getByRole('dialog', { name: 'New species' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width ?? 0, 'the editor fills the width of the screen').toBeGreaterThanOrEqual((viewport?.width ?? 0) - 1);
  expect(box?.height ?? 0, 'the editor fills the height of the screen').toBeGreaterThanOrEqual((viewport?.height ?? 0) * 0.9);

  const stereo = dialog.getByRole('button', { name: /Stereo/ });
  await expect(stereo).toHaveAttribute('aria-expanded', 'false');
  await stereo.tap();
  await expect(stereo).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.getByLabel('Stereo statement')).toBeVisible();
  await stereo.tap();
  await expect(stereo).toHaveAttribute('aria-expanded', 'false');

  await dialog.getByLabel('Canonical name (required)').fill('Phone propanol');
  await dialog.getByLabel('SMILES, CXSMILES or molfile').fill('CCCO');
  await expect(dialog.getByRole('img', { name: 'Drawing of the entered structure' })).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `${shotsDir()}/phone-species-editor-${device}.png` });
  await dialog.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(dialog).toBeHidden();

  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Search' }).tap();
  const palette = page.getByRole('dialog', { name: 'Search' });
  await expect(palette).toBeVisible();
  await searchFor(page, 's: phone propanol');
  await expect(palette.getByRole('option', { name: /Phone propanol/ })).toBeVisible({ timeout: 60_000 });
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('More > New species opens full-screen, sections collapse, Save works', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await walk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('More > New species opens full-screen, sections collapse, Save works', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await walk(page, 'iphone14');
  });
});
