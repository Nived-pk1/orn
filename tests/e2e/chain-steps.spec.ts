/**
 * Step C (C5, C6): the STUDIO build over tests/fixtures/chain-line (a line of 7 families, a bush of 6 two-step chains).
 * "From A to B": with 3 steps there is no chain from Line 01 to Line 06; choosing 5 steps shows the 5-step chain (saved: it survives a reload);
 * the bush pair says "5 of 6 chains" and keeps the quiet line. Precursors: a 6-level walk offers "Continue from here" on level 5; it starts a new
 * search with that compound and Back returns to the previous search. Desktop and Pixel 7 (Chromium, WebKit; Firefox on desktop).
 * Screenshots: screenshots/C/.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, watch } from './kit';
import { openMapDesktop, openMapPhone } from './map-layout-kit';
import { clickToolbar } from './map-toolbar-kit';

const CHAIN_LINE = readFileSync(resolve(process.cwd(), 'tests/fixtures/chain-line/chain-line.orn.json'));
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const SHOTS = 'screenshots/C';
const panel = (page: Page) => page.getByRole('complementary', { name: 'From A to B' });

async function shot(page: Page, name: string): Promise<void> {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${name}-light.png` });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${SHOTS}/${name}-dark.png` });
  await page.emulateMedia({ colorScheme: 'light' });
}

async function choose(page: Page, from: string, to: string): Promise<void> {
  await panel(page).getByRole('combobox', { name: 'From' }).selectOption({ label: from });
  await panel(page).getByRole('combobox', { name: 'To' }).selectOption({ label: to });
}

test.describe('From A to B: Steps (desktop)', () => {
  test('5 steps shows the 5-step chain, it is saved, and a bush says "5 of 6 chains"', async ({ page }) => {
    test.setTimeout(400_000);
    const seen = await watch(page);
    await openMapDesktop(page, CHAIN_LINE);
    await clickToolbar(page, 'From A to B');
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole('radio', { name: '3' })).toBeChecked();
    await choose(page, 'Line 01', 'Line 06');
    await expect(panel(page).getByText('No chain of 3 steps or fewer.')).toBeVisible();
    await panel(page).getByRole('radio', { name: '5' }).check({ force: true });
    const first = panel(page).getByRole('list', { name: 'Chains' }).locator('> li').first();
    await expect(first).toContainText(/5 steps · \d+ reactions?/);
    await expect(page.locator('svg [data-layer="edges"] [data-edge-id]')).toHaveCount(5);
    await expect(panel(page).getByText('A chain of families: check that each step fits your compound.')).toBeVisible();
    await choose(page, 'Bush g1', 'Bush g2');
    await expect(panel(page).getByText('5 of 6 chains')).toBeVisible();
    await shot(page, 'steps-n-of-n-desktop');
    await choose(page, 'Line 01', 'Line 06');
    await shot(page, 'steps-5-chain-desktop');
    await page.waitForTimeout(2500); // the choice is written after a short pause
    await page.reload();
    await expect(page.getByRole('group', { name: /^Navigator:/ })).toBeVisible({ timeout: 90_000 });
    await clickToolbar(page, 'From A to B');
    await expect(panel(page).getByRole('radio', { name: '5' })).toBeChecked();
    await expectClean(seen);
  });
});

test.describe('From A to B: Steps (Pixel 7)', () => {
  test.use({ ...PIXEL });
  test('on a phone the Steps choice and "5 of 6 chains" are in the sheet', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(400_000);
    await openMapPhone(page, CHAIN_LINE);
    await page.getByRole('button', { name: 'From A to B' }).tap();
    await expect(panel(page)).toBeVisible();
    await choose(page, 'Bush g1', 'Bush g2');
    await panel(page).getByRole('radio', { name: '5' }).check({ force: true });
    await expect(panel(page).getByText('5 of 6 chains')).toBeVisible();
    await shot(page, 'steps-n-of-n-pixel7');
    await choose(page, 'Line 01', 'Line 06');
    await expect(panel(page).getByRole('list', { name: 'Chains' }).locator('> li').first()).toContainText(/5 steps/);
    await shot(page, 'steps-5-chain-pixel7');
  });
});

test.describe('Precursors: Continue from here (desktop)', () => {
  test('a 6-level walk offers it on level 5; it starts a new search and Back returns to the previous one', async ({ page }) => {
    test.setTimeout(400_000);
    const seen = await watch(page);
    await openMapDesktop(page, CHAIN_LINE);
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Precursors' }).click();
    const view = page.getByRole('region', { name: 'Precursors', exact: true });
    const box = view.getByRole('searchbox', { name: 'Compound to make', exact: true });
    const hit = view.getByRole('button', { name: 'Choose Line 07', exact: true });
    await expect(async () => {
      await box.fill('');
      await box.fill('Line 07');
      await expect(hit).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 60_000 });
    await hit.click();
    await view.getByRole('button', { name: 'Search', exact: true }).click();
    const found = view.getByRole('region', { name: 'Routes found' });
    await expect(found.getByText(/5 steps from Line 02/)).toBeVisible({ timeout: 60_000 });
    const more = found.getByRole('button', { name: 'Continue from here' });
    await expect(more).toHaveCount(1);
    await shot(page, 'continue-from-here-desktop');
    await more.click();
    await expect(view.getByText('Making: Line 02')).toBeVisible();
    await expect(found.getByText(/\d steps? from Line 01/).first()).toBeVisible({ timeout: 60_000 });
    await page.goBack();
    await expect(view.getByText('Making: Line 07')).toBeVisible();
    await expect(found.getByText(/5 steps from Line 02/)).toBeVisible({ timeout: 60_000 });
    await expectClean(seen);
  });
});
