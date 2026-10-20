/**
 * The STUDIO edition's own marks (studio step E1, ADR-041), PRODUCTION build (the Studio server of playwright.config.ts), every engine:
 * the page title is "ORN Studio", the header carries the "Studio" marker beside the title (desktop; the phone's short title too), the editors'
 * entry points are there (Workbench in the navigation, Edit in the inspector, Undo and Redo on the bar), and the study dataset update notice
 * is NEVER shown (the owner's working copy is never replaced by a prompt). Screenshot: studio-header-1280x800.png (git-ignored).
 */
import { resolve } from 'node:path';
import { devices } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, loadDemo, openApp, watch } from './kit';
import { pane, shotsDir, showRecord } from './editor-kit';

const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

test('desktop: title "ORN Studio", the Studio marker, the editors there, no update notice', async ({ page }) => {
  test.setTimeout(240_000);
  const seen = await watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page).toHaveTitle('ORN Studio');
  await openApp(page);
  await loadDemo(page);
  const header = page.locator('header');
  await expect(header.locator('[data-edition-marker]')).toHaveText('Studio');
  await expect(page.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Workbench' })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Undo' })).toBeVisible();
  await showRecord(page, 's', 'ethanol', 'spc_ethanol');
  await expect(pane(page).getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByText(/A newer version of the study dataset/)).toHaveCount(0);
  await page.screenshot({ path: resolve(shotsDir(), 'studio-header-1280x800.png'), clip: { x: 0, y: 0, width: 1280, height: 200 } });
  await expectClean(seen);
});

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use(PIXEL);
  test('the header carries the Studio marker and More has the Workbench', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(240_000);
    await page.goto('/');
    await expect(page).toHaveTitle('ORN Studio');
    await expect(page.getByText('Starting up', { exact: true })).toHaveCount(0);
    await expect(page.locator('header').locator('[data-edition-marker]')).toHaveText('Studio');
    await page.getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('dialog', { name: 'More' }).getByRole('region', { name: 'Workbench' })).toBeVisible();
  });
});
