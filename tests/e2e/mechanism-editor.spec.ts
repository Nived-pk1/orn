/**
 * The mechanism editor end to end (step 6.5a part 5; ADR-040 addendum, D1-D7), PRODUCTION build, every engine, through the UI only:
 *  (1) New mechanism "Oxidation of a primary alcohol by PCC (outline)": a summary, one variant, two steps; step 1 has an inline structure with
 *      atom maps (the test's own SMILES), one bond broken CHOSEN from those maps and one electron movement; Save;
 *  (2) it is linked to the demo's ethanol -> ethanal (PCC) reaction and to its outcome's variant; the inspector shows the link; Undo restores the demo;
 *  (3) a bond that names a map number which is then removed from the structure shows CHEM-008 on its row;
 *  (4) on the Pixel 7 and iPhone 14: a demo mechanism is opened from search, a step description is edited, Save.
 * Axe on the editor; zero policy violations. Screenshots: screenshots/mechanism-editor-variants-1280x800.png, mechanism-editor-step-open-1280x800.png,
 * rich-text-field-1280x800.png, outcome-mechanism-link-1280x800.png, phone-mechanism-editor-<pixel7|iphone14>.png.
 */
import { resolve } from 'node:path';
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';
import { openDemo, pane, record, searchFor, shotsDir, showRecord } from './editor-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const NAME = 'Oxidation of a primary alcohol by PCC (outline)';
const VARIANT = 'Chromate ester pathway';
const PCC_REACTION = 'Ethanol → ethanal (PCC)';
const PCC_ID = 'rxn_ethanol-to-ethanal-pcc';
const SMILES = '[CH3:1][CH2:2][O:3][H:4]';

async function workbench(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /Workbench/ }).click();
  await expect(page.getByRole('region', { name: 'Workbench' })).toBeVisible();
}

/** Dismisses the open toasts when no editor is open (a modal dialog covers them and takes the clicks). */
async function dismissToasts(page: Page): Promise<void> {
  if ((await page.locator('dialog[open]').count()) > 0) return;
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

/** The picker asks when the text changes: a record created a moment ago may not be searchable yet, so ask again until it is. */
async function pick(dialog: Locator, field: string, list: string, search: string, name: string): Promise<void> {
  const add = dialog.getByRole('list', { name: list, exact: true }).getByRole('button', { name: `Add ${name}`, exact: true });
  await expect(async () => {
    await dialog.getByLabel(field).fill('');
    await dialog.getByLabel(field).fill(search);
    await expect(add).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await add.click();
}

const enabled = (button: Locator) => expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 60_000 });

test.describe('the mechanism editor', () => {
  test('a mechanism from scratch with a mapped step; linked to a demo reaction and its outcome; CHEM-008 on a missing map', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);

    // (1) the mechanism
    await workbench(page);
    await page.getByRole('button', { name: 'New mechanism', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New mechanism' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Name (required)').fill(NAME);
    await dialog.getByRole('textbox', { name: 'Summary' }).fill('PCC oxidises a primary alcohol to the *aldehyde*; H_{2}O is lost. See [[rxn_ethanol-to-ethanal-pcc]].');
    const preview = dialog.getByRole('region', { name: 'Preview of Summary' });
    await expect(preview.locator('em')).toHaveText('aldehyde');
    await expect(preview.locator('sub')).toHaveText('2');
    await expect(dialog.getByText('*emphasis*, **strong**, H_{2}O, Br^{-}, - bullet, [[record link]]')).toBeVisible();
    // the live L1 findings follow an edit 300 ms later (a first "Must not be blank (name)" is not stale, it has not been recomputed yet; review F7)
    await expect(dialog.getByText('Must not be blank (name)')).toHaveCount(0);
    await dismissToasts(page);
    await dialog.getByRole('textbox', { name: 'Summary' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'rich-text-field-1280x800.png') });

    await dialog.getByLabel('Label of a new variant (required)').fill(VARIANT);
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click();
    await expect(dialog.getByTestId('mech-variant-summary')).toHaveText(`1. ${VARIANT} · 0 steps`);
    await dialog.getByLabel('Rate law of variant 1').fill('rate = k[ROH][PCC]');
    await dialog.getByRole('button', { name: 'Add step', exact: true }).click();
    await expect(dialog.getByTestId('step-summary').first()).toHaveText('Step 1');
    await dialog.getByRole('group', { name: 'Step kinds of step 1' }).getByRole('checkbox', { name: 'Bond cleavage' }).check();
    await dialog.getByRole('button', { name: 'Add species', exact: true }).click();
    await dialog.getByLabel('Role of species 1').selectOption('reactant');
    await dialog.getByLabel('Label of species 1').fill('Ethanol (mapped)');
    await dialog.getByRole('button', { name: 'Add structure to species 1' }).click();
    await dialog.getByLabel('SMILES, CXSMILES or molfile of species 1').fill(SMILES);
    // the bond and the movement are CHOSEN from the atom maps the chem worker reads (1 to 4); nothing is typed as a number
    const addBond = dialog.getByRole('button', { name: 'Add bond broken', exact: true });
    await enabled(addBond);
    await addBond.click();
    await expect(dialog.getByLabel('Atoms of bond broken 1').locator('option')).toHaveText(['Choose the atoms', 'Atoms 1 and 2', 'Atoms 1 and 3', 'Atoms 1 and 4', 'Atoms 2 and 3', 'Atoms 2 and 4', 'Atoms 3 and 4'], { timeout: 60_000 });
    await dialog.getByLabel('Atoms of bond broken 1').selectOption('3-4');
    await dialog.getByLabel('Order of bond broken 1').selectOption('1');
    await dialog.getByRole('button', { name: 'Add electron movement', exact: true }).click();
    await dialog.getByLabel('From of movement 1').selectOption('bond:3-4');
    await dialog.getByLabel('To of movement 1').selectOption('lone_pair:3');
    await dialog.getByLabel('Electrons of movement 1').selectOption('2');
    await dialog.getByRole('group', { name: 'Rate-determining' }).getByRole('radio', { name: 'Yes' }).check();
    await expect(dialog.getByTestId('step-summary').first()).toHaveText('Step 1 · bond cleavage · rate-determining');
    await expect(dialog.getByRole('img', { name: 'Drawing of the entered structure' })).toBeVisible({ timeout: 60_000 });
    expect(await axeProblems(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Edit step 1', exact: true }).or(dialog.getByRole('button', { name: 'Close step 1', exact: true })).scrollIntoViewIfNeeded();
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'mechanism-editor-step-open-1280x800.png') });

    await dialog.getByRole('button', { name: 'Add step', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Description of step 2' }).fill('The *aldehyde* leaves the chromium(IV) species.');
    await dialog.getByRole('button', { name: 'Close step 2', exact: true }).click();
    await expect(dialog.getByTestId('step-summary')).toHaveText(['Step 1 · bond cleavage · rate-determining', 'Step 2']);
    await dialog.getByRole('button', { name: 'Close variant 1', exact: true }).click();
    await dialog.getByLabel('Label of a new variant (required)').fill('Second pathway (outline)');
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click();
    await dialog.getByRole('button', { name: 'Close variant 2', exact: true }).click();
    await expect(dialog.getByTestId('mech-variant-summary')).toHaveText([`1. ${VARIANT} · 2 steps`, '2. Second pathway (outline) · 0 steps']);
    await dialog.getByRole('heading', { name: 'Variants' }).scrollIntoViewIfNeeded();
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'mechanism-editor-variants-1280x800.png') });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/^Saved/).first()).toBeVisible();

    // (2) linked to the demo PCC reaction and to its outcome's variant; the inspector shows the link; Undo restores the demo
    await showRecord(page, 'r', PCC_REACTION, PCC_ID);
    await pane(page).getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('dialog', { name: `Edit ${PCC_REACTION}` });
    await expect(editor).toBeVisible();
    await expect(editor.getByText('No mechanism is linked to this reaction.')).toBeVisible();
    await pick(editor, 'Find the mechanism by name', 'Mechanisms found', 'oxidation of a primary', NAME);
    await expect(editor.getByRole('list', { name: 'Linked mechanisms' })).toContainText(NAME);
    await editor.getByRole('button', { name: 'Edit outcome 1', exact: true }).click();
    await editor.getByLabel('Mechanism of outcome 1').selectOption({ label: NAME });
    await editor.getByLabel('Variant of outcome 1').selectOption({ label: VARIANT });
    await expect(editor.getByLabel('Variant of outcome 1')).toHaveValue(/^mvr_/);
    await editor.getByLabel('Mechanism of outcome 1').scrollIntoViewIfNeeded();
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'outcome-mechanism-link-1280x800.png') });
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(record(page)).toContainText(NAME, { timeout: 60_000 });
    await page.getByRole('button', { name: new RegExp(`^Undo Edit reaction of ${PCC_REACTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
    await expect(record(page)).not.toContainText(NAME, { timeout: 60_000 });

    // (3) a bond that names a map the structure then loses shows CHEM-008 on its row
    await showRecord(page, 'm', NAME);
    await pane(page).getByRole('button', { name: 'Edit', exact: true }).click();
    const again = page.getByRole('dialog', { name: `Edit ${NAME}` });
    await expect(again).toBeVisible();
    await again.getByRole('button', { name: 'Edit variant 1', exact: true }).click();
    await again.getByRole('button', { name: 'Edit step 1', exact: true }).click();
    await expect(again.getByLabel('Atoms of bond broken 1')).toHaveValue('3-4', { timeout: 60_000 });
    await expect(again.getByLabel('Atoms of bond broken 1')).not.toHaveAttribute('aria-invalid', 'true');
    await again.getByLabel('SMILES, CXSMILES or molfile of species 1').fill('[CH3:1][CH2:2][OH:3]');
    await expect(again.getByText(/Atom map 4 is not on any atom of the structures of this step/).first()).toBeVisible({ timeout: 60_000 });
    await expect(again.getByLabel('Atoms of bond broken 1')).toHaveAttribute('aria-invalid', 'true');
    await expect(again.getByTestId('step-summary').first()).toHaveAttribute('aria-invalid', 'true');
    await again.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await again.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(again).toBeHidden();
    await expectClean(seen);
  });
});

async function phoneWalk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Search' }).tap();
  const palette = page.getByRole('dialog', { name: 'Search' });
  await expect(palette).toBeVisible();
  await searchFor(page, 'm: sn2');
  await palette.getByRole('option', { name: /SN2 substitution of a haloalkane/ }).tap();
  await page.getByRole('button', { name: /Show the whole record/ }).tap();
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: 'Edit SN2 substitution of a haloalkane' });
  await expect(dialog).toBeVisible();
  // the long sections start closed; Variants opens by tap, then its variant and its step
  await dialog.getByRole('button', { name: /Variants/ }).tap();
  await dialog.getByRole('button', { name: 'Edit variant 1', exact: true }).tap();
  await dialog.getByRole('button', { name: 'Edit step 1', exact: true }).tap();
  const description = dialog.getByRole('textbox', { name: 'Description of step 1' });
  await description.fill('The *nucleophile* attacks from the side opposite the leaving group.');
  // stacked: the second species row starts below the first (one column)
  const rows = dialog.getByTestId('species-row');
  const a = await rows.nth(0).boundingBox();
  const b = await rows.nth(1).boundingBox();
  expect((b?.y ?? 0) >= (a?.y ?? 0) + (a?.height ?? 0) - 2, 'phone species rows stack').toBe(true);
  expect(await axeProblems(page)).toEqual([]);
  await description.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/phone-mechanism-editor-${device}.png` });
  await dialog.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('open a demo mechanism, edit a step description, Save', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await phoneWalk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('open a demo mechanism, edit a step description, Save', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await phoneWalk(page, 'iphone14');
  });
});
