/**
 * A stage's conditions on a phone (step 6.4a part 3; ADR-039 addendum: authoring is desktop-first, but the editor opens full-screen and must
 * work), PRODUCTION build, on the two touch devices: Pixel 7 (Chromium) and iPhone 14 (WebKit). The demo's PCC reaction is found on the Search
 * tab, shown in the full sheet and edited: the conditions of stage 1 stack (the value, then its unit, 44 px high), a temperature is typed,
 * the summary line follows, Save works. Screenshots: screenshots/phone-reaction-editor-conditions-<pixel7|iphone14>.png.
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';
import { searchFor, shotsDir } from './editor-kit';

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
  await searchFor(page, 'r: ethanol');
  await palette.locator('[role="option"][data-record-id="rxn_ethanol-to-ethanal-pcc"]').tap();
  await page.getByRole('button', { name: 'Show the whole record' }).tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'full');
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();

  const dialog = page.getByRole('dialog', { name: /^Edit / });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('stage-conditions')).toHaveText('Conditions: anhydrous');
  await dialog.getByRole('button', { name: 'Edit conditions of stage 1' }).tap();
  await dialog.getByLabel('Temperature kind of stage 1').selectOption('value');
  const value = dialog.getByLabel('Temperature value of stage 1');
  const unit = dialog.getByLabel('Temperature unit of stage 1');
  await value.fill('25');
  await unit.selectOption('C');
  await expect(dialog.getByTestId('stage-conditions')).toHaveText('Conditions: 25 °C · anhydrous');
  // stacked: the value, then its unit under it, both at least 44 px high and inside the screen
  const v = await value.boundingBox();
  const u = await unit.boundingBox();
  expect((u?.y ?? 0) >= (v?.y ?? 0) + (v?.height ?? 0) - 2, 'the unit is under the value').toBe(true);
  expect(v?.height ?? 0, 'a 44 px target').toBeGreaterThanOrEqual(44);
  expect(u?.height ?? 0, 'a 44 px target').toBeGreaterThanOrEqual(44);
  const width = page.viewportSize()?.width ?? 0;
  expect((v?.x ?? 0) + (v?.width ?? 0), 'inside the screen').toBeLessThanOrEqual(width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await axeProblems(page)).toEqual([]);
  await value.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/phone-reaction-editor-conditions-${device}.png` });
  await dialog.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Saved/)).toBeVisible();
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test("a stage's temperature is edited on a phone and saved", async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await walk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test("a stage's temperature is edited on a phone and saved", async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await walk(page, 'iphone14');
  });
});
