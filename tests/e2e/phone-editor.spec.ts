/**
 * The names editor on a phone (step 6.1a part 4; ADR-039 addendum: authoring is desktop-first, but an editor opens full-screen and must
 * work), PRODUCTION build, on the two touch devices: Pixel 7 (Chromium) and iPhone 14 (WebKit). A species is found on the Search tab and
 * shown in the sheet; "Edit names" is in the FULL sheet, not in the peek; the editor fills the screen; Save works; More shows
 * "Undo Edit names of ..." (Undo and Redo are not on the phone's top bar). Screenshots: screenshots/phone-editor-<device>.png.
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, openPhoneApp, watch } from './kit';
import { canonicalInput, draftStatus, editorDialog, searchFor, shotsDir } from './editor-kit';

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const sheet = (page: Page) => page.locator('aside[data-sheet]');

async function walk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();

  // the Search tab: find the species and show it in the sheet
  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Search' }).tap();
  const palette = page.getByRole('dialog', { name: 'Search' });
  await expect(palette).toBeVisible();
  await searchFor(page, 's: ethanol');
  await palette.locator('[role="option"][data-record-id="spc_ethanol"]').tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'peek');

  // authoring is desktop-first: the button is in the FULL sheet, not in the peek
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show the whole record' }).tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'full');
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();

  // the editor opens full-screen and works
  const dialog = editorDialog(page, 'Ethanol');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width ?? 0, 'the editor fills the width of the screen').toBeGreaterThanOrEqual((viewport?.width ?? 0) - 1);
  expect(box?.height ?? 0, 'the editor fills the height of the screen').toBeGreaterThanOrEqual((viewport?.height ?? 0) * 0.9);
  await canonicalInput(page).fill('Ethanol phone');
  await expect(draftStatus(page)).toHaveText(/^(Saving draft\.\.\.|Draft saved )/);
  // a list row: the text field takes the row; Up, Down and Remove sit in ONE row under it, each at least 44 px high
  const rowField = dialog.locator('li input[data-field-path^="names.common"]').first();
  await rowField.scrollIntoViewIfNeeded();
  const text = await rowField.inputValue();
  const fieldBox = await rowField.boundingBox();
  const boxes = await Promise.all(['up', 'down'].map((d) => dialog.getByRole('button', { name: `Move ${text} ${d}` }).boundingBox()).concat(dialog.getByRole('button', { name: `Remove ${text}` }).boundingBox()));
  expect(fieldBox, 'the common name field is drawn').not.toBeNull();
  const tops = boxes.map((b) => Math.round(b?.y ?? -1));
  expect(new Set(tops).size, 'Up, Down and Remove share one row').toBe(1);
  expect(tops[0] ?? 0, 'the buttons sit under the field').toBeGreaterThanOrEqual((fieldBox?.y ?? 0) + (fieldBox?.height ?? 0) - 1);
  for (const b of boxes) expect(b?.height ?? 0, 'a 44 px target').toBeGreaterThanOrEqual(43.5);
  await page.screenshot({ path: `${shotsDir()}/phone-editor-${device}.png` });
  await dialog.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expect(sheet(page).getByRole('heading', { level: 3, name: 'Ethanol phone' })).toBeVisible();

  // More: the global history is there, not on the bar
  await expect(page.getByRole('banner').getByRole('button', { name: /^Undo/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'More' }).tap();
  const more = page.getByRole('dialog', { name: 'More' });
  await expect(more.getByRole('button', { name: 'Undo Edit species Ethanol' })).toBeVisible();
  await more.getByRole('button', { name: 'Undo Edit species Ethanol' }).tap();
  await expect(more).toBeHidden().catch(() => undefined);
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('Edit names from the full sheet opens full-screen, Save works, More shows Undo', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(240_000);
    await walk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('Edit names from the full sheet opens full-screen, Save works, More shows Undo', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(240_000);
    await walk(page, 'iphone14');
  });
});
