/**
 * Drafts kept and offered again, end to end (step 6.1a part 3 and 4; ADR-040), PRODUCTION build, every engine: an edit is stored by the
 * 2 s throttle (the test waits for the editor to SAY "Draft saved", never a sleep), a reload offers it in the start-up report ("1
 * unfinished draft"), Open restores the draft AND its undo steps, Discard asks first and removes it, and a plain reload with no drafts
 * shows no start-up line at all.
 */
import { resolve } from 'node:path';
import { expect, test } from './fixtures';
import { expectClean, openApp, watch } from './kit';
import { canonicalInput, draftStatus, editorDialog, openDemo, openNamesEditor, pane, record, shotsDir, showSpecies } from './editor-kit';

test.describe('drafts', () => {
  test('edit, wait for "Draft saved", reload: one draft is offered; Open restores it and its undo; Discard asks, then removes it; a plain reload shows no line', async ({ page }) => {
    test.setTimeout(240_000);
    const seen = await watch(page);
    await openDemo(page);
    await showSpecies(page, 'spc_ethanol', 'ethanol');
    await openNamesEditor(page, 'Ethanol');
    const dialog = editorDialog(page, 'Ethanol');
    await canonicalInput(page).fill('Ethanol, half edited');
    await dialog.getByRole('button', { name: 'Add alias' }).click();
    await expect(draftStatus(page)).toHaveText(/^Draft saved \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/, { timeout: 30_000 });

    // a reload: the draft is offered, the store still has the old name
    await page.reload();
    await openApp(page);
    const report = page.getByRole('region', { name: 'Start-up report' });
    await expect(report).toContainText('1 unfinished draft');
    await expect(report).not.toContainText('crash');
    await page.screenshot({ path: resolve(shotsDir(), 'drafts-startup-1280x800.png') });
    await report.getByRole('button', { name: 'Show drafts' }).click();
    const list = page.getByRole('dialog', { name: 'Drafts' });
    await expect(list.getByRole('listitem')).toContainText('Ethanol');
    await list.getByRole('button', { name: 'Open' }).click();

    // the draft AND its undo steps are back
    const reopened = editorDialog(page, 'Ethanol');
    await expect(reopened).toBeVisible();
    await expect(canonicalInput(page)).toHaveValue('Ethanol, half edited');
    await expect(reopened.getByRole('button', { name: 'Undo', exact: true })).not.toHaveAttribute('aria-disabled', 'true');
    const aliasInputs = reopened.getByLabel(/^Alias \d+$/);
    const withAlias = await aliasInputs.count();
    await reopened.getByRole('button', { name: 'Undo', exact: true }).click(); // undoes the added alias
    await expect(aliasInputs).toHaveCount(withAlias - 1);
    await reopened.getByRole('button', { name: 'Close (keeps the draft)' }).click();
    await expect(reopened).toBeHidden();

    // Discard asks first, then removes it
    await page.getByRole('region', { name: 'Start-up report' }).getByRole('button', { name: 'Show drafts' }).click();
    const again = page.getByRole('dialog', { name: 'Drafts' });
    await again.getByRole('button', { name: 'Discard' }).click();
    await expect(again).toContainText('Discard this draft? It cannot be undone.');
    await expect(again.getByRole('listitem')).toContainText('Ethanol'); // asking changed nothing
    await again.getByRole('group', { name: 'Discard this draft?' }).getByRole('button', { name: 'Discard' }).click();
    await expect(again).toContainText('No unfinished drafts.');
    await again.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByRole('region', { name: 'Start-up report' })).toHaveCount(0);
    await showSpecies(page, 'spc_ethanol', 'ethanol'); // the stored record still has its old name
    await expect(record(page).getByRole('heading', { level: 3, name: 'Ethanol', exact: true })).toBeVisible();
    await expect(pane(page)).toBeVisible();

    // WebKit's screenshot makes its inspector inject a style the page's policy reports: that is counted per document, so this document
    // (the one with the screenshot) is checked before the next reload starts a new one
    await expectClean(seen);

    // a plain reload with no drafts shows no start-up line
    await page.reload();
    await openApp(page);
    await expect(page.getByRole('region', { name: 'Start-up report' })).toHaveCount(0);
    expect(await seen.violations(), 'securitypolicyviolation events in the last document').toEqual([]);
  });
});
