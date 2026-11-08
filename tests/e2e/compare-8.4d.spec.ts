/**
 * Step 8.4d, Part F3: screenshots of the real app next to the matching part of the design reference (docs/design/ORN_DESIGN_REFERENCE.html,
 * light theme), side by side, into screenshots/compare-8.4d/. Not an assertion spec: it produces the pictures the reviewer compares. Chromium only.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loadDemo, openApp } from './kit';

const OUT = resolve(process.cwd(), 'screenshots', 'compare-8.4d');
const REFERENCE = `file:///${resolve(process.cwd(), 'docs', 'design', 'ORN_DESIGN_REFERENCE.html').split('\\').join('/')}`;
test.use({ baseURL: process.env.ORN_BASE_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:4173', actionTimeout: 60_000 });

const b64 = (path: string): string => readFileSync(path).toString('base64');

async function sideBySide(page: Page, name: string, app: string, ref: string): Promise<void> {
  const pair = await page.context().newPage();
  await pair.setViewportSize({ width: 1400, height: 900 });
  await pair.setContent(
    `<body style="margin:0;padding:12px;font:12px sans-serif;background:#ddd"><div style="display:flex;gap:12px;align-items:flex-start"><div><div>APP</div><img src="data:image/png;base64,${b64(app)}"></div><div><div>REFERENCE</div><img src="data:image/png;base64,${b64(ref)}"></div></div></body>`,
  );
  await pair.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true });
  await pair.close();
}

async function shot(page: Page, _ref: Page, name: string, app: Locator, reference: Locator): Promise<void> {
  const appPath = resolve(OUT, `app-${name}.png`);
  const refPath = resolve(OUT, `ref-${name}.png`);
  await app.screenshot({ path: appPath });
  await reference.first().screenshot({ path: refPath });
  await sideBySide(page, name, appPath, refPath);
}

test('compare the frame with the reference (light theme)', async ({ page, context }) => {
  test.setTimeout(480_000);
  mkdirSync(OUT, { recursive: true });
  const ref = await context.newPage();
  await ref.setViewportSize({ width: 1280, height: 900 });
  await ref.goto(REFERENCE);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible({ timeout: 60_000 });
  // a toast (the import's result) and the notice band, as they are right after loading
  const toasts = page.getByRole('status', { name: 'Notifications' });
  if ((await toasts.locator('button').count()) > 0) await shot(page, ref, 'toast', toasts, ref.locator('.toast'));
  const band = page.getByRole('region', { name: 'Notices' });
  if (await band.isVisible()) await shot(page, ref, 'notice-band', band, ref.locator('.band'));
  await shot(page, ref, 'top-bar', page.locator('header'), ref.locator('.app .topbar'));
  const rail = page.getByRole('navigation', { name: 'Modes' });
  await shot(page, ref, 'rail-open', rail, ref.locator('.app .rail'));
  await shot(page, ref, 'status-bar', page.locator('footer'), ref.locator('.app .status'));
  await rail.getByRole('button', { name: 'Collapse' }).click();
  await shot(page, ref, 'rail-collapsed', rail, ref.locator('.app .rail'));
  await rail.getByRole('button', { name: 'Expand' }).click();
  // the palette open (the menu pattern)
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Search' });
  await expect(palette.getByRole('option').first()).toBeVisible({ timeout: 60_000 });
  await shot(page, ref, 'palette', palette, ref.locator('.menu'));
  await page.keyboard.press('Escape');
  // Reactions: cards, then compact rows
  await rail.getByRole('button', { name: 'Reactions' }).click();
  const main = page.getByRole('main');
  await expect(page.getByRole('list', { name: 'Reactions' })).toBeVisible({ timeout: 60_000 });
  await shot(page, ref, 'reactions-cards', main, ref.locator('.card').first());
  await page.getByRole('radio', { name: 'Compact' }).click({ force: true });
  await shot(page, ref, 'reactions-compact', main, ref.locator('.list').first());
  // buttons and chips in use: the Reactions filter bar
  await shot(page, ref, 'buttons-chips', main.locator('div').first(), ref.locator('h3:has-text("Buttons") + .row'));
  // a family page header
  await rail.getByRole('button', { name: 'Map' }).click();
  await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
  await expect(page.getByRole('heading', { level: 1, name: /Alcohols/ })).toBeVisible({ timeout: 60_000 });
  await shot(page, ref, 'family-header', page.getByRole('heading', { level: 1, name: /Alcohols/ }).locator('xpath=..'), ref.locator('.panel .ph'));
  // the phone: top bar and notices row
  await page.setViewportSize({ width: 412, height: 915 });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeAttached({ timeout: 60_000 });
  await shot(page, ref, 'phone-top-bar', page.locator('header'), ref.locator('.ptop'));
  const fold = page.getByRole('button', { name: /^\d+ notices?$/ });
  if (await fold.isVisible()) {
    await shot(page, ref, 'phone-notices-row', fold, ref.locator('.ptop'));
    const box = await fold.boundingBox();
    writeFileSync(resolve(OUT, 'phone-notices-row.txt'), `height ${box?.height ?? 'n/a'} px`);
  }
});
