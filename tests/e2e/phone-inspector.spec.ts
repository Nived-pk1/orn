/**
 * The Study inspector in the phone sheet (step 8.1 Part D, F), the STUDY build: Pixel 7 in Chromium, iPhone 14 in WebKit. The peek holds the
 * kind chip, the title, a compact hero and the first two go-next buttons and nothing else; the full sheet holds the whole layout in one column
 * with the connected cards in one scrolling row per group; 44 px targets; no sideways page scroll; axe; zero CSP violations; no animation under
 * prefers-reduced-motion. Screenshots: phone-inspector-peek-pixel7, phone-inspector-full-pixel7, phone-inspector-full-iphone14,
 * phone-inspector-compound-full-pixel7.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { devices, expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { axeProblems, chooseFile, expectClean, expectPreview, watch } from './kit';
import { shotsDir } from './editor-kit';
import { expectHeroNeverWraps } from './hero-geometry';

const STUDY = process.env.ORN_BASE_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:4174';
test.use({ baseURL: STUDY, actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const DEMO = { name: 'my-own-data.orn.json', mimeType: 'application/json', buffer: readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json')) };
const sheet = (page: Page) => page.locator('[data-sheet]');

async function openRecord(page: Page, query: string, id: string): Promise<void> {
  await page.getByRole('button', { name: 'Search' }).first().tap();
  const box = page.getByRole('dialog', { name: 'Search' }).getByRole('combobox');
  await box.fill(query);
  const option = page.getByRole('dialog', { name: 'Search' }).locator(`[role="option"][data-record-id="${id}"]`);
  await expect(option).toBeVisible({ timeout: 60_000 });
  await option.tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', /peek|full/, { timeout: 30_000 });
}

async function walk(page: Page, device: string, withPeek: boolean, query: string, id: string, shot: string, chip: string): Promise<void> {
  const seen = await watch(page, STUDY);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeVisible();
  await expect(page.getByText('Starting up', { exact: true })).toHaveCount(0);
  await chooseFile(page, DEMO);
  await expectPreview(page);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).tap();
  await expect(page.getByRole('navigation', { name: 'Home' })).toBeVisible({ timeout: 90_000 });

  await openRecord(page, query, id);
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');
  if (withPeek) {
    await expect(sheet(page)).toHaveAttribute('data-sheet', 'peek');
    const peek = await sheet(page).boundingBox();
    expect((peek?.height ?? 0) / viewport.height).toBeLessThanOrEqual(0.35 + 0.002);
    await expect(sheet(page).locator('header')).toContainText(chip);
    await expect(sheet(page).locator('[data-hero]').first()).toBeVisible();
    // only the first two go-next buttons are visible at peek; the lead, chips and cards are not
    const buttons = sheet(page).getByRole('group', { name: 'Go next' }).getByRole('button');
    expect(await buttons.evaluateAll((els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).length)).toBeLessThanOrEqual(2);
    await expect(sheet(page).getByRole('list', { name: 'Key facts' })).toBeHidden();
    await expect(sheet(page).locator('section[data-group]').first()).toBeHidden();
    const compact = await sheet(page).locator('[data-sheet-peek-only] [data-hero-equation]').boundingBox(); // review decision 1: one row, at most 120 px
    expect(compact?.height ?? 999, 'the compact hero is at most 120 px high').toBeLessThanOrEqual(121);
    await expectHeroNeverWraps(page, 'the peek');
    for (const box of await sheet(page).getByRole('button').evaluateAll((els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => el.getBoundingClientRect().toJSON() as { height: number }))) expect(box.height).toBeGreaterThanOrEqual(44 - 1);
    expect(await axeProblems(page, 10), 'axe at peek').toEqual([]);
    await page.screenshot({ path: `${shotsDir()}/phone-inspector-peek-${device}.png` });
  }
  await page.getByRole('button', { name: 'Show the whole record' }).tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'full');
  if (chip === 'Reaction') await expectHeroNeverWraps(page, 'the full sheet');
  const group = sheet(page).locator('section[data-group]').first();
  await expect(group).toBeVisible();
  const row = group.locator('ul');
  const geometry = await row.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, overflowX: getComputedStyle(el).overflowX, snap: getComputedStyle(el).scrollSnapType }));
  expect(geometry.overflowX).toBe('auto');
  expect(geometry.snap).toContain('x');
  for (const box of await group.locator('li button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as { height: number }))) expect(box.height).toBeGreaterThanOrEqual(44 - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll').toBe(true);
  expect(await axeProblems(page, 10), 'axe at full').toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/${shot}-${device}.png` });

  // nothing moves under prefers-reduced-motion
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await sheet(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('peek, full, horizontal cards, 44 px, reduced motion', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(400_000);
    await walk(page, 'pixel7', true, 'r: Ethanol → ethanal (PCC)', 'rxn_ethanol-to-ethanal-pcc', 'phone-inspector-full', 'Reaction');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('full sheet, horizontal cards, 44 px', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(400_000);
    await walk(page, 'iphone14', false, 'r: Ethanol → ethanal (PCC)', 'rxn_ethanol-to-ethanal-pcc', 'phone-inspector-full', 'Reaction');
  });
});

test.describe('phone: a compound on the Pixel 7', () => {
  test.use({ ...PIXEL });
  test('the compound full sheet', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(400_000);
    await walk(page, 'pixel7', false, 's: Ethanol', 'spc_ethanol', 'phone-inspector-compound-full', 'Compound');
  });
});

test.describe('phone: the hero equation at 360 px (Pixel 7 profile, Chromium)', () => {
  test.use({ ...PIXEL, viewport: { width: 360, height: 740 } });
  test('one row or the vertical layout, never wrapped; no sideways scroll', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(400_000);
    await walk(page, 'pixel7-360', false, 'r: Ethanol → ethanal (PCC)', 'rxn_ethanol-to-ethanal-pcc', 'phone-inspector-hero-360', 'Reaction');
  });
});
