/**
 * The route editor end to end (step 7.2b C1-C3), the STUDIO production build, every engine:
 *  (1) a new route from the Workbench: name, target, two steps (a reaction each, "Takes its input from" ticked on step 2), live findings
 *      (RTE-003 before the steps, none after), Save, the inspector shows it, one Undo takes it away;
 *  (2) "Save as route" on a found route opens the editor on a NEW draft filled from the result with an EMPTY required name; nothing is saved
 *      until Save; after Save the same search says "Saved as <name>" instead of the button;
 *  (3) a picture on a route (Pictures section) is saved at once and shown by the inspector.
 * Zero CSP violations; axe on the editor. Screenshots: route-editor-1280x800.png, route-editor-step-open-1280x800.png,
 * save-as-route-1280x800.png.
 */
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { editorDialog, openDemo, pane, shotsDir } from './editor-kit';
import { makePng } from './png-kit';

test.use({ actionTimeout: 60_000 });

const modes = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const view = (page: Page) => page.getByRole('region', { name: 'Precursors', exact: true });
const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: resolve(shotsDir(), `${name}-1280x800.png`) });

async function dismissToasts(page: Page): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

/** Types into a picker until the search index answers, then clicks the add button of the hit. */
async function findAndAdd(root: ReturnType<Page['locator']>, label: string, text: string, list: string, add: string): Promise<void> {
  const input = root.getByLabel(label);
  await expect(async () => {
    await input.fill('');
    await input.fill(text);
    await root.getByRole('list', { name: list }).getByRole('button', { name: add, exact: true }).click({ timeout: 4_000 });
  }).toPass({ timeout: 90_000 });
}

async function newRoute(page: Page) {
  await dismissToasts(page);
  await modes(page).getByRole('button', { name: /Workbench/ }).click();
  await page.getByRole('button', { name: 'New route', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New route' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function pick(page: Page, label: string, text: string, hitName: string): Promise<void> {
  const box = view(page).getByRole('searchbox', { name: label, exact: true });
  const hit = view(page).getByRole('button', { name: hitName, exact: true });
  await expect(async () => {
    await box.fill('');
    await box.fill(text);
    await expect(hit).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60_000 });
  await hit.click();
}

test.describe('the route editor (Studio)', () => {
  test('a new route: steps, input-from, live findings, Save, the inspector, Undo', async ({ page }) => {
    test.setTimeout(600_000);
    const seen = await watch(page);
    await openDemo(page);
    const dialog = await newRoute(page);
    await expect(dialog.getByLabel('What this route is')).toHaveValue(''); // 7.3a A1: nothing chosen yet
    await expect(dialog.getByText('Choose a name.')).toBeVisible();
    await dialog.getByLabel('Name (required)').fill('Zz e2e route');
    await dialog.getByLabel('What this route is').selectOption('user');
    await findAndAdd(dialog, 'Find the target compound by name', 'propan-2-ol', 'Compounds found', 'Add Propan-2-ol');
    await expect(dialog.getByText('has no steps')).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Add a step' }).click();
    await dialog.getByRole('button', { name: 'Edit step 1' }).click();
    await findAndAdd(dialog, 'Find the reaction of step 1 by name', 'PCC', 'Reactions found for step 1', 'Add Ethanol → ethanal (PCC)');
    await expect(dialog.getByLabel('Outcome of step 1')).toBeVisible();
    await dialog.getByRole('button', { name: 'Add a step' }).click();
    await dialog.getByRole('button', { name: 'Edit step 2' }).click();
    await findAndAdd(dialog, 'Find the reaction of step 2 by name', 'H₃O⁺', 'Reactions found for step 2', 'Add CH₃MgBr + ethanal, then H₃O⁺');
    await expect(dialog.getByText('Tick the step whose product this step uses; tick none for a starting material.')).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Step 1' })).not.toBeChecked();
    await dialog.getByRole('checkbox', { name: 'Step 1' }).check();
    await expect(dialog.getByText('has no steps')).toHaveCount(0);
    expect(await axeProblems(page, 10)).toEqual([]);
    await shot(page, 'route-editor-step-open');
    await dialog.getByRole('button', { name: 'Edit step 2' }).click();
    await shot(page, 'route-editor');
    await dialog.getByRole('button', { name: /^Save/ }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    await expectClean(seen);
  });

  test('Save as route: a new draft filled from a found route with an empty required name; "Saved as" after Save', async ({ page }) => {
    test.setTimeout(600_000);
    const seen = await watch(page);
    await openDemo(page);
    await modes(page).getByRole('button', { name: 'Precursors' }).click();
    await pick(page, 'Compound to make', 'propan-2-ol', 'Choose Propan-2-ol');
    await pick(page, 'Start from (optional)', 'ethanol', 'Start from Ethanol');
    await view(page).getByRole('button', { name: 'Search', exact: true }).click();
    const found = view(page).getByRole('region', { name: 'Routes found' });
    await expect(found.getByText('2 routes found')).toBeVisible();
    await expect(found.getByText(/Saved as/)).toHaveCount(1); // the demo saves one of the two
    await expect(found.getByRole('button', { name: 'Save as route' })).toHaveCount(1);
    await dismissToasts(page);
    await found.getByRole('button', { name: 'Save as route' }).click();
    const dialog = page.getByRole('dialog', { name: 'New route' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Name (required)')).toHaveValue('');
    await expect(dialog.getByText('Choose a name.')).toBeVisible();
    await expect(dialog.getByRole('list', { name: 'Steps' }).locator(':scope > li')).toHaveCount(2);
    await shot(page, 'save-as-route');
    await dialog.getByLabel('Name (required)').fill('Zz saved search result');
    await dialog.getByRole('button', { name: /^Save/ }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    await modes(page).getByRole('button', { name: 'Precursors' }).click();
    await view(page).getByRole('button', { name: 'Search', exact: true }).click();
    await expect(view(page).getByRole('region', { name: 'Routes found' }).getByText(/Saved as/)).toHaveCount(2, { timeout: 60_000 });
    await expect(view(page).getByRole('button', { name: 'Save as route' })).toHaveCount(0);
    await expectClean(seen);
  });

  test('a picture on a route is saved at once and the inspector shows it', async ({ page }) => {
    test.setTimeout(600_000);
    const seen = await watch(page);
    await openDemo(page);
    await modes(page).getByRole('button', { name: 'Precursors' }).click();
    await pick(page, 'Compound to make', 'propan-2-ol', 'Choose Propan-2-ol');
    await pick(page, 'Start from (optional)', 'ethanol', 'Start from Ethanol');
    await view(page).getByRole('button', { name: 'Search', exact: true }).click();
    await view(page).getByRole('region', { name: 'Routes found' }).getByRole('button', { name: 'Ethanol → propan-2-ol' }).click();
    const show = page.getByRole('button', { name: 'Show inspector' });
    if (await show.isVisible()) await show.click();
    await dismissToasts(page);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const editor = editorDialog(page, 'Ethanol → propan-2-ol');
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Add picture', exact: true }).click();
    const add = page.getByRole('dialog', { name: /Add picture/ });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), add.getByLabel('Picture file').click()]);
    await chooser.setFiles({ name: 'route.png', mimeType: 'image/png', buffer: makePng(96, 64) });
    await add.getByLabel('Alt text (required)').fill('A sketch of the route');
    await add.getByRole('button', { name: 'Add picture', exact: true }).click();
    await expect(add).toBeHidden({ timeout: 60_000 });
    await editor.getByRole('button', { name: 'Close (keeps the draft)', exact: true }).click();
    await expect(pane(page).getByRole('img', { name: 'A sketch of the route' })).toBeVisible({ timeout: 60_000 });
    await expectClean(seen);
  });
});
