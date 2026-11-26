/**
 * Step 8.5g Part B, PRODUCTION build: Structures: Full on a family card. The demo with two structures swapped in a copy (a test fixture,
 * never demo data): the PCC card's product is hexane and its reactant is tetra-tert-butylmethane, which no drawing with all atoms has room
 * for. Desktop 1280: hexane shows all its atoms with no scroll box; the crowded one is shown condensed and says so, under the picture and
 * in its text alternative. Pixel 7: the same, nothing clipped. Screenshots: screenshots/8.5g/after-full-fallback.png, after-full-phone-family.png.
 */
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { exampleCard, expectClean, leaveChapters, openPhoneApp, chooseFile, expectPreview, watch } from './kit';
import { changedDemo, importOwn, recordsOf } from './own-data-kit';
import { setStructures } from './size-rule-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const CROWDED = 'Too crowded with all atoms; shown condensed';

const swapped = () =>
  changedDemo((records) => {
    const species = recordsOf<{ id: string; structure?: unknown }>(records, 'species');
    for (const [id, value] of [['spc_ethanal', 'CCCCCC'], ['spc_ethanol', 'CC(C)(C)C(C(C)(C)C)(C(C)(C)C)C(C)(C)C']] as const) {
      const found = species.find((s) => s.id === id);
      if (found === undefined) throw new Error(`no ${id}`);
      found.structure = { format: 'smiles', value };
    }
  });

/** Nothing of a drawing is cut off: its picture lies inside the box that holds it, or that box scrolls to all of it. */
async function expectNothingClipped(card: Locator): Promise<void> {
  const cut = await card.locator('img[data-bond-px]').evaluateAll((images) =>
    images.flatMap((image) => {
      const box = image.parentElement as HTMLElement;
      const fits = image.getBoundingClientRect().width <= box.getBoundingClientRect().width + 1 || box.scrollWidth > box.clientWidth;
      return fits ? [] : [image.getAttribute('alt') ?? ''];
    }),
  );
  expect(cut).toEqual([]);
}

async function check(page: Page, card: Locator): Promise<void> {
  await expect(card.getByRole('img', { name: 'Structure of Ethanal' })).toBeVisible({ timeout: 90_000 });
  await expect(card.getByRole('img', { name: `Structure of Ethanol. ${CROWDED}` })).toBeVisible({ timeout: 90_000 });
  await expect(card.getByText(CROWDED)).toBeVisible();
  await expectNothingClipped(card);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('desktop 1280: hexane with all atoms needs no scroll box; a structure with no room says it is shown condensed', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, swapped());
  await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
  await expect(page.getByRole('region', { name: /^Family page: Alcohols/ })).toBeVisible();
  await page.getByRole('button', { name: /^Aldehydes\s*\d+\s*reactions?$/ }).last().click();
  await setStructures(page, 'Full');
  const card = await exampleCard(page, /ethanal \(PCC\)/);
  await card.scrollIntoViewIfNeeded();
  await check(page, card);
  const hexane = card.getByRole('img', { name: 'Structure of Ethanal' });
  await expect.poll(async () => Number(await hexane.getAttribute('data-bond-px'))).toBeGreaterThanOrEqual(28 * 1.4 * 0.85 - 0.3);
  expect(await hexane.evaluate((image) => (image.parentElement as HTMLElement).hasAttribute('data-scrolls'))).toBe(false);
  await card.screenshot({ path: 'screenshots/8.5g/after-full-fallback.png' });
  await expectClean(seen);
});

test.describe('phone: Pixel 7', () => {
  test.use({ ...PIXEL });
  test('the same card in Full: nothing clipped, the fallback line shows', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(480_000);
    await openPhoneApp(page);
    await chooseFile(page, swapped());
    await expectPreview(page);
    await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).tap();
    await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 120_000 });
    await leaveChapters(page);
    await page.getByRole('button', { name: /^Alcohols/ }).tap();
    await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
    await setStructures(page, 'Full');
    await page.getByRole('button', { name: /^Aldehydes\s*\d+\s*reactions?$/ }).last().tap();
    const card = await exampleCard(page, /ethanal \(PCC\)/);
    await card.scrollIntoViewIfNeeded();
    await check(page, card);
    await page.screenshot({ path: 'screenshots/8.5g/after-full-phone-family.png' });
  });
});
