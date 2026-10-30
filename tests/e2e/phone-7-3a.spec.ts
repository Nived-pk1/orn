/**
 * Step 7.3a on a phone, the STUDIO production build: Pixel 7 in Chromium, iPhone 14 in WebKit. A changed copy of the demo is imported as the
 * visitor's own data. On the Explore tab's Reactions list: the three-stage Grignard card draws the numbered stages (i), (ii), (iii) beside and
 * under its DOWNWARD arrow; the general PCC oxidation has a closed "Examples (3)" that opens on a tap, 44 px high, and the examples are not
 * cards of their own. Axe on each state. The Review page has no way in on a phone (the phone has no mode list), so its phone filters are
 * covered by the unit test and not here. Screenshots: phone-stages-arrow-<device>.png, phone-examples-open-<device>.png.
 */
import { devices, expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { axeProblems, chooseFile, expectClean, expectPreview, openPhoneApp, watch } from './kit';
import { shotsDir } from './editor-kit';
import { demoWithExamplesAndStages, GENERAL, THREE_STAGE } from './examples-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const view = (page: Page) => page.getByRole('region', { name: 'Reactions', exact: true });

async function findByName(page: Page, text: string): Promise<void> {
  await view(page).getByRole('button', { name: /^Filters \(\d+\)$/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('searchbox', { name: 'Find by name' }).fill(text);
  await sheet.getByRole('button', { name: /^Show \d+ reactions?/ }).tap();
  await expect(sheet).toBeHidden();
}

async function walk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await chooseFile(page, demoWithExamplesAndStages());
  await expectPreview(page);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Explore' }).tap();
  await expect(view(page).locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });

  // the three numbered stages, beside and under the downward arrow
  await findByName(page, 'Zz three-stage');
  const three = view(page).locator('article[data-reaction-id]').filter({ has: page.getByRole('heading', { level: 4, name: THREE_STAGE }) });
  await expect(three).toBeVisible({ timeout: 60_000 });
  await expect(three).toContainText(/\(i\)[\s\S]*\(ii\)[\s\S]*\(iii\)/);
  await expect(three.getByText(/Drawing the structure/)).toHaveCount(0, { timeout: 60_000 });
  expect(await axeProblems(page, 10)).toEqual([]);
  await three.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/phone-stages-arrow-${device}.png` });

  // the general oxidation and its folded examples
  await findByName(page, 'PCC');
  const general = view(page).locator('article[data-reaction-id]').filter({ has: page.getByRole('heading', { level: 4, name: GENERAL }) });
  const summary = general.locator('details[data-examples] > summary').first();
  await expect(summary).toHaveText('Examples (3)');
  expect(await general.locator('details[data-examples]').evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  const box = await summary.boundingBox();
  expect(box !== null && box.height >= 44, 'the Examples summary is a 44 px target').toBe(true);
  await summary.tap();
  await expect(general.locator('details[data-examples]').getByRole('heading', { level: 5 })).toHaveCount(3);
  expect(await axeProblems(page, 10)).toEqual([]);
  await general.locator('details[data-examples]').getByRole('heading', { level: 5 }).first().scrollIntoViewIfNeeded(); // the opened list is what the picture shows
  await page.screenshot({ path: `${shotsDir()}/phone-examples-open-${device}.png` });
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('numbered stages and folded examples', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(400_000);
    await walk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('numbered stages and folded examples', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(400_000);
    await walk(page, 'iphone14');
  });
});
