/**
 * The command palette end to end (step 5.8), Chromium against the PRODUCTION build (the CSP exists only there): Ctrl K opens it with
 * the input focused; typing finds records with what matched in words; Enter opens the record in the inspector and places it (a family
 * on the map, a reaction on its family page); a Unicode alias finds its record; ">" lists the commands and one runs; axe on the open
 * palette; zero policy violations, console errors and foreign requests. Screenshot to `screenshots/` (git-ignored).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, loadDemo, openApp, watch } from './kit';

const SHOTS = resolve(process.cwd(), 'screenshots');
const record = (page: Page) => page.getByRole('complementary', { name: 'Inspector' }).getByRole('article', { name: 'Record' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Search' });

async function openDemo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible();
}

/** The index loads shortly after the data (search debounce): ask until the palette answers instead of "Search is starting". */
async function search(page: Page, text: string): Promise<void> {
  const input = palette(page).getByRole('combobox');
  await input.fill(text);
  await expect(palette(page).getByRole('status')).not.toHaveText('Search is starting');
}

test.describe('the palette', () => {
  test('Ctrl K, type, Enter: the record opens in the inspector; axe; no violations', async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await watch(page);
    await openDemo(page);
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeVisible();
    await expect(palette(page).getByRole('combobox')).toBeFocused();
    await search(page, 'ethanol');
    await expect(palette(page).getByRole('option').first()).toBeVisible();
    await expect(palette(page).getByText(/^(Species|Reactions) \(\d+\)$/).first()).toBeVisible();
    await expect(palette(page).getByText(/^Matched the /).first()).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: resolve(SHOTS, 'palette-results.png') });
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();
    await expect(record(page)).toHaveAttribute('data-record-id', /./);
    await expect(record(page).getByRole('heading', { level: 3 }).first()).toContainText(/ethanol/i);
    await expectClean(seen);
  });

  test('a family is focused on the map and a reaction opens its family page at its card', async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await watch(page);
    await openDemo(page);
    await page.getByRole('button', { name: 'Search' }).click();
    await search(page, 'c: Alcohols');
    await palette(page).locator('[role="option"][data-record-id="cls_alcohols"]').click();
    await expect(record(page)).toHaveAttribute('data-record-id', 'cls_alcohols');
    await expect(page.locator('svg [data-node-id="cls_alcohols"]')).toBeVisible();

    await page.keyboard.press('Control+K');
    await search(page, 'r: PCC');
    await palette(page).getByRole('option').first().press('Enter');
    await expect(page.getByRole('region', { name: /^Family page:/ })).toBeVisible();
    await expect(record(page)).toHaveAttribute('data-record-id', /^rxn_/);
    await expectClean(seen);
  });

  test('a Unicode alias finds its record', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    await page.keyboard.press('Control+K');
    await search(page, 'α-H acidity');
    await expect(palette(page).locator('[role="option"][data-record-id="cpt_alpha-hydrogen-acidity"]')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(record(page)).toHaveAttribute('data-record-id', 'cpt_alpha-hydrogen-acidity');
    await expectClean(seen);
  });

  test('">" lists the commands and one runs: the List view; the others say why when they cannot', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    await page.keyboard.press('Control+K');
    await palette(page).getByRole('combobox').fill('>');
    await expect(palette(page).getByRole('option', { name: /^Replace with the demo dataset/ })).toBeVisible();
    await expect(palette(page).getByRole('option', { name: /^Overview.*Not available: the overview is already shown/ })).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    await palette(page).getByRole('combobox').fill('> list');
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();
    await expect(page.getByRole('table', { name: /families/i }).first()).toBeVisible();
    await expectClean(seen);
  });
});
