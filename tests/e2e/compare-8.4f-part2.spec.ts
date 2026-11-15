/**
 * Step 8.4f, Part 2 (D7 and the close): screenshots of every view in the LIGHT and the DARK theme, side by side (light left, dark right), into
 * screenshots/compare-8.4f/part2/. Not an assertion spec: it produces the pictures the reviewer looks at. Chromium only. With no stored choice the
 * theme follows the device, so the browser's colour scheme is the switch (System), which is also what a first visit gets.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { exampleCard, leaveChapters, loadDemo, openApp, openPhoneApp } from './kit';

const OUT = resolve(process.cwd(), 'screenshots', 'compare-8.4f', 'part2');
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;

/** The same screen in both themes, composed light | dark. */
async function both(page: Page, name: string, ready?: () => Promise<void>): Promise<void> {
  const paths: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(500);
    if (ready !== undefined) await ready();
    const path = resolve(OUT, `${name}-${scheme}.png`);
    await page.screenshot({ path });
    paths.push(path);
  }
  const pair = await page.context().newPage();
  await pair.setViewportSize({ width: 2600, height: 900 });
  await pair.setContent(`<body style="margin:0;padding:8px;background:#888;font:12px sans-serif"><div style="display:flex;gap:8px;align-items:flex-start">${paths.map((p, i) => `<div><div>${i === 0 ? 'LIGHT' : 'DARK'} - ${name}</div><img src="data:image/png;base64,${readFileSync(p).toString('base64')}"></div>`).join('')}</div></body>`);
  await pair.screenshot({ path: resolve(OUT, `pair-${name}.png`), fullPage: true });
  await pair.close();
  await page.emulateMedia({ colorScheme: 'light' });
}

test.describe('both themes, desktop 1280 x 800', () => {
  test.use({ actionTimeout: 60_000 });
  test('every view', async ({ page }) => {
    test.setTimeout(900_000);
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await both(page, 'first-run');
    await loadDemo(page);
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible({ timeout: 60_000 });
    const rail = page.getByRole('navigation', { name: 'Modes' });
    await both(page, 'map');
    await page.locator('svg [data-node-id="cls_alcohols"]').click();
    await expect(page.getByRole('complementary', { name: 'Inspector' }).getByRole('article', { name: 'Record' })).toBeVisible({ timeout: 60_000 });
    await both(page, 'map-selected-with-panel');
    await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
    await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
    await both(page, 'family-page');
    for (const [label, name, ready] of [
      ['Chapters', 'chapters', undefined],
      ['Reactions', 'reactions', async () => void (await expect(page.getByRole('list', { name: 'Reactions' }).first()).toBeVisible({ timeout: 60_000 }))],
      ['Precursors', 'precursors', undefined],
      ['Reagents', 'reagents', undefined],
      ['Named reactions', 'named', undefined],
      ['Mechanisms', 'mechanisms', undefined],
      ['Syllabus', 'syllabus', undefined],
      ['Dataset', 'dataset', undefined],
      ['Workbench', 'workbench', undefined],
      ['Review', 'review', undefined],
      ['Settings', 'settings', undefined],
    ] as const) {
      await rail.getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(1200);
      await both(page, name, ready);
    }
    // the palette and the exam menu, open
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Search' }).getByRole('option').first()).toBeVisible({ timeout: 60_000 });
    await both(page, 'palette');
    await page.keyboard.press('Escape');
  });
});

test.describe('both themes, Pixel 7', () => {
  test.use({ ...PIXEL, actionTimeout: 60_000 });
  test('the student views, the family peek with the PCC card, Settings', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(600_000);
    mkdirSync(OUT, { recursive: true });
    await openPhoneApp(page);
    await page.getByRole('button', { name: 'Load demo dataset' }).tap();
    await leaveChapters(page);
    await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
    await both(page, 'phone-families');
    await page.getByRole('button', { name: /^Alcohols/ }).tap();
    await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
    await page.getByRole('button', { name: /^Aldehydes\s*2\s*reactions$/ }).last().tap();
    const card = await exampleCard(page, 'Ethanol → ethanal (PCC)');
    await card.getByRole('heading', { level: 5 }).getByRole('button').tap();
    await expect(page.locator('aside[data-sheet]')).toHaveAttribute('data-sheet', 'peek');
    await page.waitForTimeout(1500);
    await both(page, 'phone-peek-pcc-card');
    await page.getByRole('button', { name: 'Show the whole record' }).tap();
    await expect(page.locator('aside[data-sheet]')).toHaveAttribute('data-sheet', 'full');
    await page.waitForTimeout(800);
    await both(page, 'phone-sheet-full');
    await page.getByRole('button', { name: 'Show less' }).tap();
    await page.getByRole('button', { name: 'Close inspector' }).tap();
    await page.getByRole('button', { name: 'More' }).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Settings' }).tap();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await both(page, 'phone-settings');
    await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Families' }).tap();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toHaveCount(0);
  });
});
