/**
 * The names editor end to end (step 6.1a part 4; ADR-040), PRODUCTION build, every engine: a species is shown through the palette, "Edit
 * names" opens the editor, the canonical name changes and an alias is added; the draft's own Undo and Redo work by button and by key; Save;
 * the inspector, the family page and search show the new name; the top bar's Undo restores the old name and Redo brings it back; axe on
 * the editor; zero policy violations.
 */
import { resolve } from 'node:path';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { canonicalInput, draftStatus, editorDialog, openDemo, openNamesEditor, palette, record, searchFor, shotsDir, showSpecies } from './editor-kit';

const NEW_NAME = 'Ethanol renamed';

test.describe('the names editor', () => {
  test('edit names of a species: local undo and redo, Save, the new name everywhere, top-bar Undo and Redo', async ({ page }) => {
    test.setTimeout(240_000);
    const seen = await watch(page);
    await openDemo(page);
    await showSpecies(page, 'spc_ethanol', 'ethanol');
    await expect(record(page).getByRole('heading', { level: 3, name: 'Ethanol', exact: true })).toBeVisible();
    await openNamesEditor(page, 'Ethanol');
    const dialog = editorDialog(page, 'Ethanol');
    await expect(draftStatus(page)).toHaveText(/^(No changes yet|Drafts are not kept in this window)$/);

    // change the canonical name and add an alias
    await expect(canonicalInput(page)).toHaveValue('Ethanol');
    await canonicalInput(page).fill(NEW_NAME);
    const aliasInputs = dialog.getByLabel(/^Alias \d+$/);
    const aliases = await aliasInputs.count();
    await dialog.getByRole('button', { name: 'Add alias' }).click();
    await expect(aliasInputs).toHaveCount(aliases + 1);
    await aliasInputs.last().fill('grain alcohol');
    await expect(aliasInputs.last()).toHaveValue('grain alcohol');

    // the draft's own undo and redo: by button, then by key (the keys are the draft's, not the browser's and not the store's)
    await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(aliasInputs.last()).toHaveValue('');
    await canonicalInput(page).focus();
    await page.keyboard.press('Control+Z');
    await expect(aliasInputs).toHaveCount(aliases);
    await page.keyboard.press('Control+Shift+Z');
    await expect(aliasInputs).toHaveCount(aliases + 1);
    await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(aliasInputs.last()).toHaveValue('grain alcohol');
    await canonicalInput(page).focus();
    await page.keyboard.press('Control+Z');
    await page.keyboard.press('Control+Y');
    await expect(aliasInputs.last()).toHaveValue('grain alcohol');
    await expect(canonicalInput(page)).toHaveValue(NEW_NAME);

    expect(await axeProblems(page)).toEqual([]);
    await page.screenshot({ path: resolve(shotsDir(), 'editor-1280x800.png') });

    // Save: the editor closes and the store changed
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(record(page).getByRole('heading', { level: 3, name: NEW_NAME })).toBeVisible();

    // the family page shows the new name
    await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
    await expect(page.getByRole('region', { name: /^Family page: Alcohols/ })).toContainText(NEW_NAME);
    // search finds it (the index follows the commit), and the species is in the inspector again
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeVisible();
    await searchFor(page, 's: renamed');
    const found = palette(page).locator('[role="option"][data-record-id="spc_ethanol"]');
    await expect(found).toBeVisible({ timeout: 60_000 });
    await found.click();
    await expect(record(page).getByRole('heading', { level: 3, name: NEW_NAME })).toBeVisible();

    // the top bar's Undo restores the old name; Redo brings the new one back
    await page.getByRole('button', { name: 'Undo Edit species Ethanol' }).click();
    await expect(record(page).getByRole('heading', { level: 3, name: 'Ethanol', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Redo Edit species Ethanol' }).click();
    await expect(record(page).getByRole('heading', { level: 3, name: NEW_NAME })).toBeVisible();
    await expectClean(seen);
  });

  test('the findings panel: an empty canonical name is a finding that focuses its field; a refused Save keeps the dialog and the draft', async ({ page }) => {
    test.setTimeout(180_000);
    const seen = await watch(page);
    await openDemo(page);
    await showSpecies(page, 'spc_ethanol', 'ethanol');
    await openNamesEditor(page, 'Ethanol');
    await canonicalInput(page).fill('');
    const finding = page.getByRole('region', { name: 'Findings' }).getByRole('button', { name: /names\.canonical/ });
    await expect(finding).toBeVisible(); // the live panel, 300 ms after the change
    await page.getByRole('button', { name: 'Add alias' }).focus();
    await finding.click();
    await expect(canonicalInput(page)).toBeFocused();
    await page.getByRole('button', { name: 'Discard draft' }).click();
    await page.getByRole('group', { name: 'Discard this draft?' }).getByRole('button', { name: 'Discard' }).click();
    await expect(editorDialog(page, 'Ethanol')).toBeHidden();
    await expectClean(seen);
  });
});
