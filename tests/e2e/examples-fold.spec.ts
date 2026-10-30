/**
 * Examples fold under their general reaction (step 7.3a C1 to C5), the STUDIO production build, every engine. A changed copy of the demo is
 * imported as the visitor's own data (the demo's general PCC oxidation gets two more examples):
 *  (1) the family page: the general card has a CLOSED "Examples (3)" under "Show full equation"; opened it lists each example's name (a
 *      link that selects it) and its own scheme; the examples are not cards of their own; the group's count says "(+ 3 examples)";
 *  (2) the Reactions view: Cards fold the same way and the count line counts cards; a name filter that matches an example but not the general
 *      reaction shows the example as a card of its own with "Example of <general>"; Compact says "3 examples" on the general row;
 *  (3) axe on each state, zero policy violations. Screenshots: examples-folded-closed-1280x800.png, examples-folded-open-1280x800.png,
 *      example-own-card-1280x800.png, reactions-compact-examples-1280x800.png.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { shotsDir } from './editor-kit';
import { importOwn } from './own-data-kit';
import { demoWithExamplesAndStages, EXAMPLE_ONE, GENERAL } from './examples-kit';

test.use({ actionTimeout: 60_000 });
const modes = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const reactionsView = (page: Page) => page.getByRole('region', { name: 'Reactions', exact: true });
const generalCard = (page: Page) => page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: GENERAL }) });

async function toastsAway(page: Page): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

test('the family page: a closed Examples (3) under the general reaction, opened it lists the examples', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, demoWithExamplesAndStages());
  await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
  await expect(page.getByRole('region', { name: /^Family page: Alcohols/ })).toBeVisible();
  await page.getByRole('button', { name: /^Aldehydes\s*\d+\s*reactions?/ }).last().click(); // "Turns into": the partner button of the group that holds the PCC reactions
  const card = generalCard(page);
  await expect(card).toBeVisible();
  const disclosure = card.locator('details[data-examples]');
  await expect(disclosure.locator('summary').first()).toHaveText('Examples (3)');
  expect(await disclosure.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false); // closed by default
  // the examples are not cards of the page
  await expect(page.getByRole('heading', { level: 4, name: EXAMPLE_ONE })).toHaveCount(0);
  expect(await axeProblems(page)).toEqual([]);
  await toastsAway(page);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/examples-folded-closed-1280x800.png` });
  await disclosure.locator('summary').first().click();
  await expect(disclosure.getByRole('heading', { level: 5 })).toHaveCount(3);
  await expect(disclosure.getByRole('button', { name: EXAMPLE_ONE })).toBeVisible();
  await expect(disclosure.locator('[role="group"]').first()).toBeVisible(); // its own scheme
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/examples-folded-open-1280x800.png` });
  await disclosure.getByRole('button', { name: EXAMPLE_ONE }).click();
  await expect(page.getByRole('complementary', { name: 'Inspector' }).getByRole('heading', { level: 3, name: EXAMPLE_ONE })).toBeVisible();
  await expectClean(seen);
});

test('the Reactions view: Cards and Compact fold, a filter that finds only an example shows it with "Example of"', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, demoWithExamplesAndStages());
  await modes(page).getByRole('button', { name: 'Reactions' }).click();
  const view = reactionsView(page);
  await expect(view.locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
  // 30 reactions: the demo's 27 and three new ones; three of them are examples of the general oxidation (the demo's own and the two new ones)
  await expect(view.getByText(/^27 reactions \(\+ 3 examples\)$/).first()).toBeVisible();
  const top = view.locator('xpath=.//*[@data-reaction-id][not(ancestor::details)]');
  expect(await top.count()).toBe(27);
  // a filter that matches one example and not its general reaction
  await view.getByRole('searchbox', { name: 'Find by name' }).fill('Zz propan-1-ol');
  const own = view.locator('article[data-reaction-id]').filter({ hasText: EXAMPLE_ONE });
  await expect(own).toHaveCount(1);
  await expect(own.getByText(/^Example of /)).toContainText(GENERAL);
  expect(await axeProblems(page)).toEqual([]);
  await toastsAway(page);
  await page.screenshot({ path: `${shotsDir()}/example-own-card-1280x800.png` });
  // the general reaction is matched by 'PCC' with all its examples: they fold
  await view.getByRole('searchbox', { name: 'Find by name' }).fill('PCC');
  const general = view.locator('article[data-reaction-id]').filter({ has: page.getByRole('heading', { level: 4, name: GENERAL }) });
  await expect(general.locator('details[data-examples] summary').first()).toHaveText('Examples (3)');
  // Compact
  await view.getByRole('searchbox', { name: 'Find by name' }).fill('');
  await view.getByRole('radio', { name: 'Compact' }).check();
  const row = view.locator('li[data-reaction-id]').filter({ has: page.getByRole('button', { name: GENERAL, exact: true }) }).first();
  await expect(row.getByText('3 examples')).toBeVisible();
  expect(await axeProblems(page)).toEqual([]);
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/reactions-compact-examples-1280x800.png` });
  await expectClean(seen);
});
