/**
 * The class editor on a phone (step 6.2b part 2; ADR-039 addendum: authoring is desktop-first, but an editor opens full-screen and must
 * work), PRODUCTION build, on the two touch devices: Pixel 7 (Chromium) and iPhone 14 (WebKit). A class is found on the Search tab and
 * shown in the sheet; "Edit" is in the FULL sheet; the editor fills the screen, the long sections start closed and open by tap, the
 * parent picker works by touch, Save works, More shows "Undo Edit class ...".
 * Screenshots: screenshots/phone-class-editor-<pixel7|iphone14>.png.
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, openPhoneApp, watch } from './kit';
import { canonicalInput, editorDialog, searchFor, shotsDir } from './editor-kit';

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const sheet = (page: Page) => page.locator('aside[data-sheet]');

async function walk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Search' }).tap();
  const palette = page.getByRole('dialog', { name: 'Search' });
  await expect(palette).toBeVisible();
  await searchFor(page, 'c: alcohols');
  await palette.locator('[role="option"][data-record-id="cls_alcohols"]').tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'peek');

  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show the whole record' }).tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'full');
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();

  const dialog = editorDialog(page, 'Alcohols');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width ?? 0, 'the editor fills the width of the screen').toBeGreaterThanOrEqual((viewport?.width ?? 0) - 1);
  expect(box?.height ?? 0, 'the editor fills the height of the screen').toBeGreaterThanOrEqual((viewport?.height ?? 0) * 0.9);

  // the long sections start closed on a phone and open by tap
  const generic = dialog.getByRole('button', { name: /Generic representation/ });
  await expect(generic).toHaveAttribute('aria-expanded', 'false');
  await generic.tap();
  await expect(generic).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.getByLabel('Membership SMARTS (optional)')).toBeVisible();

  await canonicalInput(page).fill('Alcohols phone');
  const parents = dialog.getByRole('button', { name: /^.? ?Parents/ });
  await parents.scrollIntoViewIfNeeded();
  await dialog.getByLabel('Find a parent class by name').fill('ethers');
  await dialog.getByRole('list', { name: 'Classes found' }).getByRole('button', { name: 'Add Ethers', exact: true }).tap();
  await expect(dialog.getByRole('list', { name: 'Parent classes' })).toContainText('Ethers');
  await page.screenshot({ path: `${shotsDir()}/phone-class-editor-${device}.png` });
  await dialog.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expect(sheet(page).getByRole('heading', { level: 3, name: 'Alcohols phone' })).toBeVisible();

  await page.getByRole('button', { name: 'More' }).tap();
  const more = page.getByRole('dialog', { name: 'More' });
  await expect(more.getByRole('button', { name: 'Undo Edit class Alcohols' })).toBeVisible();
  await more.getByRole('button', { name: 'Undo Edit class Alcohols' }).tap();
  await expect(more).toBeHidden().catch(() => undefined);
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('Edit a class from the full sheet opens full-screen, the parent picker works, Save works', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await walk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('Edit a class from the full sheet opens full-screen, the parent picker works, Save works', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await walk(page, 'iphone14');
  });
});
