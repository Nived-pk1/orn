/**
 * Create new, Duplicate and the specific reaction from a generic one (step 6.7a; ADR-040 addendum, decisions C1-C3), PRODUCTION build, every
 * engine, Studio:
 *  (1) in a NEW reaction draft the product picker of an outcome offers "Create new species"; it opens a nested editor over the first named
 *      with the typed text; Save there puts the species in the dataset AND in the outcome; Save the reaction; both exist;
 *  (2) Duplicate a demo reaction from the inspector: asks, opens a "(copy)" draft, Save, both exist;
 *  (3) New specific reaction from the demo's generic "1° alcohol → aldehyde (PCC)": slots "Choose a species of ...", a member species in each,
 *      a name, Save; the Alcohols family page shows it;
 *  (4) on the Pixel 7 and iPhone 14: create a new species from a picker and Save.
 * Axe on the nested dialog; zero policy violations. Screenshots: screenshots/{create-new-row,nested-editor,duplicate-reaction,
 * specific-from-generic}-1280x800.png and phone-nested-editor-<pixel7|iphone14>.png.
 */
import { resolve } from 'node:path';
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch, exampleCard } from './kit';
import { openDemo, record, shotsDir, showRecord } from './editor-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const SPECIES = 'Zz propanal e2e';
const modes = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const reactionDialog = (page: Page) => page.getByRole('dialog', { name: 'New reaction' });
const speciesDialog = (page: Page) => page.getByRole('dialog', { name: 'New species' });

async function dismissToasts(page: Page): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  if ((await page.locator('dialog[open]').count()) > 0) {
    // a modal dialog makes the toasts unreachable: wait for the short ones to go away by themselves
    await expect.poll(() => toasts.count(), { timeout: 20_000 }).toBe(0).catch(() => undefined);
    return;
  }
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

async function startReaction(page: Page, name: string, tap = false): Promise<Locator> {
  const dialog = reactionDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name (required)').fill(name);
  await dialog.getByLabel('Scope (required)').selectOption('specific');
  void tap;
  return dialog;
}

async function openWorkbenchNew(page: Page, what: string): Promise<void> {
  await modes(page).getByRole('button', { name: /Workbench/ }).click();
  await page.getByRole('button', { name: what, exact: true }).click();
}

test.describe('create new from a picker (desktop)', () => {
  test('a species made from the product picker of a new reaction is saved and is the product', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);
    await openWorkbenchNew(page, 'New reaction');
    const dialog = await startReaction(page, 'Zz create-new reaction');
    await dialog.getByRole('button', { name: 'Add outcome', exact: true }).click();
    const field = dialog.getByLabel('Find a product of outcome 1 by name');
    await field.fill(SPECIES);
    const create = dialog.getByRole('button', { name: `Create new species "${SPECIES}"` });
    await expect(create).toBeVisible();
    await field.scrollIntoViewIfNeeded();
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'create-new-row-1280x800.png') });
    await create.click();
    const nested = speciesDialog(page);
    await expect(nested).toBeVisible();
    await expect(nested.getByLabel('Canonical name (required)')).toHaveValue(SPECIES);
    // one level only
    const classField = nested.getByLabel(/^Find a class by name/);
    await classField.fill('zzz');
    await expect(nested.getByText('Finish this one first: one new record at a time')).toBeVisible();
    await classField.fill('');
    expect(await axeProblems(page)).toEqual([]);
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'nested-editor-1280x800.png') });
    await nested.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(nested).toBeHidden();
    const row = dialog.getByRole('group', { name: 'Product 1 of outcome 1', exact: true });
    await expect(row).toContainText(SPECIES);
    await row.getByRole('radio', { name: 'Main' }).check();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await showRecord(page, 's', SPECIES);
    await expect(record(page).getByRole('heading', { level: 3, name: SPECIES })).toBeVisible();
    await showRecord(page, 'r', 'Zz create-new reaction');
    await expect(record(page).getByRole('heading', { level: 3, name: 'Zz create-new reaction' })).toBeVisible();
    await expectClean(seen);
  });
});

test.describe('duplicate and specific (desktop)', () => {
  test('Duplicate a demo reaction: it asks, opens a (copy) draft, Save adds it next to the original', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);
    await showRecord(page, 'r', '2-bromobutane', 'rxn_r-2-bromobutane-alc-koh');
    const title = (await record(page).getByRole('heading', { level: 3 }).first().textContent()) ?? '';
    await page.getByRole('complementary', { name: 'Inspector' }).getByRole('button', { name: 'Duplicate', exact: true }).click();
    const ask = page.getByRole('dialog', { name: 'Duplicate reaction' });
    await expect(ask).toContainText('are not copied');
    await ask.getByRole('button', { name: 'Start the copy' }).click();
    const dialog = reactionDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Name (required)')).toHaveValue(`${title} (copy)`);
    await dismissToasts(page);
    await dialog.getByLabel('Name (required)').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'duplicate-reaction-1280x800.png') });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await showRecord(page, 'r', `${title} (copy)`);
    await expect(record(page).getByRole('heading', { level: 3, name: `${title} (copy)` })).toBeVisible();
    await showRecord(page, 'r', '2-bromobutane', 'rxn_r-2-bromobutane-alc-koh');
    await expect(record(page).getByRole('heading', { level: 3, name: title, exact: true })).toBeVisible();
    await expectClean(seen);
  });

  test('a specific reaction from the demo generic one: a species in each slot, Save; the Alcohols family page shows it', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);
    await showRecord(page, 'r', 'aldehyde (PCC)', 'rxn_alcohol1-to-aldehyde-pcc');
    await page.getByRole('complementary', { name: 'Inspector' }).getByRole('button', { name: 'New specific reaction from this one', exact: true }).click();
    await page.getByRole('dialog', { name: 'New specific reaction' }).getByRole('button', { name: 'Start the specific reaction' }).click();
    const dialog = reactionDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/^Choose a species of /).first()).toBeVisible();
    await dismissToasts(page);
    await dialog.getByText(/^Choose a species of /).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'specific-from-generic-1280x800.png') });
    await dialog.getByLabel('Name (required)').fill('Zz ethanol -> ethanal (PCC)');
    // the participant slot, then the product slot (inside the outcome)
    const fill = async (search: string, name: string): Promise<void> => {
      const slot = dialog.locator('[data-slot]').first();
      const add = slot.getByRole('button', { name: `Add ${name}`, exact: true });
      await expect(async () => {
        await slot.locator('input[type="search"]').fill('');
        await slot.locator('input[type="search"]').fill(search);
        await expect(add).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 60_000 });
      await add.click();
    };
    await fill('ethanol', 'Ethanol');
    await dialog.getByRole('button', { name: 'Edit outcome 1' }).click();
    await fill('ethanal', 'Ethanal');
    await expect(dialog.locator('[data-slot]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await modes(page).getByRole('button', { name: 'Navigator' }).click();
    const family = page.getByRole('region', { name: 'Family page: Alcohols' });
    if (!(await family.isVisible())) await page.locator('svg [data-node-id="cls_alcohols"]').dblclick({ timeout: 30_000 });
    await expect(family).toBeVisible();
    // a specific reaction made from the generic one is its example, so it is folded under it (7.3a C1)
    await expect(await exampleCard(page, 'Zz ethanol -> ethanal (PCC)')).toBeVisible({ timeout: 60_000 });
    await expectClean(seen);
  });
});

async function walkPhone(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).tap();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'New reaction' }).tap();
  const dialog = reactionDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name (required)').fill('Phone create-new reaction');
  await dialog.getByLabel('Scope (required)').selectOption('specific');
  await dialog.getByLabel('Find a substance by name').fill(`Zz phone ${device}`);
  await dialog.getByRole('button', { name: `Create new species "Zz phone ${device}"` }).tap();
  const nested = speciesDialog(page);
  await expect(nested).toBeVisible();
  await expect(nested.getByLabel('Canonical name (required)')).toHaveValue(`Zz phone ${device}`);
  const box = await nested.boundingBox();
  expect(box?.width ?? 0, 'the nested editor fills the screen').toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 0) - 1);
  expect(await axeProblems(page)).toEqual([]);
  await dismissToasts(page);
  await page.screenshot({ path: resolve(shotsDir(), `phone-nested-editor-${device}.png`) });
  await nested.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(nested).toBeHidden();
  await expect(dialog.getByTestId('participant-row')).toHaveCount(1);
  await expect(dialog.getByTestId('participant-row')).toContainText(`Zz phone ${device}`);
  await dialog.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('create a new species from a picker and Save both', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await walkPhone(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('create a new species from a picker and Save both', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await walkPhone(page, 'iphone14');
  });
});
