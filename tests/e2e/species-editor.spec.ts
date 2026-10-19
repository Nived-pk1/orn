/**
 * The species editor end to end (step 6.2a part 4; ADR-040 addendum), PRODUCTION build, every engine:
 *  (1) create "Propan-1-ol" from scratch: name, SMILES CCCO, the drawing appears, "Use derived formula", the suggestion "Alcohols" added,
 *      Save; it is in search, the inspector and the Alcohols family (its Members); Undo removes it;
 *  (2) ADV-036: a species with SMILES "C1CC" can be saved, with a CHEM-001 warning shown;
 *  (3) editing ethanol's structure text shows the derived values beside the entered ones.
 * Axe on the editor; zero policy violations. Screenshots: screenshots/{workbench,species-editor,species-editor-invalid-smiles}-1280x800.png.
 */
import { resolve } from 'node:path';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { openDemo, openNamesEditor, palette, pane, record, searchFor, shotsDir, showSpecies } from './editor-kit';
import type { Page } from '@playwright/test';

const newSpeciesDialog = (page: Page) => page.getByRole('dialog', { name: 'New species' });
const structureField = (page: Page) => page.getByLabel('SMILES, CXSMILES or molfile');
const factsTable = (page: Page) => page.getByRole('table', { name: 'Entered and derived values' });

async function startNewSpecies(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /Workbench/ }).click();
  await expect(page.getByRole('region', { name: 'Workbench' })).toBeVisible();
  await page.getByRole('button', { name: 'New species' }).click();
  await expect(newSpeciesDialog(page)).toBeVisible();
}

test.describe('the species editor', () => {
  test('create Propan-1-ol from scratch: drawing, derived formula, the Alcohols suggestion, Save, search, inspector, the family, Undo', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /Workbench/ }).click();
    await expect(page.getByRole('button', { name: 'New class', description: 'Arrives in step 6.2b' })).toBeVisible();
    await page.screenshot({ path: resolve(shotsDir(), 'workbench-1280x800.png') });
    await page.getByRole('button', { name: 'New species' }).click();
    const dialog = newSpeciesDialog(page);
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Canonical name (required)').fill('Propan-1-ol');
    await structureField(page).fill('CCCO');
    // the drawing appears beside the entered values, and the derived values are shown, not written
    await expect(dialog.getByRole('img', { name: 'Drawing of the entered structure' })).toBeVisible({ timeout: 60_000 });
    const formulaRow = factsTable(page).getByRole('row', { name: /^Formula/ });
    await expect(formulaRow).toContainText('not entered');
    await expect(formulaRow).toContainText('C3H8O');
    await expect(dialog.getByLabel('Formula (optional)')).toHaveValue('');
    await formulaRow.getByRole('button', { name: 'Use derived formula' }).click();
    await expect(dialog.getByLabel('Formula (optional)')).toHaveValue('C3H8O');
    // the suggestion from the structure: shown as a chip, never added by itself
    const chips = dialog.getByRole('list', { name: 'Suggested classes' });
    await expect(chips).toContainText('Alcohols (matches its pattern)', { timeout: 60_000 });
    await expect(dialog.getByRole('list', { name: 'Listed classes' })).not.toContainText('Alcohols');
    await chips.getByRole('button', { name: 'Add Alcohols' }).click();
    await expect(dialog.getByRole('list', { name: 'Listed classes' })).toContainText('Alcohols');
    await expect(dialog.getByRole('list', { name: 'Suggested classes' })).toHaveCount(0);
    await expect(dialog.getByText('Other records are checked when you save.')).toBeVisible();

    expect(await axeProblems(page)).toEqual([]);
    await factsTable(page).scrollIntoViewIfNeeded(); // the screenshot shows the drawing and the derived values beside the entered ones
    await page.screenshot({ path: resolve(shotsDir(), 'species-editor-1280x800.png') });

    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();

    // in search, and in the inspector
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeVisible();
    await searchFor(page, 's: propan-1-ol');
    const hit = palette(page).getByRole('option', { name: /Propan-1-ol/ });
    await expect(hit).toBeVisible({ timeout: 60_000 });
    await hit.click();
    await expect(record(page).getByRole('heading', { level: 3, name: 'Propan-1-ol' })).toBeVisible();

    // in the Alcohols family: its members
    await page.keyboard.press('Control+K');
    await searchFor(page, 'c: alcohols');
    await palette(page).getByRole('option', { name: /^Alcohols/ }).first().click();
    await expect(record(page).getByRole('heading', { level: 3, name: 'Alcohols', exact: true })).toBeVisible();
    await record(page).getByRole('button', { name: /^.? ?Level 3/ }).click();
    await expect(record(page)).toContainText('Propan-1-ol');

    // Undo removes it (one global entry)
    await page.getByRole('button', { name: 'Undo Create species Propan-1-ol' }).click();
    await expect(record(page)).not.toContainText('Propan-1-ol');
    await page.keyboard.press('Control+K');
    await searchFor(page, 's: propan-1-ol');
    await expect(palette(page).getByRole('option', { name: /^Propan-1-ol/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expectClean(seen);
  });

  test('ADV-036: a species with SMILES C1CC saves, with a CHEM-001 warning shown', async ({ page }) => {
    test.setTimeout(240_000);
    const seen = await watch(page);
    await openDemo(page);
    await startNewSpecies(page);
    const dialog = newSpeciesDialog(page);
    await dialog.getByLabel('Canonical name (required)').fill('Broken ring');
    await structureField(page).fill('C1CC');
    await expect(dialog.getByRole('alert').filter({ hasText: 'The chemistry engine could not read this structure' })).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole('button', { name: /The structure cannot be read/ })).toBeVisible({ timeout: 60_000 });
    await structureField(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'species-editor-invalid-smiles-1280x800.png') });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.keyboard.press('Control+K');
    await searchFor(page, 's: broken ring');
    await palette(page).getByRole('option', { name: /Broken ring/ }).click();
    await expect(record(page).getByRole('heading', { level: 3, name: 'Broken ring' })).toBeVisible();
    await expect(record(page)).toContainText(/warning/i, { timeout: 60_000 });
    await expectClean(seen);
  });

  test('editing ethanol: the structure text shows the derived values beside the entered ones', async ({ page }) => {
    test.setTimeout(240_000);
    const seen = await watch(page);
    await openDemo(page);
    await showSpecies(page, 'spc_ethanol', 'ethanol');
    await openNamesEditor(page, 'Ethanol');
    const dialog = page.getByRole('dialog', { name: /^Edit Ethanol/ });
    await expect(structureField(page)).toHaveValue('CCO');
    await expect(dialog.getByRole('img', { name: 'Drawing of the entered structure' })).toBeVisible({ timeout: 60_000 });
    await expect(factsTable(page).getByRole('row', { name: /^Formula/ })).toContainText('C2H5OH'); // entered
    await expect(factsTable(page).getByRole('row', { name: /^Formula/ })).toContainText('C2H6O'); // derived
    await structureField(page).fill('CCCO');
    await expect(factsTable(page).getByRole('row', { name: /^Formula/ })).toContainText('C3H8O', { timeout: 60_000 });
    await expect(factsTable(page).getByRole('row', { name: /^Formula/ })).toContainText('C2H5OH'); // the entered value is still there
    await dialog.getByRole('button', { name: 'Discard draft' }).click();
    await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(pane(page)).toBeVisible();
    await expectClean(seen);
  });
});
