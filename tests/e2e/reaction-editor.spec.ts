/**
 * The reaction editor end to end (step 6.3a part 4; ADR-040 addendum, D1-D4 and decisions 1-5), PRODUCTION build, every engine:
 *  (1) New reaction "Propan-1-ol + PCC" (scope specific): the demo has no propan-1-ol, so the test creates the species first; reactant
 *      propan-1-ol, reagent PCC, solvent dichloromethane; Save as a DRAFT; the RXN-002 warning shows; it is in search and the inspector; Undo removes it;
 *  (2) the same reactant added twice in the same stage shows RXN-021 with the role and the stage in its words;
 *  (3) the demo's Grignard reaction: reorder its stages and back, label the first, Save; Undo restores it.
 * Axe on the editor; zero policy violations. Screenshots: screenshots/reaction-editor-{participants,stages,advanced-flags}-1280x800.png.
 */
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { openDemo, openNamesEditor, palette, record, searchFor, shotsDir, showRecord } from './editor-kit';

const newDialog = (page: Page) => page.getByRole('dialog', { name: 'New reaction' });

async function workbench(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /Workbench/ }).click();
  await expect(page.getByRole('region', { name: 'Workbench' })).toBeVisible();
}

async function createSpecies(page: Page, name: string): Promise<void> {
  await workbench(page);
  await page.getByRole('button', { name: 'New species', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New species' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Canonical name (required)').fill(name);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function startNewReaction(page: Page, name: string): Promise<void> {
  await workbench(page);
  await page.getByRole('button', { name: 'New reaction', exact: true }).click();
  const dialog = newDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name (required)').fill(name);
  await dialog.getByLabel('Scope (required)').selectOption('specific');
}

/** Adds a participant: the role beside the picker, a search, the Add button of the result. */
async function addParticipant(page: Page, role: string, search: string, name: string): Promise<void> {
  const dialog = newDialog(page);
  await dialog.getByLabel('Add it as').selectOption(role);
  // the picker asks when the text changes: a species created a moment ago may not be in the search index yet, so ask again until it is
  const add = dialog.getByRole('list', { name: 'Substances found', exact: true }).getByRole('button', { name: `Add ${name}`, exact: true });
  await expect(async () => {
    await dialog.getByLabel('Find a substance by name').fill('');
    await dialog.getByLabel('Find a substance by name').fill(search);
    await expect(add).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await add.click();
}

/** The live preview (step 6.3b D2): the card's own full equation, built from the draft 400 ms after the last edit. */
const previewOf = (page: Page) => page.getByRole('dialog').getByRole('region', { name: 'Preview' });

test.describe('the reaction editor', () => {
  test("the live preview of the demo's E2 reaction shows both products with their words and follows an edit of the coefficient", async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await showRecord(page, 'r', '(R)-2-Bromobutane', 'rxn_r-2-bromobutane-alc-koh');
    await openNamesEditor(page, '(R)-2-Bromobutane + alc. KOH');
    const preview = previewOf(page);
    await expect(preview.getByRole('group', { name: 'Full equation' })).toHaveCount(1);
    await expect(preview.locator('[data-equation-word]')).toHaveText(['(major · Saytzeff)', '(minor · Hofmann)']);
    await expect(preview.getByText('But-2-ene', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(preview.getByText('But-1-ene', { exact: true })).toBeVisible();
    await expect(preview.locator('[data-equation-coefficient]')).toHaveCount(0);
    await page.screenshot({ path: resolve(shotsDir(), 'reaction-editor-preview-1280x800.png') });
    // the reactant's coefficient: the preview's full equation shows "2"
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^Edit participant 1$/ }).click();
    await dialog.getByLabel('Coefficient of participant 1').fill('2');
    await expect(preview.locator('[data-equation-coefficient]')).toHaveText('2');
    await dialog.getByRole('button', { name: 'Close (keeps the draft)' }).click();
    await expectClean(seen);
  });

  test('a New reaction with two participants: the preview shows them and "No products yet"', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await startNewReaction(page, 'Preview check');
    const dialog = newDialog(page);
    await expect(previewOf(page).getByText('Add a participant to see the reaction here.')).toBeVisible();
    await addParticipant(page, 'reactant', 'ethanol', 'Ethanol');
    await addParticipant(page, 'reagent', 'pcc', 'PCC');
    await expect(previewOf(page).getByText('No products yet (outcomes arrive in step 6.4)')).toBeVisible();
    await expect(previewOf(page).getByRole('group', { name: 'Full equation' })).toContainText('Ethanol');
    await expect(previewOf(page).getByRole('group', { name: 'Full equation' })).toContainText('PCC');
    await dialog.getByRole('button', { name: 'Close (keeps the draft)' }).click();
    await expectClean(seen);
  });

  test('New reaction "Propan-1-ol + PCC": reactant, reagent, solvent, Save as a draft with the RXN-002 warning, search, inspector, Undo', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await createSpecies(page, 'Propan-1-ol');
    await startNewReaction(page, 'Propan-1-ol + PCC');
    const dialog = newDialog(page);

    await addParticipant(page, 'reactant', 'propan-1-ol', 'Propan-1-ol');
    await addParticipant(page, 'reagent', 'pcc', 'PCC');
    await addParticipant(page, 'solvent', 'dichloromethane', 'Dichloromethane');
    await expect(dialog.getByTestId('participant-row')).toHaveCount(3);
    // compact rows (step 6.3b D1): each is a summary line; the one just added (the solvent) is open and the others are folded
    await expect(dialog.getByText(/^1\. Propan-1-ol · Reactant$/)).toBeVisible();
    await expect(dialog.getByText(/^2\. PCC · Reagent$/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close participant 3' })).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog.getByLabel(/^Role of participant/)).toHaveCount(1);
    await expect(dialog.getByText('By default a solvent contributes no atoms, is not consumed and is not catalytic.')).toBeVisible();
    // the live checks say what is missing: no outcome yet (RXN-002, a WARNING for a draft)
    await expect(dialog.getByText(/has no outcome with a product/).first()).toBeVisible({ timeout: 60_000 });
    expect(await axeProblems(page)).toEqual([]);
    await dialog.getByRole('heading', { name: 'Participants' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'reaction-editor-participants-1280x800.png') });
    await page.screenshot({ path: resolve(shotsDir(), 'reaction-editor-compact-1280x800.png') });
    // only one row is open: Edit on the first closes the third; its "More details" and override flags are collapsed and say the default
    await dialog.getByRole('button', { name: 'Edit participant 1' }).click();
    await expect(dialog.getByLabel(/^Role of participant/)).toHaveCount(1);
    await expect(dialog.getByLabel('Role of participant 1')).toBeVisible();
    await expect(dialog.getByText('More details').locator('xpath=..')).not.toHaveAttribute('open', '');
    const advanced = dialog.getByTestId('participant-row').first().locator('details', { hasText: 'Advanced: override flags' });
    await advanced.locator('summary').click();
    await expect(dialog.getByLabel('Is consumed: participant 1')).toBeVisible();
    await dialog.getByLabel('Is consumed: participant 1').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'reaction-editor-advanced-flags-1280x800.png') });

    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/^Saved, 1 warning$/)).toBeVisible();

    // in search, and the inspector shows it with its warning
    await showRecord(page, 'r', 'Propan-1-ol + PCC');
    await expect(record(page).getByRole('heading', { level: 3, name: 'Propan-1-ol + PCC' })).toBeVisible();
    await expect(record(page)).toContainText(/warning/i);

    // Undo removes it
    await page.getByRole('button', { name: 'Undo Create reaction Propan-1-ol + PCC' }).click();
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeVisible();
    await searchFor(page, 'r: propan-1-ol');
    await expect(palette(page).getByRole('option', { name: /Propan-1-ol \+ PCC/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expectClean(seen);
  });

  test('the same reactant added twice in the same stage shows RXN-021 with the role and the stage in its words', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await startNewReaction(page, 'Doubled ethanol');
    const dialog = newDialog(page);
    await dialog.getByRole('button', { name: 'Add stage', exact: true }).click();
    await expect(dialog.getByRole('group', { name: 'Stage 1' })).toBeVisible();
    await addParticipant(page, 'reactant', 'ethanol', 'Ethanol');
    await addParticipant(page, 'reactant', 'ethanol', 'Ethanol');
    await expect(dialog.getByText('Participant 2 is listed twice as reactant in stage 1; use the coefficient instead.').first()).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Close (keeps the draft)' }).click();
    await expectClean(seen);
  });

  test("the demo's Grignard reaction: reorder its stages and back, label the first, Save; Undo restores it", async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await showRecord(page, 'r', 'CH3MgBr', 'rxn_methylmgbr-ethanal');
    await openNamesEditor(page, 'CH₃MgBr + ethanal, then H₃O⁺');
    const dialog = page.getByRole('dialog', { name: /^Edit CH₃MgBr \+ ethanal/ });
    await expect(dialog.getByLabel('Kind of stage 1')).toHaveValue('reaction');
    await expect(dialog.getByLabel('Kind of stage 2')).toHaveValue('workup');
    const original = await dialog.getByLabel('Label of stage 1').inputValue();
    expect(original).toBe('1. CH₃MgBr, dry ether');
    await dialog.getByRole('heading', { name: 'Stages' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'reaction-editor-stages-1280x800.png') });
    // the stage choice of an open participant is as wide as its row, so its words are not cut (step 6.3b D1)
    await dialog.getByRole('button', { name: 'Edit participant 1' }).click();
    const stage = await dialog.getByLabel('Stage of participant 1').boundingBox();
    const rowBox = await dialog.getByTestId('participant-row').first().boundingBox();
    expect(stage?.width ?? 0, 'the stage choice fills the row').toBeGreaterThan((rowBox?.width ?? 0) * 0.8);
    await dialog.getByRole('button', { name: 'Close participant 1' }).click();

    await dialog.getByRole('button', { name: 'Move stage 1 down' }).click();
    await expect(dialog.getByLabel('Kind of stage 1')).toHaveValue('workup');
    await expect(dialog.getByLabel('Kind of stage 2')).toHaveValue('reaction');
    await dialog.getByRole('button', { name: 'Move stage 2 up' }).click();
    await expect(dialog.getByLabel('Kind of stage 1')).toHaveValue('reaction');
    await dialog.getByLabel('Label of stage 1').fill('Addition');
    expect(await axeProblems(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();

    await openNamesEditor(page, 'CH₃MgBr + ethanal, then H₃O⁺');
    await expect(dialog.getByLabel('Label of stage 1')).toHaveValue('Addition');
    await dialog.getByRole('button', { name: 'Close (keeps the draft)' }).click();
    await page.getByRole('button', { name: /^Undo Edit reaction of / }).click();
    await openNamesEditor(page, 'CH₃MgBr + ethanal, then H₃O⁺');
    await expect(dialog.getByLabel('Label of stage 1')).toHaveValue(original);
    await dialog.getByRole('button', { name: 'Close (keeps the draft)' }).click();
    await expectClean(seen);
  });
});
