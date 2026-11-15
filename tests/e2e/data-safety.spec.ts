/**
 * The owner's data is not lost by accident (step 8.4s), Studio PRODUCTION build, every engine:
 *  S1 (audit DA-02): the demo is imported, ONE record is edited, File > Undo import asks first: "You made 1 change after this import. Undo
 *     import throws it away too." with Cancel focused; Cancel keeps the edit; "Undo import anyway" undoes it, and after that Undo import is
 *     unavailable (with its reason) until the next import.
 *  S4 (audit DA-04): the status line says "No backup yet"; after an Everything export it says "Backed up just now, no changes since".
 * Screenshots: screenshots/8.4s/ (git-ignored).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, watch } from './kit';
import { canonicalInput, editorDialog, openDemo, openNamesEditor, record, showSpecies } from './editor-kit';

const SHOTS = resolve(process.cwd(), 'screenshots', '8.4s');
const shot = (name: string): string => {
  mkdirSync(SHOTS, { recursive: true });
  return resolve(SHOTS, name);
};
const fileMenu = async (page: Page) => page.getByRole('button', { name: 'File', exact: true }).click();
const question = (page: Page) => page.getByRole('dialog', { name: 'Undo import' });

test('S1: Undo import after a later edit asks first; Cancel keeps the edit; "anyway" undoes it and the next Undo import is unavailable', async ({ page }) => {
  test.setTimeout(240_000);
  const seen = await watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDemo(page);
  await showSpecies(page, 'spc_ethanol', 'ethanol');
  await openNamesEditor(page, 'Ethanol');
  await canonicalInput(page).fill('Ethanol one');
  await editorDialog(page, 'Ethanol').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(record(page).getByRole('heading', { level: 3, name: 'Ethanol one' })).toBeVisible();

  await fileMenu(page);
  await page.getByRole('menuitem', { name: /Undo import/ }).click();
  await expect(question(page).getByText('You made 1 change after this import. Undo import throws it away too.')).toBeVisible({ timeout: 90_000 });
  await expect(question(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.screenshot({ path: shot('undo-import-question-1280x800.png') });

  await question(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(question(page)).toBeHidden();
  await expect(record(page).getByRole('heading', { level: 3, name: 'Ethanol one' })).toBeVisible(); // the edit is still there

  await fileMenu(page);
  await page.getByRole('menuitem', { name: /Undo import/ }).click();
  await question(page).getByRole('button', { name: 'Undo import anyway' }).click();
  await expect(page.getByText(/Import undone: the data from before it is back\./).last()).toBeVisible({ timeout: 90_000 });

  await fileMenu(page);
  await expect(page.getByRole('menuitem', { name: /Undo import/ })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expectClean(seen);
});

test('S4: the status line says how old the last backup is, and an Everything export resets it', async ({ page }) => {
  test.setTimeout(240_000);
  const seen = await watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDemo(page);
  const status = page.getByRole('button', { name: 'Status details' });
  await expect(status).toContainText('No backup yet');
  await page.screenshot({ path: shot('backup-status-none-1280x800.png'), clip: { x: 0, y: 740, width: 1280, height: 60 } });

  await fileMenu(page);
  await page.getByRole('menuitem', { name: /Export\.\.\./ }).click();
  const dialog = page.getByRole('dialog', { name: 'Export your data' });
  await expect(dialog.getByRole('group', { name: 'What to include' })).toBeVisible();
  await page.screenshot({ path: shot('export-defaults-1280x800.png') });
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export', exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.orn\.json$/);
  await page.getByRole('dialog', { name: 'Export finished' }).getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(status).toContainText('Backed up just now, no changes since');
  await page.screenshot({ path: shot('backup-status-fresh-1280x800.png'), clip: { x: 0, y: 740, width: 1280, height: 60 } });
  await expectClean(seen);
});
