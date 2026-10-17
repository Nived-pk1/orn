/**
 * A conflict end to end (step 6.1a part 4; ADR-040), PRODUCTION build, every engine: edit 1 is saved; the editor is opened again on the
 * same record and edit 2 is made on the same field, then Close (the draft is kept); the top bar's Undo reverts edit 1; opening the draft
 * and pressing Save shows the conflict view; a choice is made and saved; the result is checked.
 */
import { resolve } from 'node:path';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { canonicalInput, draftStatus, editorDialog, openDemo, openNamesEditor, record, shotsDir, showSpecies } from './editor-kit';

test.describe('a conflict', () => {
  test('save edit 1, draft edit 2, undo edit 1 from the top bar, open the draft, Save: the conflict view; choose, save; the result', async ({ page }) => {
    test.setTimeout(240_000);
    const seen = await watch(page);
    await openDemo(page);
    await showSpecies(page, 'spc_ethanol', 'ethanol');

    // edit 1, saved
    await openNamesEditor(page, 'Ethanol');
    await canonicalInput(page).fill('Ethanol one');
    await editorDialog(page, 'Ethanol').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editorDialog(page, 'Ethanol')).toBeHidden();
    await expect(record(page).getByRole('heading', { level: 3, name: 'Ethanol one' })).toBeVisible();

    // edit 2 on the same field, closed with the draft kept
    await openNamesEditor(page, 'Ethanol one');
    await canonicalInput(page).fill('Ethanol two');
    await expect(draftStatus(page)).toContainText(/^(Saving draft\.\.\.|Draft saved )/);
    await editorDialog(page, 'Ethanol one').getByRole('button', { name: 'Close (keeps the draft)' }).click();
    await expect(editorDialog(page, 'Ethanol one')).toBeHidden();
    await expect(page.getByText('Draft kept')).toBeVisible();

    // the top bar's Undo reverts edit 1 (the store's history, not the draft's)
    await page.getByRole('button', { name: 'Undo Edit names of Ethanol' }).click();
    await expect(record(page).getByRole('heading', { level: 3, name: 'Ethanol', exact: true })).toBeVisible();

    // the draft is opened again and saved: the record changed since it was started
    await openNamesEditor(page, 'Ethanol one');
    await expect(canonicalInput(page)).toHaveValue('Ethanol two');
    await editorDialog(page, 'Ethanol one').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'This record was changed since you started' })).toBeVisible();
    const table = page.getByRole('table');
    const row = table.getByRole('row').filter({ hasText: 'names.canonical' });
    await expect(row).toContainText('Ethanol one'); // when you started
    await expect(row).toContainText('Ethanol two'); // your draft
    const save = page.getByRole('button', { name: 'Save with these choices' });
    await expect(save).toHaveAttribute('aria-disabled', 'true'); // no default choice
    expect(await axeProblems(page, 10)).toEqual([]); // a modal dialog leaves the page inert: fewer rules apply
    await page.screenshot({ path: resolve(shotsDir(), 'editor-conflict-1280x800.png') });
    await row.getByRole('button', { name: 'Keep mine' }).click();
    await expect(save).not.toHaveAttribute('aria-disabled', 'true');
    await save.click();

    // the result
    await expect(editorDialog(page, 'Ethanol one')).toBeHidden();
    await expect(record(page).getByRole('heading', { level: 3, name: 'Ethanol two' })).toBeVisible();
    await expectClean(seen);
  });
});
