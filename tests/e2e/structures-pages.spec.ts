/**
 * Step 8.5h B1, PRODUCTION build, every engine: the ONE app-wide "Structures" choice can be changed from every page that draws structures
 * (Reactions, Precursors, a reagent, a named reaction, a mechanism and a chapter page, and Settings), a change on one page is the same on the
 * others and survives a reload; mechanism steps follow it (Full shows as Condensed and says so). On a phone it is one menu button.
 */
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, loadDemo, openApp, openPhoneApp, watch } from './kit';

const FULL_LINE = 'Full shows as condensed here: the arrows need the mapped atoms only';
const ALDOL = 'Aldol addition of ethanal';
const rail = (page: Page, name: string): Locator => page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name, exact: true });
const group = (page: Page): Locator => page.getByRole('radiogroup', { name: 'Structures' });
const chosen = async (page: Page, name: string): Promise<void> => void (await expect(group(page).getByRole('radio', { name })).toBeChecked());
const choose = async (page: Page, name: string): Promise<void> => {
  await group(page).getByRole('radio', { name }).check({ force: true });
  await chosen(page, name);
};
const region = (page: Page, name: string): Locator => page.getByRole('region', { name, exact: true });

async function openMechanism(page: Page): Promise<Locator> {
  await rail(page, 'Mechanisms').click();
  const view = region(page, 'Mechanisms');
  await view.getByRole('list', { name: 'Mechanisms' }).getByRole('button', { name: ALDOL }).click();
  await expect(view.getByRole('heading', { level: 2, name: ALDOL })).toBeVisible();
  return view;
}

/** The text of the drawings of a mechanism step's pictures, as one length: Condensed draws more (carbon labels) than Skeletal. */
const drawnLength = (step: Locator): Promise<string> => step.locator('svg[role="img"] image').evaluateAll((images) => images.map((image) => `${image.getAttribute('width')}x${image.getAttribute('height')}`).join(' '));

test('every page that draws structures has the one choice; it holds across pages and a reload; mechanism steps follow it', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);

  await rail(page, 'Reactions').click();
  await expect(region(page, 'Reactions')).toBeVisible();
  await chosen(page, 'Skeletal');
  await choose(page, 'Condensed');
  expect(await axeProblems(page), 'axe: Reactions').toEqual([]);

  // the family page's own control shows the same setting, and a change there comes back to Reactions
  await rail(page, 'Map').click();
  await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
  await expect(page.getByRole('region', { name: /^Family page: Alcohols/ })).toBeVisible();
  await chosen(page, 'Condensed');
  await choose(page, 'Full');
  await rail(page, 'Reactions').click();
  await chosen(page, 'Full');

  await rail(page, 'Precursors').click();
  await chosen(page, 'Full');

  await rail(page, 'Reagents').click();
  await region(page, 'Reagents').locator('[data-reagent-id] button').first().click();
  await chosen(page, 'Full');
  expect(await axeProblems(page), 'axe: a reagent page').toEqual([]);

  await rail(page, 'Named reactions').click();
  await region(page, 'Named reactions').getByRole('button', { name: 'Aldol reaction' }).click();
  await chosen(page, 'Full');
  expect(await axeProblems(page), 'axe: a named reaction page').toEqual([]);

  await rail(page, 'Chapters').click();
  await region(page, 'Chapters').locator('[data-chapter-id] button').first().click();
  await chosen(page, 'Full');
  expect(await axeProblems(page), 'axe: a chapter page').toEqual([]);

  const view = await openMechanism(page);
  await chosen(page, 'Full');
  const step = view.locator('[data-step="1"]').first();
  await expect(step.getByRole('img', { name: /^Drawing of step 1/ })).toBeVisible({ timeout: 90_000 });
  await expect(step.getByText(FULL_LINE)).toBeVisible();
  const condensed = await drawnLength(step);
  await choose(page, 'Skeletal');
  await expect(step.getByText(FULL_LINE)).toHaveCount(0);
  await expect.poll(() => drawnLength(step), { timeout: 60_000 }).not.toBe(condensed);
  await choose(page, 'Condensed');
  await expect.poll(() => drawnLength(step), { timeout: 60_000 }).toBe(condensed);
  await expect(step.getByText(FULL_LINE)).toHaveCount(0);
  expect(await axeProblems(page), 'axe: a mechanism page').toEqual([]);

  await rail(page, 'Settings').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await chosen(page, 'Condensed');
  expect(await axeProblems(page), 'axe: Settings').toEqual([]);
  await choose(page, 'Full');

  await page.waitForTimeout(1_000); // the choice is saved after a short pause
  await page.reload();
  await expect(rail(page, 'Reactions')).toBeVisible({ timeout: 90_000 });
  await rail(page, 'Reactions').click();
  await chosen(page, 'Full');
  await expectClean(seen);
});

const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('the Reactions page has one "Structures" menu button that changes the setting', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Pixel 7 is a Chromium device');
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openPhoneApp(page);
    await loadDemo(page);
    await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Explore' }).tap();
    await page.getByRole('combobox', { name: 'Show:' }).selectOption({ label: 'Reactions' });
    const view = region(page, 'Reactions');
    await view.getByRole('button', { name: 'Structures: Skeletal' }).tap();
    await page.getByRole('menuitemradio', { name: 'Condensed' }).or(page.getByRole('menuitem', { name: 'Condensed' })).tap();
    await expect(view.getByRole('button', { name: 'Structures: Condensed' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll').toBe(true);
    expect(await axeProblems(page, 10)).toEqual([]);
    await expectClean(seen);
  });
});
