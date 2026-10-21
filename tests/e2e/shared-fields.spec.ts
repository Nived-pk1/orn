/**
 * The shared fields end to end (step 6.6a; ADR-040 addendum), the STUDIO production build, every engine:
 *  (1) a new source (New source, Workbench); then on a demo species a tag, a citation of that source with a locator and a property with its
 *      value; Save; the inspector shows them. A species has no `conceptIds` in the schema, so the CONCEPT is added on a demo reaction, with a
 *      reaction type that has a certainty (no default: "Choose certainty" first) in the same Save; the inspector shows both;
 *  (2) a profile temperature of potassium permanganate, Saved, shown by the inspector;
 *  (3) phone (Pixel 7 in Chromium, iPhone 14 in WebKit): More > New species, a tag, a note, Save.
 * Axe on the editors; zero policy violations. Screenshots: shared-fields, citations, source-editor, classification, species-properties,
 * profile-conditions (-1280x800) and phone-shared-fields-<pixel7|iphone14>.
 */
import { resolve } from 'node:path';
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';
import { editorDialog, openDemo, openNamesEditor, pane, record, shotsDir, showRecord, showSpecies } from './editor-kit';

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const openSection = async (page: Page, name: RegExp | string): Promise<void> => {
  const toggle = page.getByRole('dialog').getByRole('button', { name, expanded: false });
  if ((await toggle.count()) > 0) await toggle.first().click();
};
/** Opens an inspector level section if it is closed (the open state is remembered between records). */
const openLevel = async (page: Page, level: RegExp): Promise<void> => {
  const toggle = record(page).getByRole('button', { name: level });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
};
const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: resolve(shotsDir(), `${name}-1280x800.png`) });

test.describe('the shared fields (Studio)', () => {
  test('a new source; a tag, a citation and a property on a demo species; a concept and a classification on a demo reaction; all shown by the inspector', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);

    // (1) a new source
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /Workbench/ }).click();
    await page.getByRole('button', { name: 'New source' }).click();
    const source = page.getByRole('dialog', { name: 'New source' });
    await expect(source).toBeVisible();
    await source.getByLabel('Kind of source').selectOption('textbook');
    await source.getByLabel('Title (required)').fill('Shared fields textbook');
    await source.getByLabel('Year').fill('2010');
    await source.getByLabel('Identifier (ISBN, DOI or paper code)').fill('ISBN 978-0-00-000000-0');
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, 'source-editor');
    await source.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(source).toBeHidden();

    // a tag, a citation and a property on ethanol
    await showSpecies(page, 'spc_ethanol', 'Ethanol');
    await openNamesEditor(page, 'Ethanol');
    const dialog = editorDialog(page, 'Ethanol');
    await openSection(page, /Notes, tags and citations/);
    await dialog.getByLabel('Add a tag').fill('jee-main');
    await dialog.getByLabel('Add a tag').press('Enter');
    await expect(dialog.getByRole('list', { name: 'Tag list' })).toContainText('jee-main');
    await dialog.getByLabel('Add a tag').fill('jee-main');
    await dialog.getByLabel('Add a tag').press('Enter');
    await expect(dialog.getByRole('alert')).toHaveText('"jee-main" is already a tag here.');
    await dialog.getByLabel('Add a tag').fill('');
    await dialog.getByLabel('Find a source by title').fill('shared fields');
    await dialog.getByRole('button', { name: 'Add Shared fields textbook' }).click({ timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Edit citation Shared fields textbook (2010)' }).click();
    await dialog.getByLabel('Locator', { exact: true }).fill('ch. 4');
    expect((await dialog.getByLabel('Locator', { exact: true }).boundingBox())?.height ?? 999).toBeLessThan(80); // K1: a one-line input, not a 300 px column
    await dialog.getByLabel('Citation note').scrollIntoViewIfNeeded();
    await shot(page, 'citations');
    await dialog.getByLabel('Add a tag').scrollIntoViewIfNeeded();
    await shot(page, 'shared-fields');

    await openSection(page, /^.?\s*Properties/);
    await dialog.getByRole('button', { name: 'Add property' }).click();
    await expect(dialog.getByLabel('Property', { exact: true })).toHaveValue('');
    await dialog.getByLabel('Property', { exact: true }).selectOption('boiling_point');
    await expect(dialog.getByText('e.g. 78 °C (at 1 atm)')).toBeVisible();
    await dialog.getByLabel('Value', { exact: true }).fill('78.37 °C (at 1 atm)');
    expect((await dialog.getByLabel('Value', { exact: true }).boundingBox())?.height ?? 999).toBeLessThan(80); // K1
    await dialog.getByLabel('Value', { exact: true }).scrollIntoViewIfNeeded();
    await shot(page, 'species-properties');
    expect(await axeProblems(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(record(page)).toHaveAttribute('data-record-id', 'spc_ethanol');
    await openLevel(page, /Level 3/);
    await openLevel(page, /Level 4/);
    await expect(record(page)).toContainText('78.37 °C (at 1 atm)');
    await expect(record(page)).toContainText('jee-main');
    await expect(record(page)).toContainText('ch. 4');

    // a concept and a classification on a demo reaction
    await showRecord(page, 'r', 'CH₃MgBr + ethanal, then H₃O⁺', 'rxn_methylmgbr-ethanal');
    await openNamesEditor(page, 'CH₃MgBr + ethanal, then H₃O⁺');
    const reaction = editorDialog(page, 'CH₃MgBr + ethanal, then H₃O⁺');
    await openSection(page, /Classification/);
    await reaction.getByLabel('Find a reaction type by name').fill('oxid');
    await reaction.getByRole('list', { name: 'Concepts found' }).getByRole('button', { name: 'Add Oxidation' }).first().click({ timeout: 60_000 });
    const certainty = reaction.getByLabel('Certainty of Oxidation');
    await expect(certainty).toHaveValue('');
    await expect(reaction.getByLabel('Certainty of Oxidation')).toBeVisible();
    await reaction.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(reaction.getByRole('heading', { name: 'Save was refused' })).toBeVisible();
    await certainty.selectOption('possible');
    await expect(certainty).toHaveValue('possible'); // K3: the concept's name is shown once, beside the certainty choice
    await shot(page, 'classification');
    await openSection(page, /Notes, tags and citations/);
    await reaction.getByLabel('Find a concept by name').fill('oxid');
    await reaction.getByRole('list', { name: 'Concepts found' }).last().getByRole('button').first().click({ timeout: 60_000 });
    expect(await axeProblems(page)).toEqual([]);
    await reaction.getByRole('button', { name: /^Save/ }).click();
    await expect(reaction).toBeHidden({ timeout: 60_000 });
    await expect(record(page)).toContainText('Oxidation');

    // (2) a profile temperature of potassium permanganate
    await showRecord(page, 'g', 'potassium permanganate', 'rgt_potassium-permanganate');
    await openNamesEditor(page, 'Potassium permanganate');
    const reagent = editorDialog(page, 'Potassium permanganate');
    await reagent.getByRole('button', { name: 'Edit conditions of profile 2' }).click();
    await reagent.getByLabel('Temperature value of profile 2').fill('95');
    await reagent.getByRole('textbox', { name: 'Behaviour of profile 2' }).scrollIntoViewIfNeeded();
    await shot(page, 'profile-conditions');
    expect(await axeProblems(page)).toEqual([]);
    await reagent.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(reagent).toBeHidden();
    await openLevel(page, /Level 3/);
    await expect(record(page)).toContainText('95');
    await expect(pane(page)).toBeVisible();
    await expectClean(seen);
  });
});

async function phoneWalk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).tap();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'New species' }).tap();
  const dialog = page.getByRole('dialog', { name: 'New species' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Canonical name (required)').fill('Phone shared');
  const shared = dialog.getByRole('button', { name: /Notes, tags and citations/ });
  await shared.tap();
  await expect(shared).toHaveAttribute('aria-expanded', 'true');
  await dialog.getByLabel('Add a tag').fill('phone-tag');
  await dialog.getByLabel('Add a tag').press('Enter');
  await expect(dialog.getByRole('list', { name: 'Tag list' })).toContainText('phone-tag');
  await dialog.getByLabel('Notes', { exact: true }).fill('A note typed on a phone.');
  await dialog.getByLabel('Notes', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/phone-shared-fields-${device}.png` });
  await dialog.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('a tag and a note on a new species', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await phoneWalk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('a tag and a note on a new species', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await phoneWalk(page, 'iphone14');
  });
});
