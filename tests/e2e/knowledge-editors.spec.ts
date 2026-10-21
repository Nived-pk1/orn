/**
 * The knowledge editors end to end (step 6.6b; ADR-040 addendum), the STUDIO production build, every engine:
 *  (1) a new concept and a new named reaction (New concept / New named reaction, Workbench), Saved; a demo reaction linked to the new named
 *      reaction with a reversibility, Saved, and the inspector shows the name;
 *  (2) a new transformation with a from class; a new relationship ("commonly confused with") between two demo reactions, shown by the
 *      reaction's related reactions; a new caveat with a target and trigger conditions, shown at the reaction's Level 4;
 *  (3) phone (Pixel 7 in Chromium, iPhone 14 in WebKit): a demo caveat's statement is edited and Saved.
 * Axe on each new editor; zero CSP violations. Screenshots: concept-editor, named-reaction-editor, transformation-editor, reaction-links,
 * relationship-editor, caveat-editor (-1280x800) and phone-caveat-editor-<pixel7|iphone14>.
 */
import { resolve } from 'node:path';
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';
import { editorDialog, openDemo, openNamesEditor, pane, palette, record, searchFor, shotsDir, showRecord } from './editor-kit';

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: resolve(shotsDir(), `${name}-1280x800.png`) });
const openLevel = async (page: Page, level: RegExp): Promise<void> => {
  const toggle = record(page).getByRole('button', { name: level });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
};
const openSection = async (dialog: Locator, name: RegExp): Promise<void> => {
  const toggle = dialog.getByRole('button', { name, expanded: false });
  if ((await toggle.count()) > 0) await toggle.first().click();
};
const newRecord = async (page: Page, button: string): Promise<Locator> => {
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /Workbench/ }).click();
  await page.getByRole('button', { name: button, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: button });
  await expect(dialog).toBeVisible();
  return dialog;
};
/** Finds a record by name in a picker and adds it; the search index follows a commit a moment later, so the search is asked again until it answers. */
const findAndAdd = async (dialog: Locator, label: string, text: string, list: string, add: string): Promise<void> => {
  const input = dialog.getByLabel(label);
  await expect(async () => {
    await input.fill('');
    await input.fill(text);
    await dialog.getByRole('list', { name: list }).getByRole('button', { name: add, exact: true }).click({ timeout: 4_000 });
  }).toPass({ timeout: 90_000 });
};
const save = async (dialog: Locator): Promise<void> => {
  await dialog.getByRole('button', { name: /^Save/ }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
};

test.describe('the knowledge editors (Studio)', () => {
  test('a concept and a named reaction; a demo reaction linked to them; a transformation; a relationship; a caveat with a target and trigger conditions', async ({ page }) => {
    test.setTimeout(900_000);
    const seen = await watch(page);
    await openDemo(page);

    // (1) a new concept
    const concept = await newRecord(page, 'New concept');
    await expect(concept.getByLabel('Kind of concept')).toHaveValue('');
    await concept.getByLabel('Name (required)').fill('Zz e2e concept');
    await concept.getByLabel('Kind of concept').selectOption('rule');
    await concept.getByLabel('Summary', { exact: true }).fill('A concept made by the end-to-end test.');
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, 'concept-editor');
    await save(concept);

    // a new named reaction
    const named = await newRecord(page, 'New named reaction');
    await named.getByLabel('Name (required)').fill('Zz e2e named reaction');
    await named.getByLabel('Difficulty').selectOption('3');
    await named.getByLabel('Summary', { exact: true }).fill('A named reaction made by the end-to-end test.');
    await expect(named.getByText('No reaction names this one yet.')).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, 'named-reaction-editor');
    await save(named);

    // a demo reaction linked to the new named reaction, with a reversibility
    await showRecord(page, 'r', 'Nitration of benzene (draft)', 'rxn_benzene-nitration-draft');
    await openNamesEditor(page, 'Nitration of benzene (draft)');
    const reaction = editorDialog(page, 'Nitration of benzene (draft)');
    await openSection(reaction, /Links and reversibility/);
    await expect(reaction.getByLabel('Reversibility', { exact: true })).toHaveValue('unknown');
    await findAndAdd(reaction, 'Find a named reaction by name', 'Zz e2e named', 'Named reactions found', 'Add Zz e2e named reaction');
    await reaction.getByLabel('Reversibility', { exact: true }).selectOption('irreversible');
    await reaction.getByLabel('Generalised equation').fill('ArH -> ArNO2');
    await reaction.getByLabel('Generalised equation').scrollIntoViewIfNeeded();
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, 'reaction-links');
    await save(reaction);
    await expect(record(page)).toHaveAttribute('data-record-id', 'rxn_benzene-nitration-draft');
    await expect(record(page)).toContainText('Zz e2e named reaction');
    await expect(record(page)).toContainText('irreversible');

    // (2) a new transformation with a from class
    const transformation = await newRecord(page, 'New transformation');
    await transformation.getByLabel('Name (required)').fill('Zz e2e transformation');
    await findAndAdd(transformation, 'Find a from class by name', 'Alcohols', 'Classes found', 'Add Alcohols');
    await transformation.getByLabel('Carbon chain change').selectOption('none');
    await transformation.getByLabel('Equation text').fill('R-OH -> R-X');
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, 'transformation-editor');
    await save(transformation);

    // a new relationship between two demo reactions
    const relationship = await newRecord(page, 'New relationship');
    await expect(relationship.getByLabel('Type of relationship')).toHaveValue('');
    await relationship.getByLabel('Type of relationship').selectOption('commonly_confused_with');
    await findAndAdd(relationship, 'Find the from record by name', 'Nitration of benzene', 'Records found', 'Add Nitration of benzene (draft)');
    await findAndAdd(relationship, 'Find the to record by name', 'Diazotisation of aniline', 'Records found', 'Add Diazotisation of aniline');
    await expect(relationship.getByText('Nitration of benzene (draft) <-> Diazotisation of aniline')).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, 'relationship-editor');
    await save(relationship);
    await showRecord(page, 'r', 'Diazotisation of aniline', 'rxn_aniline-diazotisation');
    await openLevel(page, /Level 3/);
    await expect(record(page)).toContainText('commonly confused with');
    await expect(record(page)).toContainText('Nitration of benzene (draft)');

    // a new caveat with a target and trigger conditions
    const caveat = await newRecord(page, 'New caveat');
    await expect(caveat.getByLabel('Kind of caveat')).toHaveValue('');
    await caveat.getByLabel('Kind of caveat').selectOption('trap');
    await caveat.getByLabel('Title (required)').fill('Zz e2e caveat');
    await caveat.getByRole('textbox', { name: 'Statement (required)' }).fill('Keep the diazonium salt cold.');
    await findAndAdd(caveat, 'Find a target record by name', 'Diazotisation of aniline', 'Records found', 'Add Diazotisation of aniline');
    await expect(caveat.getByLabel('Role of Diazotisation of aniline')).toHaveValue('');
    await caveat.getByLabel('Role of Diazotisation of aniline').selectOption('affected_reaction');
    await caveat.getByRole('button', { name: 'Edit trigger conditions' }).click();
    const medium = caveat.getByLabel('Medium of the trigger');
    await medium.selectOption({ index: 1 });
    await expect(caveat.getByTestId('trigger-conditions')).not.toHaveText('No trigger conditions.');
    await caveat.getByRole('textbox', { name: 'Explanation' }).scrollIntoViewIfNeeded();
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, 'caveat-editor');
    await save(caveat);
    await showRecord(page, 'r', 'Diazotisation of aniline', 'rxn_aniline-diazotisation');
    await openLevel(page, /Level 4/);
    await expect(record(page)).toContainText('Zz e2e caveat');
    await expect(pane(page)).toBeVisible();
    await expectClean(seen);
  });
});

async function phoneWalk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Search' }).tap();
  await expect(palette(page)).toBeVisible();
  await searchFor(page, 'PCC stops at the aldehyde');
  await palette(page).locator('[role="option"][data-record-id="cav_pcc-stops-at-aldehyde"]').tap();
  await page.getByRole('button', { name: 'Show the whole record' }).tap();
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  const dialog = editorDialog(page, 'PCC stops at the aldehyde');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Statement (required)' }).fill('PCC stops at the aldehyde because there is no water to make the hydrate.');
  await dialog.getByRole('textbox', { name: 'Statement (required)' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/phone-caveat-editor-${device}.png` });
  await dialog.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('edit a demo caveat\'s statement and Save', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await phoneWalk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('edit a demo caveat\'s statement and Save', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await phoneWalk(page, 'iphone14');
  });
});
