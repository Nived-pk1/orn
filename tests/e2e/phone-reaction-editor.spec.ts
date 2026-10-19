/**
 * New reaction on a phone (step 6.3a part 4; ADR-039 addendum: authoring is desktop-first, but the editor opens full-screen and must work),
 * PRODUCTION build, on the two touch devices: Pixel 7 (Chromium) and iPhone 14 (WebKit). More > New reaction opens the editor full-screen;
 * a name, the scope, two participants (each a stacked card), Save. On the Pixel 7 the reagent Components rows of the 6.2b follow-up are also
 * checked in the browser: the record on its own row, the role under it, 44 px buttons. Screenshots:
 * screenshots/phone-reaction-editor-<pixel7|iphone14>.png and screenshots/phone-reagent-components-pixel7.png.
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';
import { shotsDir } from './editor-kit';

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

async function startPhone(page: Page): Promise<void> {
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
}

async function moreNew(page: Page, what: string): Promise<void> {
  await page.getByRole('button', { name: 'More' }).tap();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: what }).tap();
}

async function walk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await startPhone(page);
  await moreNew(page, 'New reaction');
  const dialog = page.getByRole('dialog', { name: 'New reaction' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width ?? 0, 'the editor fills the width of the screen').toBeGreaterThanOrEqual((viewport?.width ?? 0) - 1);
  expect(box?.height ?? 0, 'the editor fills the height of the screen').toBeGreaterThanOrEqual((viewport?.height ?? 0) * 0.9);

  await dialog.getByLabel('Name (required)').fill('Phone oxidation');
  await dialog.getByLabel('Scope (required)').selectOption('specific');
  for (const [role, search, name] of [['reactant', 'ethanol', 'Ethanol'], ['reagent', 'pcc', 'PCC']] as const) {
    await dialog.getByLabel('Add it as').selectOption(role);
    await dialog.getByLabel('Find a substance by name').fill(search);
    await dialog.getByRole('list', { name: 'Substances found', exact: true }).getByRole('button', { name: `Add ${name}`, exact: true }).tap();
  }
  const cards = dialog.getByTestId('participant-row');
  await expect(cards).toHaveCount(2);
  // one stacked card each: its fields are in ONE column (the second field starts below the first)
  const first = await cards.first().getByLabel('Role of participant 1').boundingBox();
  const second = await cards.first().getByLabel('Coefficient of participant 1').boundingBox();
  expect((second?.y ?? 0) > (first?.y ?? 0) + (first?.height ?? 0) - 2, 'a phone card stacks its fields').toBe(true);
  expect(await axeProblems(page)).toEqual([]);
  await cards.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/phone-reaction-editor-${device}.png` });
  await dialog.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Saved/)).toBeVisible();
  await expectClean(seen);
}

async function reagentComponents(page: Page): Promise<void> {
  const seen = await watch(page);
  await startPhone(page);
  await moreNew(page, 'New reagent');
  const dialog = page.getByRole('dialog', { name: 'New reagent' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Canonical name (required)').fill('Phone mixture');
  for (const [search, name] of [['ethanol', 'Ethanol'], ['dichloromethane', 'Dichloromethane']] as const) {
    await dialog.getByLabel('Find a component by name').fill(search);
    await dialog.getByRole('list', { name: 'Components found' }).getByRole('button', { name: new RegExp(`^Add ${name}`) }).tap();
  }
  const rows = dialog.getByTestId('component-row');
  await expect(rows).toHaveCount(2);
  const row = rows.first();
  const text = await row.locator('> span').first().boundingBox();
  const role = await row.getByLabel(/^Role of /).boundingBox();
  const amount = await row.getByLabel(/^Amount of /).boundingBox();
  const remove = await row.getByRole('button', { name: /^Remove / }).boundingBox();
  expect((role?.y ?? 0) >= (text?.y ?? 0) + (text?.height ?? 0) - 2, 'the role is under the record').toBe(true);
  expect((amount?.y ?? 0) >= (role?.y ?? 0) + (role?.height ?? 0) - 2, 'the amount is under the role').toBe(true);
  expect((remove?.y ?? 0) >= (amount?.y ?? 0) + (amount?.height ?? 0) - 2, 'the buttons are under the amount').toBe(true);
  expect(remove?.height ?? 0, 'a 44 px target').toBeGreaterThanOrEqual(44);
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/phone-reagent-components-pixel7.png` });
  await dialog.getByRole('button', { name: 'Close (keeps the draft)' }).tap();
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('More > New reaction opens full-screen, two participants as stacked cards, Save works', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await walk(page, 'pixel7');
  });
  test('the reagent Components rows are stacked: the record, the role, the amount, then the 44 px buttons', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await reagentComponents(page);
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('More > New reaction opens full-screen, two participants as stacked cards, Save works', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await walk(page, 'iphone14');
  });
});
