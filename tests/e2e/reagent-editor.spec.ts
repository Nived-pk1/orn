/**
 * The reagent editor end to end (step 6.2b part 3; ADR-040 addendum, decisions D3, D4, D5), PRODUCTION build, every engine:
 *  (1) the demo has no silver nitrate or ammonia species, so the test creates them first; then New reagent "Tollens' reagent" with those two
 *      as components, the family oxidant and one profile "ammoniacal" with the alias "Tollens' reagent"; Save; search finds it by the
 *      alias and by the profile label; the inspector shows it;
 *  (2) edit potassium permanganate: add a profile with an alias, Save; search finds the alias; Undo removes it again;
 *  (3) a reagent cannot take a reagent built from it as a component: the picker shows the reason and no button.
 * Axe on the editor; zero policy violations. Screenshot: screenshots/reagent-editor-1280x800.png.
 */
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { editorDialog, openDemo, openNamesEditor, palette, record, searchFor, shotsDir, showRecord } from './editor-kit';

const TOLLENS = "Tollens' reagent";
const newReagentDialog = (page: Page) => page.getByRole('dialog', { name: 'New reagent' });

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

async function startNewReagent(page: Page): Promise<void> {
  await workbench(page);
  await page.getByRole('button', { name: 'New reagent', exact: true }).click();
  await expect(newReagentDialog(page)).toBeVisible();
}

async function addComponent(page: Page, search: string, name: string): Promise<void> {
  const dialog = newReagentDialog(page);
  await dialog.getByLabel('Find a component by name').fill(search);
  await dialog.getByRole('list', { name: 'Components found' }).getByRole('button', { name: `Add ${name}`, exact: true }).click();
  await expect(dialog.getByRole('list', { name: 'Components', exact: true })).toContainText(name);
}

async function findsByName(page: Page, query: string, name: RegExp): Promise<void> {
  await page.keyboard.press('Control+K');
  await expect(palette(page)).toBeVisible();
  await searchFor(page, query);
  await expect(palette(page).getByRole('option', { name })).toBeVisible({ timeout: 60_000 });
}

test.describe('the reagent editor', () => {
  test("New reagent \"Tollens' reagent\": two components, the family oxidant, a profile with an alias; Save; search finds it by the alias", async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await createSpecies(page, 'Silver nitrate');
    await createSpecies(page, 'Ammonia');
    await startNewReagent(page);
    const dialog = newReagentDialog(page);
    await dialog.getByLabel('Canonical name (required)').fill(TOLLENS);
    await addComponent(page, 'silver', 'Silver nitrate');
    await addComponent(page, 'ammonia', 'Ammonia');
    // one species OR components: with components, the backing-species picker is gone and the reason is said
    await expect(dialog.getByLabel('Find the backing species by name')).toHaveCount(0);
    await expect(dialog.getByText(/remove the components to choose a species/)).toBeVisible();
    await dialog.getByRole('checkbox', { name: 'Oxidant' }).check();
    await dialog.getByRole('button', { name: 'Add profile' }).click();
    await dialog.getByLabel('Profile 1 label').fill('ammoniacal');
    await dialog.getByRole('button', { name: 'Add alias to profile 1' }).click();
    await dialog.getByLabel('Profile 1 alias 1', { exact: true }).fill(TOLLENS);
    expect(await axeProblems(page)).toEqual([]);
    await dialog.getByLabel('Profile 1 label').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'reagent-editor-1280x800.png') });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();

    await findsByName(page, 'g: tollens', /^Tollens' reagent/);
    await page.keyboard.press('Escape');
    // the profile's label is searchable too: the hit is the reagent
    await findsByName(page, 'g: ammoniacal', /Tollens' reagent/);
    await palette(page).getByRole('option', { name: /Tollens' reagent/ }).first().click();
    await expect(record(page).getByRole('heading', { level: 3, name: TOLLENS })).toBeVisible();
    await expectClean(seen);
  });

  test('edit potassium permanganate: add a profile with an alias, Save, search finds the alias, Undo', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await showRecord(page, 'g', 'potassium permanganate', 'rgt_potassium-permanganate');
    await openNamesEditor(page, 'Potassium permanganate');
    const dialog = editorDialog(page, 'Potassium permanganate');
    await expect(dialog.getByLabel('Profile 1 label')).toHaveValue("Baeyer's reagent");
    await dialog.getByRole('button', { name: 'Add profile' }).click();
    await dialog.getByLabel('Profile 3 label').fill('Neutral, aqueous');
    await dialog.getByRole('button', { name: 'Add alias to profile 3' }).click();
    await dialog.getByLabel('Profile 3 alias 1', { exact: true }).fill('Wagner oxidation');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();

    await findsByName(page, 'g: wagner', /Potassium permanganate/);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Undo Edit reagent of Potassium permanganate' }).click();
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeVisible();
    await searchFor(page, 'g: wagner');
    await expect(palette(page).getByRole('option', { name: /Potassium permanganate/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expectClean(seen);
  });

  test('a reagent built from another cannot be its component: the reason is shown and there is no Add button', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await startNewReagent(page);
    const dialog = newReagentDialog(page);
    await dialog.getByLabel('Canonical name (required)').fill('Cycle A');
    await addComponent(page, 'lindlar', "Lindlar's catalyst");
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    // Lindlar's catalyst is now a component OF Cycle A (and is built from components itself): Cycle A cannot become one of its components
    await showRecord(page, 'g', 'lindlar', 'rgt_lindlar');
    await openNamesEditor(page, "Lindlar's catalyst");
    const edit = editorDialog(page, "Lindlar's catalyst");
    await edit.getByLabel('Find a component by name').fill('cycle a');
    const found = edit.getByRole('list', { name: 'Components found' });
    await expect(found).toContainText('Cannot be chosen: Cycle A is already built from this reagent, so it cannot be one of its components: that would make a cycle.');
    await expect(found.getByRole('button', { name: 'Add Cycle A' })).toHaveCount(0);
    await edit.getByRole('button', { name: 'Close (keeps the draft)' }).click();
    await expectClean(seen);
  });
});
