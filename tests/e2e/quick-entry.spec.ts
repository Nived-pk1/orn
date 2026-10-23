/**
 * Quick entry (step 6.7b; ADR-040 addendum, decisions Q1-Q4), PRODUCTION build, every engine, Studio:
 *  (1) the PCC line end to end: "ethanol + PCC (CH2Cl2) -> ethanal" - terms resolve ("PCC" asks which one: the reagent), the card's equation is
 *      drawn, Open gives a NEW draft, the product role is chosen, Save; the record is shown;
 *  (2) a two-stage line with ", then": two stages, three participants in the draft;
 *  (3) an unknown name created through "Create new" (a nested editor) resolves the term;
 *  (4) a line with an error shows its words;
 *  (5) the Pixel 7 and iPhone 14: a quick entry to a saved reaction.
 * Axe on the dialog; zero policy violations. Screenshots: screenshots/quick-entry-{resolved,unknown,error,draft}-1280x800.png and
 * phone-quick-entry-<pixel7|iphone14>.png.
 */
import { resolve } from 'node:path';
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';
import { openDemo, record, shotsDir, showRecord } from './editor-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const modes = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const quickDialog = (page: Page) => page.getByRole('dialog', { name: 'Quick entry' });
const reactionDialog = (page: Page) => page.getByRole('dialog', { name: 'New reaction' });

async function dismissToasts(page: Page): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  if ((await page.locator('dialog[open]').count()) > 0) {
    await expect.poll(() => toasts.count(), { timeout: 20_000 }).toBe(0).catch(() => undefined);
    return;
  }
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

/** Every drawing in the dialog is a real image, not a placeholder. */
async function imagesSettled(dialog: Locator): Promise<void> {
  await expect
    .poll(() => dialog.locator('img').evaluateAll((images) => (images as HTMLImageElement[]).every((image) => image.complete && image.naturalWidth > 0)), { timeout: 60_000 })
    .toBe(true);
}

async function openQuickEntry(page: Page, tap = false): Promise<Locator> {
  if (tap) {
    await page.getByRole('button', { name: 'More' }).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Quick entry', exact: true }).tap();
  } else {
    await modes(page).getByRole('button', { name: /Workbench/ }).click();
    await page.getByRole('button', { name: 'Quick entry', exact: true }).click();
  }
  const dialog = quickDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

const termRow = (dialog: Locator, term: string): Locator => dialog.locator(`[data-testid="quick-term"][data-term="${term}"]`);

/** "PCC" is the name of a reagent and an alias of a species in the demo: since 6.7b a reagent and the species it is made of resolve to the REAGENT, with no question. */
async function expectReagent(dialog: Locator, term: string, name: string): Promise<void> {
  const row = termRow(dialog, term);
  // shown "<name> (reagent)" with "Use the species instead" next to it
  await expect(row).toContainText(`${name} (reagent)`, { timeout: 60_000 });
  await expect(row).not.toContainText('Which one?');
}

async function waitResolved(dialog: Locator, term: string, text: string): Promise<void> {
  await expect(termRow(dialog, term)).toContainText(text, { timeout: 60_000 });
}

/** The participant made from the "( )" text (CH2Cl2) has no role yet: the finding takes us to its Role field, and the solvent is chosen. */
async function chooseSolventRole(editor: Locator, tap = false): Promise<void> {
  const finding = editor.getByRole('button', { name: /^Error Choose a role for participant/ }).first();
  await expect(finding).toBeVisible();
  if (tap) await finding.tap();
  else await finding.click();
  await editor.locator('select[aria-label^="Role of participant"]:focus').selectOption('solvent');
}

async function chooseMainRole(editor: Locator, tap = false): Promise<void> {
  const edit = editor.getByRole('button', { name: 'Edit outcome 1', exact: true });
  // on a phone the sections are folded: open Outcomes first
  if (tap) await editor.getByRole('region', { name: 'Outcomes', exact: true }).getByRole('button', { name: 'Outcomes', exact: true }).tap();
  if (tap) await edit.tap();
  else await edit.click();
  const main = editor.getByRole('group', { name: 'Role of product 1 of outcome 1' }).getByRole('radio', { name: 'Main' });
  await expect(editor.getByRole('group', { name: 'Role of product 1 of outcome 1' }).getByText('Choose a role')).toBeVisible();
  if (tap) await main.tap();
  else await main.check();
}

test.describe('quick entry (desktop)', () => {
  test('the PCC line: terms resolve, the equation is drawn, Open gives a new draft, Save after choosing the product role', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);
    const dialog = await openQuickEntry(page);
    await dialog.getByLabel('Reaction line').fill('ethanol + PCC (CH2Cl2) -> ethanal');
    await waitResolved(dialog, 'ethanol', 'Ethanol · species');
    await waitResolved(dialog, 'ethanal', 'Ethanal · species');
    await expectReagent(dialog, 'PCC', 'PCC');
    // the formula CH2Cl2 names one species exactly: a participant (its role is still to be chosen), not condition text, so no conditions group is left;
    // every term is a species or a reagent, so the scope is Specific
    await expect(dialog.getByRole('group', { name: 'Conditions of stage 1' })).toHaveCount(0);
    await expect(dialog.getByTestId('quick-scope')).toContainText('Specific');
    const preview = dialog.getByRole('list', { name: 'Reaction preview' });
    await expect(preview).toBeVisible({ timeout: 60_000 });
    await imagesSettled(dialog);
    expect(await axeProblems(page)).toEqual([]);
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'quick-entry-resolved-1280x800.png') });
    await dialog.getByRole('button', { name: 'Open in the reaction editor', exact: true }).click();
    const editor = reactionDialog(page);
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('Name (required)')).toHaveValue('ethanol + PCC (CH2Cl2) → ethanal');
    await expect(editor.getByLabel('Scope (required)')).toHaveValue('specific');
    await chooseSolventRole(editor);
    await chooseMainRole(editor);
    await dismissToasts(page);
    await editor.getByLabel('Name (required)').scrollIntoViewIfNeeded();
    await imagesSettled(editor);
    await page.screenshot({ path: resolve(shotsDir(), 'quick-entry-draft-1280x800.png') });
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor).toBeHidden();
    await showRecord(page, 'r', 'ethanol + PCC (CH2Cl2)');
    await expect(record(page).getByRole('heading', { level: 3, name: 'ethanol + PCC (CH2Cl2) → ethanal' })).toBeVisible();
    await expectClean(seen);
  });

  test('a two-stage line with ", then" gives two stages and three participants', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);
    const dialog = await openQuickEntry(page);
    await dialog.getByLabel('Reaction line').fill('ethanol + PCC, then Sulfuric acid -> ethanal');
    await expectReagent(dialog, 'PCC', 'PCC');
    await expectReagent(dialog, 'Sulfuric acid', 'Sulfuric acid');
    await expect(dialog.getByRole('region', { name: 'Stage 2' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Open in the reaction editor', exact: true }).click();
    const editor = reactionDialog(page);
    await expect(editor).toBeVisible();
    await expect(editor.getByTestId('participant-row')).toHaveCount(3);
    await expect(editor.getByRole('list', { name: 'Stages' }).getByRole('group', { name: /^Stage \d+$/ })).toHaveCount(2);
    await expectClean(seen);
  });

  test('an unknown name is created through Create new and resolves the term', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);
    const dialog = await openQuickEntry(page);
    await dialog.getByLabel('Reaction line').fill('ethanol + Zzzene e2e -> ethanal');
    const row = termRow(dialog, 'Zzzene e2e');
    await expect(row).toContainText('Not found', { timeout: 60_000 });
    await expect(row.getByRole('button', { name: 'Create new species "Zzzene e2e"', exact: true })).toBeVisible();
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'quick-entry-unknown-1280x800.png') });
    await row.getByRole('button', { name: 'Create new species "Zzzene e2e"', exact: true }).click();
    const nested = page.getByRole('dialog', { name: 'New species' });
    await expect(nested).toBeVisible();
    await expect(nested.getByLabel('Canonical name (required)')).toHaveValue('Zzzene e2e');
    await nested.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(nested).toBeHidden();
    await expect(row).toContainText('Zzzene e2e · species');
    await expect(row).not.toContainText('Not found');
    await expectClean(seen);
  });

  test('a line with an error shows its words and no review', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    const dialog = await openQuickEntry(page);
    await dialog.getByLabel('Reaction line').fill('ethanol + -> ethanal');
    const problems = dialog.getByRole('list', { name: 'Problems with the line' });
    await expect(problems).toContainText("after 'ethanol +'");
    await expect(dialog.getByRole('button', { name: 'Open in the reaction editor', exact: true })).toHaveCount(0);
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'quick-entry-error-1280x800.png') });
    await expectClean(seen);
  });
});

async function walkPhone(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  const dialog = await openQuickEntry(page, true);
  await dialog.getByLabel('Reaction line').fill('ethanol + PCC (CH2Cl2) -> ethanal');
  await waitResolved(dialog, 'ethanol', 'Ethanol · species');
  await expectReagent(dialog, 'PCC', 'PCC');
  await waitResolved(dialog, 'ethanal', 'Ethanal · species');
  const box = await dialog.boundingBox();
  expect(box?.width ?? 0, 'the dialog fits the screen').toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  expect(await axeProblems(page)).toEqual([]);
  await dismissToasts(page);
  await page.screenshot({ path: resolve(shotsDir(), `phone-quick-entry-${device}.png`) });
  await dialog.getByRole('button', { name: 'Open in the reaction editor', exact: true }).tap();
  const editor = reactionDialog(page);
  await expect(editor).toBeVisible();
  await chooseSolventRole(editor, true);
  await chooseMainRole(editor, true);
  await editor.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(editor).toBeHidden();
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('a quick entry to a saved reaction', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await walkPhone(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('a quick entry to a saved reaction', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await walkPhone(page, 'iphone14');
  });
});
