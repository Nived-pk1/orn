/**
 * What a student sees in the STUDY edition (step 8.3), split out of study-edition.spec.ts (which is at the 400-line limit): own data with the
 * notice and Undo, the quiet saved line, the review dot, no "exclusive", no status bar, no Dataset, Map in the rail. Screenshot
 * study-map-alcohols-selected-1280x800.png (git-ignored) is made here again by the suite.
 */
import { resolve } from 'node:path';
import { expect, test } from './fixtures';
import { chaptersFirstThenNavigator } from './chapters-kit';
import { selectionLine } from './map-toolbar-kit';
import { expectClean, watch } from './kit';
import { shotsDir } from './editor-kit';
import { importOwnData, openStudy, STUDY } from './study-kit';

test.use({ baseURL: STUDY });

test.describe('what a student sees (step 8.3)', () => {
  test('own data: the notice with Undo, the quiet saved line, the review dot, no "exclusive", no status bar, no Dataset, Map in the rail', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page, STUDY);
    await openStudy(page);
    await expect(page.getByRole('contentinfo')).toHaveCount(0);
    await expect(page.getByText(/Findings: E|Saved \(revision|Workers:|Storage: not persistent|Layout note/)).toHaveCount(0);
    await importOwnData(page);
    await expect(page.getByRole('button', { name: 'Undo import' })).toBeVisible(); // the notice of the visitor's own import
    await expect(page.getByText('Your data is saved in this browser', { exact: true })).toBeVisible();
    await expect(page.getByText(/Findings: E|Saved \(revision|Workers:/)).toHaveCount(0);
    const modes = page.getByRole('navigation', { name: 'Modes' });
    await expect(modes.getByRole('button', { name: 'Map' })).toBeVisible();
    await expect(modes.getByRole('button', { name: 'Dataset' })).toHaveCount(0);
    await expect(modes.getByRole('button', { name: 'Navigator' })).toHaveCount(0);
    // the storage warning appears after an own import where the browser did not grant persistent storage, in the student wording
    const warning = page.getByText('This browser may clear your imported data when space is short. Export a backup to keep it.');
    if ((await warning.count()) > 0) await expect(page.getByRole('button', { name: 'Export a backup' })).toBeVisible();
    await chaptersFirstThenNavigator(page);
    await expect(page.getByRole('button', { name: /Unanchored reactions/ })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: /^Exam$/ })).toBeVisible();
    await page.locator('svg [data-node-id="cls_alcohols"]').click();
    await expect(selectionLine(page)).toHaveText('Selected: Alcohols.');
    await expect(page.locator('[data-map-selected]')).toHaveText('Selected: Alcohols'); // the label inside the map (step 8.3b, B2.2)
    await page.waitForTimeout(900);
    await page.screenshot({ path: resolve(shotsDir(), 'study-map-alcohols-selected-1280x800.png') });
    await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
    const family = page.getByRole('region', { name: 'Family page: Alcohols' });
    await expect(family).toBeVisible();
    await expect(family.locator('[data-review-mark="dot"]').first()).toBeVisible();
    await expect(family.locator('[data-review-mark="pill"]')).toHaveCount(0);
    await expect(family.getByText('exclusive', { exact: true })).toHaveCount(0);
    await expectClean(seen);
  });
});

