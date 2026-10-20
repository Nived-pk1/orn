/**
 * Stage conditions, condition variants and fields read from text in the reaction editor (step 6.4a part 3; ADR-040 addendum D1-D5), desktop
 * 1280 x 800, PRODUCTION build, every engine:
 *  (1) the demo's ethanol + conc. H2SO4 reaction: open its variants, change the 443 K override to 453 K, Save, the card shows 453 K; Undo restores 443 K;
 *  (2) the demo's Grignard reaction: a stage's conditions open as a form (a range, a medium), the summary line follows; axe on the editor;
 *  (3) a field read from text (the v6 fixture's "Intermolecular dehydration of an alcohol", 140 °C): the editor says so, Confirm removes RXN-015.
 * Zero policy violations. Screenshots: screenshots/reaction-editor-{conditions,variants,parsed-field}-1280x800.png.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, chooseV6, expectClean, expectPreview, importDialog, openApp, watch } from './kit';
import { editorDialog, openDemo, openNamesEditor, shotsDir, showRecord } from './editor-kit';

const ETHANOL = 'rxn_ethanol-conc-h2so4';
const NAME = 'Ethanol + conc. H₂SO₄';
const cardOf = (page: Page, title: RegExp): Locator => page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: title }) });

test.describe('stage conditions, variants and parsed fields', () => {
  test("the demo's ethanol + conc. H2SO4 reaction: the 443 K override becomes 453 K, Save, the card shows it; Undo restores 443 K", async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
    await expect(page.getByRole('region', { name: /^Family page/ })).toBeVisible();
    await page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' }).click();
    const card = cardOf(page, /^Ethanol \+ conc\. H/).first(); // the reaction is on the page twice (two groups)
    await expect(card).toBeVisible();
    await expect(card).toContainText('443 K');
    await expect(card).not.toContainText('453 K');

    await showRecord(page, 'r', NAME, ETHANOL);
    await openNamesEditor(page, NAME);
    const dialog = editorDialog(page, NAME);
    await expect(dialog.getByTestId('variant-summary')).toHaveText(['1. 413 K, excess ethanol: stage 1 temperature 413 K', '2. 443 K, excess acid: stage 1 temperature 443 K']);
    // a variant an outcome names cannot be removed, in words
    await expect(dialog.getByRole('button', { name: 'Remove variant 2' })).toHaveAttribute('aria-disabled', 'true');
    await expect(dialog.getByText("Outcome 2 holds only under '443 K, excess acid'; change the outcome first (step 6.4b).").first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Edit variant 2' }).click();
    const override = dialog.getByLabel('Temperature value of variant 2');
    await expect(override).toHaveValue('443');
    await expect(dialog.getByLabel('Medium of variant 2')).toHaveCount(0); // only the overriding fields
    await override.fill('453');
    await expect(dialog.getByTestId('variant-summary').nth(1)).toHaveText('2. 443 K, excess acid: stage 1 temperature 453 K');
    await dialog.getByRole('heading', { name: 'Condition variants' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'reaction-editor-variants-1280x800.png') });
    expect(await axeProblems(page)).toEqual([]);

    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toContainText('453 K', { timeout: 60_000 });
    await expect(card).not.toContainText('443 K');
    await page.getByRole('button', { name: /^Undo Edit reaction of / }).click();
    await expect(card).toContainText('443 K', { timeout: 60_000 });
    await expect(card).not.toContainText('453 K');
    await expectClean(seen);
  });

  test("the demo's Grignard reaction: a stage's conditions are a form (a range and a medium), the summary line follows; axe", async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    const name = 'CH₃MgBr + ethanal, then H₃O⁺';
    await showRecord(page, 'r', name, 'rxn_methylmgbr-ethanal');
    await openNamesEditor(page, name);
    const dialog = editorDialog(page, name);
    await expect(dialog.getByTestId('stage-conditions')).toHaveText(['Conditions: anhydrous', 'Conditions: acidic medium']);
    await dialog.getByRole('button', { name: 'Edit conditions of stage 1' }).click();
    await dialog.getByLabel('Temperature kind of stage 1').selectOption('range');
    await dialog.getByLabel('Temperature minimum of stage 1').fill('0');
    await dialog.getByLabel('Temperature maximum of stage 1').fill('5');
    await dialog.getByLabel('Temperature unit of stage 1').selectOption('C');
    await dialog.getByLabel('Atmosphere of stage 1').selectOption('nitrogen');
    await expect(dialog.getByTestId('stage-conditions').first()).toHaveText('Conditions: 0–5 °C · N2 · anhydrous');
    await dialog.getByRole('button', { name: 'Close conditions of stage 1' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'reaction-editor-conditions-1280x800.png') });
    expect(await axeProblems(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Close (keeps the draft)' }).click();
    await expectClean(seen);
  });

  test('a field read from text (the v6 fixture, 140 °C): the editor says so; Confirm removes it and RXN-015 goes away', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await chooseV6(page, { name: 'v6-demo-export.json', mimeType: 'application/json', buffer: readFileSync(resolve(process.cwd(), 'data/fixtures/legacy/v6-demo-export.json')) });
    await expectPreview(page);
    await importDialog(page).getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByRole('status', { name: 'Notifications' }).getByText(/^Imported \d+ records from v6-demo-export\.json\./)).toBeVisible({ timeout: 90_000 });
    const name = 'Intermolecular dehydration of an alcohol';
    await showRecord(page, 'r', name, 'rxn_v6-r12');
    await openNamesEditor(page, name);
    const dialog = editorDialog(page, name);
    await dialog.getByRole('button', { name: 'Edit conditions of stage 1' }).click();
    const unconfirmed = /filled in from text and need a person to confirm/;
    await expect(dialog.getByText('Read from the text: please confirm.')).toHaveCount(1);
    await expect(dialog.getByText(unconfirmed).first()).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Confirm temperature of stage 1' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'reaction-editor-parsed-field-1280x800.png') });
    await dialog.getByRole('button', { name: 'Confirm temperature of stage 1' }).click();
    await expect(dialog.getByText('Read from the text: please confirm.')).toHaveCount(0);
    await expect(dialog.getByText(unconfirmed)).toHaveCount(0, { timeout: 60_000 });
    await expect(dialog.getByLabel('Temperature value of stage 1')).toHaveValue('140'); // the value stays
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectClean(seen);
  });
});
