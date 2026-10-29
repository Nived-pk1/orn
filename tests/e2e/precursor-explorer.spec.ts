/**
 * The Precursors view (step 7.2a), PRODUCTION Studio build, every engine: the mode opens with its prompt; a target is chosen through the
 * search; "Made directly from"; a route search with a start (routes, steps, "Show the reaction", a reaction link to the inspector); Cancel;
 * the no-route words; an exam scope marks the outside reaction and "Only <exam version> reactions" leaves no route; the inspector's "How to
 * make it"; the choices survive a reload; axe on each state. Screenshots: precursors-direct-1280x800.png, precursors-routes-1280x800.png,
 * precursors-no-route-1280x800.png.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { openDemo, pane, record, shotsDir, showSpecies } from './editor-kit';

test.use({ actionTimeout: 60_000 });

const modes = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const view = (page: Page) => page.getByRole('region', { name: 'Precursors', exact: true });
const found = (page: Page) => view(page).getByRole('region', { name: 'Routes found' });

async function openPrecursors(page: Page): Promise<void> {
  await modes(page).getByRole('button', { name: 'Precursors' }).click();
  await expect(page.getByRole('heading', { name: 'Make a compound' })).toBeVisible();
}

/** Types into a search box until the index answers (it loads shortly after the data), then clicks the hit. */
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

async function dismissToasts(page: Page): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

const search = (page: Page) => view(page).getByRole('button', { name: 'Search', exact: true });

test.describe('Studio, desktop', () => {
  test('a target, what makes it directly, and a route search with a start', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await openPrecursors(page);
    await expect(page.getByText('Choose the compound you want to make.')).toBeVisible();
    await pick(page, 'Compound to make', 'propan-2-ol', 'Choose Propan-2-ol');
    await expect(view(page).getByText('Making: Propan-2-ol')).toBeVisible();
    await expect(view(page).getByRole('heading', { name: 'Made directly from' })).toBeVisible();
    const blocks = view(page).getByRole('heading', { name: /^From .+, \d+ reactions?$/ });
    expect(await blocks.count()).toBeGreaterThan(0);
    await expect(view(page).locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
    expect(await axeProblems(page)).toEqual([]);
    await dismissToasts(page);
    await page.screenshot({ path: `${shotsDir()}/precursors-direct-1280x800.png` });

    await pick(page, 'Start from (optional)', 'ethanol', 'Start from Ethanol');
    await expect(view(page).getByRole('checkbox', { name: 'Only the listed starting materials' })).toBeEnabled();
    await expect(view(page).getByRole('combobox', { name: 'Up to' })).toHaveValue('5');
    await search(page).click();
    await expect(found(page).getByText('2 routes found')).toBeVisible();
    const routes = found(page).getByRole('list', { name: 'Routes' }).locator(':scope > li');
    await expect(routes).toHaveCount(2);
    const first = routes.first();
    await expect(first.getByText('2 steps from Ethanol')).toBeVisible();
    await expect(first.getByText('1. Ethanol → Ethanal')).toBeVisible();
    await expect(first.getByText('2. Ethanal → Propan-2-ol')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Announcements' })).toHaveText('2 routes found');
    // "Show the reaction" expands that step's card; the reaction's name opens the inspector
    await first.getByRole('button', { name: 'Show the reaction' }).first().click();
    await expect(first.locator('article[data-reaction-id]')).toHaveCount(1);
    const id = await first.locator('article[data-reaction-id]').getAttribute('data-reaction-id');
    await first.locator('article[data-reaction-id]').getByRole('button').first().click();
    await expect(record(page)).toHaveAttribute('data-record-id', id as string);
    await first.getByRole('button', { name: 'Show the reaction' }).first().click();
    await expect(first.locator('article[data-reaction-id]')).toHaveCount(0);
    expect(await axeProblems(page)).toEqual([]);
    await dismissToasts(page);
    await page.screenshot({ path: `${shotsDir()}/precursors-routes-1280x800.png` });
    await expectClean(seen);
  });

  test('Cancel stops a search and says so; Search works again after it', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await openPrecursors(page);
    await pick(page, 'Compound to make', 'propan-2-ol', 'Choose Propan-2-ol');
    // one task: Search is pressed and, as soon as React shows "Searching for routes...", so is Cancel (the engine takes a round trip)
    await search(page).evaluate(async (button) => {
      (button as HTMLButtonElement).click();
      for (let hop = 0; hop < 20; hop += 1) {
        const cancel = [...document.querySelectorAll('button')].find((one) => one.textContent === 'Cancel');
        if (cancel !== undefined) return void (cancel as HTMLButtonElement).click();
        await Promise.resolve();
      }
    });
    await expect(found(page).getByText('The search was stopped.')).toBeVisible();
    await expect(view(page).getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    await search(page).click();
    await expect(found(page).getByText(/^\d+ routes? found$/)).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('no route: the words, and fewer steps', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await openPrecursors(page);
    await pick(page, 'Compound to make', 'benzene', 'Choose Benzene');
    await expect(view(page).getByText('No reaction in the data makes Benzene directly.')).toBeVisible();
    await search(page).click();
    await expect(found(page).getByText('No route to Benzene within 5 steps.')).toBeVisible();
    await view(page).getByRole('combobox', { name: 'Up to' }).selectOption('1');
    await search(page).click();
    await expect(found(page).getByText('No route to Benzene within 1 step.')).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    await dismissToasts(page);
    await page.screenshot({ path: `${shotsDir()}/precursors-no-route-1280x800.png` });
    await expectClean(seen);
  });

  test('an exam scope marks the outside reaction, and "Only <exam version> reactions" leaves no route', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await page.getByRole('combobox', { name: /Exam scope/ }).selectOption({ label: 'JEE Main, provisional, not verified' });
    await openPrecursors(page);
    await pick(page, 'Compound to make', 'caprolactam', 'Choose ε-Caprolactam');
    await expect(view(page).locator('[data-outside]').first()).toContainText('outside JEE Main');
    // 7.2b A2: only the drawings fade, so the text keeps its contrast and axe runs on this screen too
    expect(await axeProblems(page)).toEqual([]);
    await search(page).click();
    await expect(found(page).getByText('1 route found')).toBeVisible();
    await view(page).getByRole('checkbox', { name: /^Only .* reactions$/ }).check();
    await search(page).click();
    await expect(found(page).getByText('No route to ε-Caprolactam within 5 steps.')).toBeVisible();
    await expectClean(seen);
  });

  test('the inspector\'s "How to make it" opens Precursors for that compound, with its saved route', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await showSpecies(page, 'spc_phenol', 'Phenol');
    await pane(page).getByRole('button', { name: 'How to make it' }).click();
    await expect(page.getByRole('heading', { name: 'Make a compound' })).toBeVisible();
    await expect(view(page).getByText('Making: Phenol')).toBeVisible();
    const saved = view(page).getByRole('region', { name: 'Saved routes' });
    await expect(saved.getByRole('heading', { name: 'Aniline → phenol' })).toBeVisible();
    await expect(saved.getByText('1. Aniline → Benzenediazonium chloride')).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('the choices survive a reload: target, a starting material, steps and the search', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await openPrecursors(page);
    await pick(page, 'Compound to make', 'phenol', 'Choose Phenol');
    await pick(page, 'Start from (optional)', 'aniline', 'Start from Aniline');
    await view(page).getByRole('combobox', { name: 'Up to' }).selectOption('3');
    await search(page).click();
    await expect(found(page).getByText(/^\d+ routes? found$/)).toBeVisible();
    await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
    await page.waitForTimeout(1000);
    await page.reload();
    await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible();
    await openPrecursors(page);
    await expect(view(page).getByText('Making: Phenol')).toBeVisible();
    await expect(view(page).getByRole('list', { name: 'Starting materials' })).toContainText('Aniline');
    await expect(view(page).getByRole('combobox', { name: 'Up to' })).toHaveValue('3');
    // the result is not saved: it is made again from the saved query
    await expect(found(page).getByText(/^\d+ routes? found$/)).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });
});
