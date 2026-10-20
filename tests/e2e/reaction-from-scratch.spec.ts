/**
 * A reaction authored entirely from scratch (step 6.4b part 3; ADR-040 addendum, D1-D5 and the reviewer's decisions of 2026-10-20), PRODUCTION
 * build, every engine, through the UI only, in a fresh database with the demo loaded:
 *  (1) New species "Propanal" (CCC=O, class Aldehydes) and "Propan-1-ol" (CCCO, class Alcohols): the demo has neither;
 *  (2) New reaction "Propan-1-ol -> propanal (PCC)" (specific): reactant propan-1-ol, reagent PCC, solvent dichloromethane, one stage that is
 *      anhydrous, ONE outcome "exclusive" with main product propanal, Published; RXN-003 shows while the outcome has no product;
 *  (3) it appears where the navigator reads it (GRAPH_SEMANTICS §3: the carried substrate and the main product): the Alcohols family page,
 *      "Reactions of Alcohols", group "To Aldehydes", and the Aldehydes family page, "From Alcohols"; its card shows the scheme and the full
 *      equation (propan-1-ol -> propanal, PCC above the arrow); search finds it; the inspector shows it with no ERROR finding;
 *  (4) Undo three times removes the reaction and both species, nothing left behind;
 *  (5) on the Pixel 7 and iPhone 14: New reaction with one reactant, then an outcome with one product, Save.
 * Axe; zero policy violations. Screenshots: screenshots/from-scratch-{family-card,full-equation}-1280x800.png,
 * reaction-editor-outcomes-1280x800.png, reaction-editor-outcome-open-1280x800.png, phone-reaction-editor-outcomes-<pixel7|iphone14>.png.
 */
import { resolve } from 'node:path';
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, findingsText, openPhoneApp, recordCount, showDataset, watch } from './kit';
import { openDemo, palette, record, searchFor, shotsDir, showRecord } from './editor-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const NAME = 'Propan-1-ol -> propanal (PCC)';
const modes = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const newDialog = (page: Page, what: string) => page.getByRole('dialog', { name: `New ${what}` });
const hubGroup = (page: Page, id: string) => page.locator(`svg [data-node-id="${id}"]`);
const cardOf = (page: Page, name: string): Locator => page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name }) });

/** Showing a reaction in the inspector already opens the family page of its source; otherwise a double click on the hub does. */
async function openFamily(page: Page, hub: string, name: string): Promise<void> {
  await modes(page).getByRole('button', { name: 'Navigator' }).click();
  const region = page.getByRole('region', { name: `Family page: ${name}` });
  if (!(await region.isVisible())) await hubGroup(page, hub).dblclick({ timeout: 30_000 });
  await expect(region).toBeVisible();
}

/** The dataset's ERROR findings (the Dataset page's "Findings: E n / ..." line). */
async function errorCount(page: Page): Promise<number> {
  await showDataset(page);
  const line = await findingsText(page).first().textContent({ timeout: 60_000 });
  return Number(/^Findings: E (d+)/.exec(line ?? '')?.[1]);
}

/** (the Preparation strip comes first on a family page, the Reactions strip last) The number on a group heading of the open family page ("To Aldehydes" ... "3 reactions"): the strip button scrolls the group in, the count is read beside its heading. */
async function groupCount(page: Page, strip: RegExp, group: string, which: "first" | "last"): Promise<number> {
  await page.getByRole('button', { name: strip })[which]().click();
  const heading = page.getByRole('heading', { level: 3, name: group, exact: true });
  await expect(heading).toBeVisible();
  const words = await heading.locator('xpath=..').textContent();
  return Number(/(\d+)\s+reactions?/.exec(words ?? '')?.[1]);
}

/** Dismisses the open toasts, so a screenshot shows the page and not the notices. */
async function dismissToasts(page: Page): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

async function workbench(page: Page): Promise<void> {
  await modes(page).getByRole('button', { name: /Workbench/ }).click();
  await expect(page.getByRole('region', { name: 'Workbench' })).toBeVisible();
}

/** A species from scratch: name, SMILES, one class chosen by name; Save. */
async function createSpecies(page: Page, name: string, smiles: string, className: string): Promise<void> {
  await workbench(page);
  await page.getByRole('button', { name: 'New species', exact: true }).click();
  const dialog = newDialog(page, 'species');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Canonical name (required)').fill(name);
  await dialog.getByLabel('SMILES, CXSMILES or molfile').fill(smiles);
  await expect(dialog.getByRole('img', { name: 'Drawing of the entered structure' })).toBeVisible({ timeout: 60_000 });
  await dialog.getByLabel('Find a class by name').fill(className);
  await dialog.getByRole('list', { name: 'Classes found' }).getByRole('button', { name: `Add ${className}`, exact: true }).click();
  await expect(dialog.getByRole('list', { name: 'Listed classes' })).toContainText(className);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
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

async function addParticipant(dialog: Locator, role: string, search: string, name: string): Promise<void> {
  await dialog.getByLabel('Add it as').selectOption(role);
  await pick(dialog, 'Find a substance by name', 'Substances found', search, name);
}

async function addMainProduct(dialog: Locator, outcome: number, search: string, name: string, tap = false): Promise<void> {
  await pick(dialog, `Find a product of outcome ${outcome} by name`, `Products found for outcome ${outcome}`, search, name);
  const group = dialog.getByRole('group', { name: `Role of product 1 of outcome ${outcome}` });
  await expect(group.getByText('Choose a role')).toBeVisible();
  const main = group.getByRole('radio', { name: 'Main' });
  if (tap) await main.locator('xpath=..').tap();
  else await main.check();
  await expect(main).toBeChecked();
}

test.describe('a reaction from scratch', () => {
  test('two species, a reaction with one outcome, Published; it is on the Alcohols and Aldehydes family pages with its full equation; Undo x3 removes everything', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);
    await showDataset(page);
    const errorsBefore = await errorCount(page);
    // the groups the new reaction joins, counted before it exists
    await openFamily(page, 'cls_alcohols', 'Alcohols');
    const toBefore = await groupCount(page, /^Aldehydes\s*\d+\s*reactions?$/, 'To Aldehydes', 'last');
    await page.getByRole('button', { name: 'Overview' }).click();
    await openFamily(page, 'cls_aldehydes', 'Aldehydes');
    const fromBefore = await groupCount(page, /^Alcohols\s*\d+\s*reactions?$/, 'From Alcohols', 'first');
    const before = { species: await recordCount(page, 'species'), reaction: await recordCount(page, 'reaction') };

    // (1) the species
    await createSpecies(page, 'Propanal', 'CCC=O', 'Aldehydes');
    await createSpecies(page, 'Propan-1-ol', 'CCCO', 'Alcohols');

    // (2) the reaction
    await workbench(page);
    await page.getByRole('button', { name: 'New reaction', exact: true }).click();
    const dialog = newDialog(page, 'reaction');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Name (required)').fill(NAME);
    await dialog.getByLabel('Scope (required)').selectOption('specific');
    await dialog.getByRole('button', { name: 'Add stage', exact: true }).click();
    await addParticipant(dialog, 'reactant', 'propan-1-ol', 'Propan-1-ol');
    await addParticipant(dialog, 'reagent', 'pcc', 'PCC');
    await addParticipant(dialog, 'solvent', 'dichloromethane', 'Dichloromethane');
    await expect(dialog.getByTestId('participant-row')).toHaveCount(3);
    await dialog.getByRole('button', { name: 'Edit conditions of stage 1' }).click();
    await dialog.getByLabel('Anhydrous of stage 1').selectOption('yes');
    await expect(dialog.getByTestId('stage-conditions')).toHaveText('Conditions: anhydrous');

    // the outcome: a new one is "unspecified" under all conditions with no product, and RXN-003 says so
    await dialog.getByRole('button', { name: 'Add outcome', exact: true }).click();
    await expect(dialog.getByTestId('outcome-row')).toHaveCount(1);
    await expect((dialog.getByLabel('Selectivity of outcome 1'))).toHaveValue('unspecified');
    await expect(dialog.getByText(/has no products/).first()).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByTestId('outcome-summary')).toHaveAttribute('aria-invalid', 'true');
    await dialog.getByLabel('Selectivity of outcome 1').selectOption('exclusive');
    await addMainProduct(dialog, 1, 'propanal', 'Propanal');
    await expect(dialog.getByTestId('outcome-summary')).toHaveText('1. exclusive · Propanal · under all conditions');
    await expect(dialog.getByTestId('outcome-summary')).not.toHaveAttribute('aria-invalid', 'true', { timeout: 60_000 });
    await expect(dialog.getByText(/has no products/)).toHaveCount(0, { timeout: 60_000 });
    expect(await axeProblems(page)).toEqual([]);
    await dialog.getByRole('heading', { name: 'Outcomes' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'reaction-editor-outcome-open-1280x800.png') });
    await dialog.getByRole('button', { name: 'Close outcome 1' }).click();
    await page.screenshot({ path: resolve(shotsDir(), 'reaction-editor-outcomes-1280x800.png') });

    // Published: the store's gate decides; nothing else is missing
    await dialog.getByLabel('Lifecycle').selectOption('published');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/^Saved/).first()).toBeVisible();

    // (3) no ERROR finding was added by the species or the reaction (the demo's own count is unchanged)
    await expect.poll(() => errorCount(page), { timeout: 60_000 }).toBe(errorsBefore);

    // in search and in the inspector
    await showRecord(page, 'r', 'Propan-1-ol ->');
    await expect(record(page).getByRole('heading', { level: 3, name: NAME })).toBeVisible();
    await expect(record(page)).not.toContainText(/\b[1-9]\d* errors?\b/i);

    // the Alcohols family page: Reactions of Alcohols, group To Aldehydes
    await openFamily(page, 'cls_alcohols', 'Alcohols');
    await page.locator('[data-virtual-list]').evaluate((el) => el.scrollTo(0, 0)); // the page opens at the selected reaction
    await expect(page.getByRole('heading', { level: 2, name: 'Reactions of Alcohols' })).toBeVisible();
    expect(await groupCount(page, /^Aldehydes\s*\d+\s*reactions?$/, 'To Aldehydes', 'last'), 'one more reaction to Aldehydes').toBe(toBefore + 1);
    await expect(page.getByRole('heading', { level: 3, name: 'To Aldehydes' })).toBeVisible();
    const card = cardOf(page, NAME);
    await expect(card).toBeVisible({ timeout: 60_000 });
    const images = card.getByRole('img');
    await expect(images).toHaveCount(2, { timeout: 60_000 });
    await expect(card.getByText('Dichloromethane, anhydrous')).toBeVisible();
    await expect(card.locator('[data-arrow]')).toContainText('PCC');
    await expect(card).toContainText('exclusive');
    await card.scrollIntoViewIfNeeded();
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'from-scratch-family-card-1280x800.png') });
    await card.getByText('Show full equation').click();
    const scheme = card.getByRole('group', { name: 'Full equation' });
    await expect(scheme).toBeVisible();
    await expect(scheme).toContainText('Propan-1-ol');
    await expect(scheme).toContainText('Propanal');
    await expect(scheme.locator('[data-equation-arrow] [data-equation-above]')).toContainText('PCC');
    await expect(scheme.locator('[data-equation-arrow] [data-equation-below]')).toContainText('Dichloromethane');
    await expect(scheme.locator('img').first()).toBeVisible({ timeout: 60_000 });
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'from-scratch-full-equation-1280x800.png') });

    // the Aldehydes family page: Preparation, From Alcohols
    await page.getByRole('button', { name: 'Overview' }).click();
    await hubGroup(page, 'cls_aldehydes').dblclick({ timeout: 30_000 });
    await expect(page.getByRole('region', { name: 'Family page: Aldehydes' })).toBeVisible();
    expect(await groupCount(page, /^Alcohols\s*\d+\s*reactions?$/, 'From Alcohols', 'first'), 'one more preparation from Alcohols').toBe(fromBefore + 1);
    await expect(page.getByRole('heading', { level: 3, name: 'From Alcohols' })).toBeVisible();
    await expect(cardOf(page, NAME)).toBeVisible({ timeout: 60_000 });

    // search finds it
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeVisible();
    await searchFor(page, 'r: propan-1-ol');
    await expect(palette(page).getByRole('option', { name: new RegExp(NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press('Escape');

    // (4) Undo three times: the reaction, then both species; nothing is left behind
    await page.getByRole('button', { name: `Undo Create reaction ${NAME}` }).click();
    await page.getByRole('button', { name: 'Undo Create species Propan-1-ol' }).click();
    await page.getByRole('button', { name: 'Undo Create species Propanal' }).click();
    await showDataset(page);
    expect(await recordCount(page, 'species')).toBe(before.species);
    expect(await recordCount(page, 'reaction')).toBe(before.reaction);
    await page.keyboard.press('Control+K');
    await searchFor(page, 'propan');
    await expect(palette(page).getByRole('option', { name: /Propan-1-ol|Propanal/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expectClean(seen);
  });
});

async function phoneWalk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).tap();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'New reaction' }).tap();
  const dialog = newDialog(page, 'reaction');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name (required)').fill('Phone outcome');
  await dialog.getByLabel('Scope (required)').selectOption('specific');
  await dialog.getByLabel('Add it as').selectOption('reactant');
  await dialog.getByLabel('Find a substance by name').fill('ethanol');
  await dialog.getByRole('list', { name: 'Substances found', exact: true }).getByRole('button', { name: 'Add Ethanol', exact: true }).tap();
  // a phone starts with the Outcomes section closed
  await dialog.getByRole('button', { name: /Outcomes/ }).tap();
  await dialog.getByRole('button', { name: 'Add outcome', exact: true }).tap();
  const row = dialog.getByTestId('outcome-row');
  await expect(row).toHaveCount(1);
  await dialog.getByLabel('Selectivity of outcome 1').selectOption('major');
  await addMainProduct(dialog, 1, 'ethanal', 'Ethanal', true);
  await expect(dialog.getByTestId('outcome-summary')).toHaveText('1. major · Ethanal · under all conditions');
  // stacked: the second field starts below the first
  const first = await dialog.getByLabel('Selectivity of outcome 1').boundingBox();
  const second = await dialog.getByLabel('Regiochemistry of outcome 1').boundingBox();
  expect((second?.y ?? 0) > (first?.y ?? 0) + (first?.height ?? 0) - 2, 'a phone outcome stacks its fields').toBe(true);
  const role = await dialog.getByRole('radio', { name: 'Main' }).locator('xpath=..').boundingBox();
  expect(role?.height ?? 0, 'a 44 px role button').toBeGreaterThanOrEqual(44);
  expect(await axeProblems(page)).toEqual([]);
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/phone-reaction-editor-outcomes-${device}.png` });
  await dialog.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('New reaction with one reactant, then an outcome with one product, Save', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await phoneWalk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('New reaction with one reactant, then an outcome with one product, Save', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await phoneWalk(page, 'iphone14');
  });
});
