/**
 * Delete and merge (step 6.8a; ADR-040 addendum "Delete and merge"), PRODUCTION build, every engine, Studio:
 *  (1) a demo species with the impact dialog ("Removed from"), Delete, then Undo brings it back (one history step);
 *  (2) a species a reaction uses: "Blocks the delete" with Open, Delete unavailable;
 *  (3) a map family removed from the class editor and brought back by Undo;
 *  (4) a duplicate species merged from the duplicate dialog with a scalar choice ("Take ..."), one Undo;
 *  (5) a merge of two DIFFERENT structures is refused in words and Merge is unavailable;
 *  (6) the Pixel 7 and iPhone 14: Delete with the impact dialog, then Undo from More.
 * Axe on both dialogs; zero policy violations. Screenshots: screenshots/{delete-impact,delete-blocked,merge-dialog,merge-refused}-1280x800.png
 * and phone-delete-impact-<pixel7|iphone14>.png.
 */
import { resolve } from 'node:path';
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';
import { editorDialog, openDemo, openNamesEditor, palette, record, searchFor, shotsDir, showRecord } from './editor-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const newSpeciesDialog = (page: Page) => page.getByRole('dialog', { name: 'New species' });
const structureField = (page: Page) => page.getByLabel('SMILES, CXSMILES or molfile');
const deleteDialog = (page: Page, name: string) => page.getByRole('dialog', { name: `Delete ${name}?` });

async function dismissToasts(page: Page): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  if ((await page.locator('dialog[open]').count()) > 0) {
    await expect.poll(() => toasts.count(), { timeout: 20_000 }).toBe(0).catch(() => undefined);
    return;
  }
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

async function imagesSettled(scope: Locator): Promise<void> {
  await expect
    .poll(() => scope.locator('img').evaluateAll((images) => (images as HTMLImageElement[]).every((image) => image.complete && image.naturalWidth > 0)), { timeout: 60_000 })
    .toBe(true);
}

/** Saves a new species named Ethanol with the given structure (and notes) and waits for the duplicate dialog. */
async function saveDuplicateEthanol(page: Page, smiles: string, notes?: string): Promise<Locator> {
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /Workbench/ }).click();
  await expect(page.getByRole('region', { name: 'Workbench' })).toBeVisible();
  await page.getByRole('button', { name: 'New species' }).click();
  const dialog = newSpeciesDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Canonical name (required)').fill('Ethanol');
  await structureField(page).fill(smiles);
  await expect(dialog.getByRole('img', { name: 'Drawing of the entered structure' })).toBeVisible({ timeout: 60_000 });
  if (notes !== undefined) {
    const shared = dialog.getByRole('button', { name: /Notes, tags and citations/ });
    if ((await shared.getAttribute('aria-expanded')) === 'false') await shared.click();
    await dialog.getByLabel('Notes', { exact: true }).fill(notes);
  }
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const dup = page.getByRole('dialog', { name: 'This may already exist' });
  await expect(dup).toBeVisible({ timeout: 60_000 });
  return dup;
}

test.describe('delete and merge (desktop)', () => {
  test('a demo species: the impact dialog, Delete, one Undo brings it back', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await showRecord(page, 's', 'Palmitic acid', 'spc_palmitic-acid');
    await record(page).getByRole('button', { name: 'Delete...', exact: true }).click();
    const dialog = deleteDialog(page, 'Palmitic acid');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('list', { name: 'Removed from' })).toBeVisible();
    await expect(dialog.getByRole('list', { name: 'Blocks the delete' })).toHaveCount(0);
    expect(await axeProblems(page, 10)).toEqual([]); // a modal dialog leaves the page inert: fewer rules apply
    await imagesSettled(dialog);
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'delete-impact-1280x800.png') });
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[role="article"][data-record-id="spc_palmitic-acid"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo delete Palmitic acid' }).click();
    await showRecord(page, 's', 'Palmitic acid', 'spc_palmitic-acid');
    await expectClean(seen);
  });

  test('a species a reaction uses: "Blocks the delete" with Open, and Delete is unavailable', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await showRecord(page, 's', 'Ethanol', 'spc_ethanol');
    await record(page).getByRole('button', { name: 'Delete...', exact: true }).click();
    const dialog = deleteDialog(page, 'Ethanol');
    await expect(dialog).toBeVisible();
    const blocks = dialog.getByRole('list', { name: 'Blocks the delete' });
    await expect(blocks).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'delete-blocked-1280x800.png') });
    const open = blocks.getByRole('button', { name: /^Open / }).first();
    await expect(open).toBeVisible();
    await open.click();
    await expect(record(page)).not.toHaveAttribute('data-record-id', 'spc_ethanol');
    await expectClean(seen);
  });

  test('a map family is removed from the class editor and Undo brings it back', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await showRecord(page, 'c', 'Alcohols', 'cls_alcohols');
    await openNamesEditor(page, 'Alcohols');
    const editor = editorDialog(page, 'Alcohols');
    await expect(editor.getByText('This class is a map family.')).toBeVisible();
    await editor.getByRole('button', { name: 'Remove from the map', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /^Delete .*\?$/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(editor.getByText('This class is not a map family.')).toBeVisible();
    // the editor is modal: close it (nothing was changed in the draft), Undo from the top bar, open the editor again
    await page.keyboard.press('Escape');
    await expect(editor).toBeHidden();
    await page.getByRole('button', { name: /^Undo delete / }).click();
    await openNamesEditor(page, 'Alcohols');
    await expect(editorDialog(page, 'Alcohols').getByText('This class is a map family.')).toBeVisible();
    await expectClean(seen);
  });

  test('a duplicate species is merged from the duplicate dialog with a scalar choice; one Undo', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    const dup = await saveDuplicateEthanol(page, 'CCO', 'A note typed on the duplicate.');
    await dup.getByRole('button', { name: 'Merge', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Merge into Ethanol' });
    await expect(dialog).toBeVisible();
    const notes = dialog.getByRole('group', { name: 'Notes' });
    await expect(notes).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByText('Includes your unsaved changes')).toBeVisible();
    await expect(dialog.getByRole('list', { name: 'Records that will change' })).toBeVisible();
    await notes.getByRole('radio', { name: /^Take / }).check();
    expect(await axeProblems(page, 10)).toEqual([]); // a modal dialog leaves the page inert: fewer rules apply
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'merge-dialog-1280x800.png') });
    await dialog.getByRole('button', { name: 'Merge', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(newSpeciesDialog(page)).toBeHidden();
    await expect(record(page)).toHaveAttribute('data-record-id', 'spc_ethanol');
    await page.getByRole('button', { name: 'Undo merge Ethanol into Ethanol' }).click();
    await expect(page.getByRole('button', { name: 'Undo merge Ethanol into Ethanol' })).toHaveCount(0);
    await expectClean(seen);
  });

  test('two different structures are not merged: the refusal is in words and Merge is unavailable', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    const dup = await saveDuplicateEthanol(page, 'CCC');
    await dup.getByRole('button', { name: 'Merge', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Merge into Ethanol' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status').filter({ hasText: 'These structures are different compounds' })).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole('button', { name: 'Merge', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'merge-refused-1280x800.png') });
    await expectClean(seen);
  });
});

async function walkPhone(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  const find = async (): Promise<void> => {
    await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Search' }).tap();
    await expect(palette(page)).toBeVisible();
    await searchFor(page, 's: palmitic acid');
    await palette(page).locator('[role="option"][data-record-id="spc_palmitic-acid"]').tap();
  };
  await find();
  await page.getByRole('button', { name: 'Show the whole record' }).tap();
  await page.getByRole('button', { name: 'Delete...', exact: true }).tap();
  const dialog = deleteDialog(page, 'Palmitic acid');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box?.width ?? 0, 'the dialog fits the screen').toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(await axeProblems(page, 10)).toEqual([]); // a modal dialog leaves the page inert: fewer rules apply
  await dismissToasts(page);
  await page.screenshot({ path: resolve(shotsDir(), `phone-delete-impact-${device}.png`) });
  await dialog.getByRole('button', { name: 'Delete', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'More' }).tap();
  const more = page.getByRole('dialog', { name: 'More' });
  await more.getByRole('button', { name: 'Undo delete Palmitic acid' }).tap();
  await expect(more.getByRole('button', { name: 'Undo delete Palmitic acid' })).toHaveCount(0);
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('Delete with the impact dialog, then Undo from More', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await walkPhone(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('Delete with the impact dialog, then Undo from More', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await walkPhone(page, 'iphone14');
  });
});
