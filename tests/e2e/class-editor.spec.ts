/**
 * The class editor end to end (step 6.2b part 2; ADR-040 addendum, decisions D1, D2, D4, D5), PRODUCTION build, every engine:
 *  (1) New class "Diols" with the parent Alcohols and the generic formula R-CH(OH)-CH2OH, Save; it is in search and the inspector shows its
 *      parent; Undo removes it;
 *  (2) Alcohols cannot take Diols as a parent: the picker shows the reason and no button;
 *  (3) a membership SMARTS the chem worker cannot read is said in its words; a generic R-labelled CXSMILES is drawn (no formula derived).
 * (The suggestion flow, which sets a membership SMARTS on Alcohols through this editor first, is in species-editor.spec.ts.)
 * Axe on the editor; zero policy violations. Screenshots: screenshots/{class-editor,class-parent-refused}-1280x800.png.
 */
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { openDemo, openNamesEditor, palette, record, searchFor, shotsDir, showRecord } from './editor-kit';

const newClassDialog = (page: Page) => page.getByRole('dialog', { name: 'New class' });

async function startNewClass(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /Workbench/ }).click();
  await expect(page.getByRole('region', { name: 'Workbench' })).toBeVisible();
  await page.getByRole('button', { name: 'New class', exact: true }).click();
  await expect(newClassDialog(page)).toBeVisible();
}

/** Fills the dialog of a new class "Diols" (compound class, parent Alcohols, generic formula) WITHOUT saving it. */
async function fillDiols(page: Page): Promise<void> {
  const dialog = newClassDialog(page);
  await dialog.getByLabel('Canonical name (required)').fill('Diols');
  await dialog.getByLabel('Kind of class').selectOption('compound_class');
  await dialog.getByLabel(/^Generic formula/).fill('R-CH(OH)-CH2OH');
  await dialog.getByLabel('Find a parent class by name').fill('alcohols');
  await dialog.getByRole('list', { name: 'Classes found' }).getByRole('button', { name: 'Add Alcohols', exact: true }).click();
  await expect(dialog.getByRole('list', { name: 'Parent classes' })).toContainText('Alcohols');
}

test.describe('the class editor', () => {
  test('New class "Diols": blank draft refused until named and kinded, parent Alcohols, generic formula, Save, search, inspector shows the parent, Undo', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await startNewClass(page);
    const dialog = newClassDialog(page);

    // a blank draft: no kind is invented; Save is refused with the schema's words
    await expect(dialog.getByLabel('Kind of class')).toHaveValue('');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Save was refused' })).toBeVisible();

    await fillDiols(page);
    // the preview of the formula uses the formula typography; the input stays plain text
    await expect(dialog.getByLabel(/^Generic formula/)).toHaveValue('R-CH(OH)-CH2OH');
    await expect(dialog.locator('sub').filter({ hasText: '2' }).first()).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    await dialog.getByRole('heading', { name: 'Parents' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'class-editor-1280x800.png') });

    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();

    // in search, and the inspector shows its parent
    await showRecord(page, 'c', 'diols');
    await expect(record(page).getByRole('heading', { level: 3, name: 'Diols' })).toBeVisible();
    await expect(record(page)).toContainText('Parents');
    await expect(record(page)).toContainText('Alcohols');

    // Undo removes it (one global entry)
    await page.getByRole('button', { name: 'Undo Create class Diols' }).click();
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeVisible();
    await searchFor(page, 'c: diols');
    await expect(palette(page).getByRole('option', { name: /^Diols/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expectClean(seen);
  });

  test('Alcohols cannot take Diols as a parent: the reason is shown and there is no Add button', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await startNewClass(page);
    await fillDiols(page);
    await newClassDialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(newClassDialog(page)).toBeHidden();

    await showRecord(page, 'c', 'alcohols', 'cls_alcohols');
    await openNamesEditor(page, 'Alcohols');
    const dialog = page.getByRole('dialog', { name: 'Edit Alcohols' });
    await dialog.getByLabel('Find a parent class by name').fill('diols');
    const found = dialog.getByRole('list', { name: 'Classes found' });
    await expect(found).toContainText('Diols');
    await expect(found).toContainText('Cannot be chosen: Diols is already below this class, so it cannot be its parent: that would make a cycle.');
    await expect(found.getByRole('button', { name: 'Add Diols' })).toHaveCount(0);
    await expect(dialog.getByRole('list', { name: 'Parent classes' })).not.toContainText('Diols');
    await found.scrollIntoViewIfNeeded(); // the screenshot shows the reason beside the refused class
    await page.screenshot({ path: resolve(shotsDir(), 'class-parent-refused-1280x800.png') });
    // the class itself is refused too
    await dialog.getByLabel('Find a parent class by name').fill('alcohols');
    await expect(found).toContainText('A class cannot be its own parent.');
    await dialog.getByRole('button', { name: 'Discard draft' }).click();
    await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectClean(seen);
  });

  test('a SMARTS the engine cannot read is said in its words; a generic R-labelled CXSMILES is drawn with no formula derived', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await startNewClass(page);
    const dialog = newClassDialog(page);
    await dialog.getByLabel('Canonical name (required)').fill('Diols');
    await dialog.getByLabel('Membership SMARTS (optional)').fill('[CX4][OX2H');
    await expect(dialog.getByText(/could not read this pattern: .*kept as typed/)).toBeVisible({ timeout: 60_000 });
    await dialog.getByLabel('Membership SMARTS (optional)').fill('[CX4][OX2H]');
    await expect(dialog.getByText('The chemistry engine can read this pattern.')).toBeVisible({ timeout: 60_000 });
    await dialog.getByLabel('R-labelled CXSMILES or molfile').fill('[*]C(O)CO |$R;;;;$|');
    await expect(dialog.getByRole('img', { name: 'Drawing of the generic structure' })).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByText('No formula is derived from a generic structure.')).toBeVisible();
    await expect(dialog.getByRole('table', { name: 'Entered and derived values' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Discard draft' }).click();
    await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectClean(seen);
  });

  test('the duplicate check: a second "Alcohols" class shows the dialog; Open the existing; then Keep both saves', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await startNewClass(page);
    const dialog = newClassDialog(page);
    await dialog.getByLabel('Canonical name (required)').fill('Alcohols');
    await dialog.getByLabel('Kind of class').selectOption('compound_class');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();

    const dup = page.getByRole('dialog', { name: 'This may already exist' });
    await expect(dup).toBeVisible({ timeout: 60_000 });
    await expect(dup.getByText('Alcohols', { exact: true })).toBeVisible();
    await expect(dup.getByText('Matched by the same name.')).toBeVisible();
    // one match: Merge is offered (6.8a)
    await expect(dup.getByRole('button', { name: 'Merge', exact: true })).not.toHaveAttribute('aria-disabled', 'true');

    // Open the existing: the draft stays a draft and the demo class is shown
    await dup.getByRole('button', { name: 'Open Alcohols' }).click();
    await expect(dup).toBeHidden();
    await expect(newClassDialog(page)).toBeHidden();
    await expect(record(page)).toHaveAttribute('data-record-id', 'cls_alcohols');
    await expect(page.getByRole('list', { name: 'Drafts' })).toContainText('Alcohols');

    // continue the draft, Save again, Keep both
    await page.getByRole('button', { name: 'Continue Alcohols' }).click();
    await expect(newClassDialog(page)).toBeVisible();
    await newClassDialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dup).toBeVisible({ timeout: 60_000 });
    await dup.getByRole('button', { name: 'Keep both' }).click();
    await expect(dup).toBeHidden();
    await expect(newClassDialog(page)).toBeHidden();

    // two classes are named Alcohols now
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeVisible();
    await searchFor(page, 'c: alcohols');
    await expect(palette(page).getByRole('option', { name: /^Alcohols/ })).toHaveCount(2, { timeout: 60_000 });
    await page.keyboard.press('Escape');
    await expectClean(seen);
  });
});
