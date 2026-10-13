/**
 * The exam scope end to end (step 5.8), Chromium against the PRODUCTION build: the top bar's selector names every exam version in words;
 * choosing JEE Main dims and marks the demo's Beckmann rearrangement where it is shown (the Unanchored panel, the Unclassified family
 * page) and hides nothing; the choice survives a reload; axe with the scope chosen; zero policy violations. Screenshot of the overview
 * with a scope chosen to `screenshots/` (git-ignored).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, loadDemo, openApp, watch } from './kit';

const SHOTS = resolve(process.cwd(), 'screenshots');
const selector = (page: Page) => page.getByRole('combobox', { name: /Exam scope/ });
const MAIN = 'JEE Main, provisional, not verified';

async function openDemo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(page.getByRole('group', { name: /^Navigator: 16 hubs, \d+ arrows$/ })).toBeVisible();
}

test.describe('the exam scope', () => {
  test('the selector names the versions; JEE Main marks Beckmann and hides nothing; the choice survives a reload', async ({ page }) => {
    test.setTimeout(150_000);
    const seen = await watch(page);
    await openDemo(page);
    await expect(selector(page)).toHaveValue('');
    await expect(selector(page).locator('option')).toHaveText(['All (no exam scope)', 'JEE Advanced, provisional, not verified', MAIN]);

    await page.getByRole('button', { name: /^Unanchored reactions \(2\)/ }).click();
    const panel = page.getByRole('region', { name: 'Unanchored reactions' });
    await expect(panel.locator('[data-reaction-id]')).toHaveCount(2);
    await expect(panel.locator('[data-outside]')).toHaveCount(0);

    await selector(page).selectOption({ label: MAIN });
    await expect(panel.locator('[data-reaction-id]')).toHaveCount(2); // nothing is hidden
    await expect(panel.locator('[data-outside]')).toHaveCount(1);
    await expect(panel.locator('[data-reaction-id="rxn_cyclohexanone-oxime-beckmann"]')).toContainText('outside JEE Main');
    await expect(page.locator('svg [data-node-id]')).toHaveCount(16);
    expect(await axeProblems(page)).toEqual([]);
    mkdirSync(SHOTS, { recursive: true });
    await panel.getByRole('button', { name: 'Close' }).click();
    await page.screenshot({ path: resolve(SHOTS, 'overview-scope-main.png') });

    // the choice is saved in uiState and comes back after a reload
    await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByRole('group', { name: /^Navigator: 16 hubs, \d+ arrows$/ })).toBeVisible();
    await expect(selector(page)).toHaveValue('exv_jee-main-2026');

    // the Unclassified family page: the Beckmann card is marked, no card is hidden
    await page.locator('svg [data-box="unclassified"]').dblclick();
    await page.getByRole('region', { name: /^Family page: Unclassified/ }).waitFor();
    const beckmann = page.locator('article[data-reaction-id="rxn_cyclohexanone-oxime-beckmann"]').first();
    await expect(beckmann).toHaveAttribute('data-outside', '');
    await expect(beckmann.getByText('outside JEE Main')).toBeVisible();
    await selector(page).selectOption({ label: 'All (no exam scope)' });
    await expect(page.locator('article[data-outside]')).toHaveCount(0);
    await expectClean(seen);
  });

  test('the palette can choose the exam scope, and Undo / Redo say why they cannot act', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('button', { name: 'Redo' })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Control+K');
    const dialog = page.getByRole('dialog', { name: 'Search' });
    await dialog.getByRole('combobox').fill('> exam main');
    await expect(dialog.getByRole('option', { name: new RegExp(`Choose the exam scope: ${MAIN}`) })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(selector(page)).toHaveValue('exv_jee-main-2026');
    await expectClean(seen);
  });
});
