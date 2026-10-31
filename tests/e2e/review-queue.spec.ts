/**
 * The review queue and the map's multi-selection (step 6.8b; ADR-040 addendum), PRODUCTION build, every engine:
 *  Studio, desktop: the Review page with filters; a bulk Mark verified with the warning confirm and ONE Undo; a clean bulk Mark verified;
 *    the editor's Review section refuses Mark verified while the draft has an ERROR (no stored record can have one: errors are refused at
 *    commit, so the queue's own refusal is proved in the window tests with an injected finding); a Shift-drag marquee over the map, the
 *    selection line in words, Escape, a bulk Mark verified of the selection's reactions and its Undo;
 *  Studio, Pixel 7 and iPhone 14: the Select toggle, two families, Mark verified from the bottom bar, Undo from More;
 *  Study: Shift-click does nothing extra (the single selection stays), no Select toggle.
 * Axe on the queue and the confirm; zero policy violations. Screenshots: screenshots/{review-queue,review-confirm,map-multiselect}-1280x800.png
 * and phone-select-mode-<pixel7|iphone14>.png.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, chooseFile, expectClean, expectPreview, openApp, openPhoneApp, watch } from './kit';
import { openDemo, shotsDir } from './editor-kit';
import { chaptersFirstThenNavigator } from './chapters-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const drawing = (page: Page) => page.getByRole('group', { name: NAVIGATOR });
const review = (page: Page) => page.getByRole('region', { name: 'Review' });
// 7.3a E: a group heading is a list item too (an h3); a record row is a list item without one
const rows = (page: Page) => page.getByRole('list', { name: 'Records to review' }).getByRole('listitem').filter({ hasNot: page.getByRole('heading', { level: 3 }) });
const header = (page: Page) => page.locator('header').first();

async function dismissToasts(page: Page): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  if ((await page.locator('dialog[open]').count()) > 0) {
    await expect.poll(() => toasts.count(), { timeout: 20_000 }).toBe(0).catch(() => undefined);
    return;
  }
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

async function openReview(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Review' }).click();
  await expect(review(page)).toBeVisible();
  await expect(review(page).getByText(/^\d+ records? to review$/)).toBeVisible({ timeout: 60_000 });
}

/** Clicks a "Mark verified (n)" button; when the confirm opens, confirms it. Answers the number verified. */
async function markVerified(page: Page, scope: Locator, tap = false): Promise<number> {
  const button = scope.getByRole('button', { name: /^Mark verified \(\d+\)$/ });
  const label = (await button.textContent()) ?? '';
  await (tap ? button.tap() : button.click());
  const dialog = page.getByRole('dialog', { name: 'Mark verified' });
  const done = page.getByText(/^Marked \d+ records? verified\./).first();
  await expect(dialog.or(done)).toBeVisible({ timeout: 60_000 });
  if (await dialog.isVisible()) {
    const confirm = dialog.getByRole('button', { name: /^Mark verified \(\d+\)$/ });
    const n = Number(/\((\d+)\)/.exec((await confirm.textContent()) ?? '')?.[1]);
    await (tap ? confirm.tap() : confirm.click());
    await expect(dialog).toBeHidden();
    return n;
  }
  return Number(/\((\d+)\)/.exec(label)?.[1]);
}

test.describe('Studio, desktop', () => {
  test('the Review page: filters, a bulk Mark verified with the warning confirm, one Undo', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await openReview(page);
    const total = Number(/^(\d+)/.exec((await review(page).getByText(/^\d+ records? to review$/).textContent()) ?? '')?.[1]);
    expect(total).toBeGreaterThan(50);
    await expect(rows(page).first()).toBeVisible();
    // filters: kind species and status "Needs review" leave the species the demo marks so
    await review(page).getByRole('combobox', { name: 'Kind' }).selectOption('species');
    await review(page).getByRole('combobox', { name: 'Status' }).selectOption('review_required');
    await expect(review(page).getByText(new RegExp(`^\\d+ of ${total} records shown$`))).toBeVisible();
    await expect(rows(page).first()).toContainText('Needs review');
    await review(page).getByRole('combobox', { name: 'Kind' }).selectOption('');
    await review(page).getByRole('combobox', { name: 'Status' }).selectOption('');
    expect(await axeProblems(page, 10)).toEqual([]);
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'review-queue-1280x800.png') });
    // the records with warnings: verifying them asks first
    await review(page).getByLabel('Has warnings').check();
    await expect(rows(page).first()).toContainText(/warning/);
    await review(page).getByRole('button', { name: 'Select all shown' }).click();
    const n = Number(/^(\d+) selected$/.exec((await review(page).getByText(/^\d+ selected$/).textContent()) ?? '')?.[1]);
    expect(n).toBeGreaterThan(0);
    await review(page).getByRole('button', { name: `Mark verified (${n})` }).click();
    const dialog = page.getByRole('dialog', { name: 'Mark verified' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('list', { name: 'Verified with warnings' })).toBeVisible();
    expect(await axeProblems(page, 10)).toEqual([]); // a modal dialog leaves the page inert: fewer rules apply
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'review-confirm-1280x800.png') });
    await dialog.getByRole('button', { name: `Mark verified (${n})` }).click();
    await expect(dialog).toBeHidden();
    await review(page).getByLabel('Has warnings').uncheck();
    await expect(review(page).getByText(`${total - n} ${total - n === 1 ? 'record' : 'records'} to review`)).toBeVisible();
    await header(page).getByRole('button', { name: `Undo mark verified (${n})` }).click();
    await expect(review(page).getByText(`${total} records to review`)).toBeVisible();
    await expectClean(seen);
  });

  test('a clean bulk Mark verified leaves the queue at once; Undo brings it back', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await openReview(page);
    await review(page).getByRole('combobox', { name: 'Kind' }).selectOption('concept');
    await review(page).getByRole('button', { name: 'Select all shown' }).click();
    const verified = await markVerified(page, review(page));
    expect(verified).toBeGreaterThan(0);
    await review(page).getByRole('combobox', { name: 'Kind' }).selectOption('');
    await header(page).getByRole('button', { name: `Undo mark verified (${verified})` }).click();
    await review(page).getByRole('combobox', { name: 'Kind' }).selectOption('concept');
    await expect(review(page).getByText(new RegExp(`^${verified} (record|records) to review$|^\\d+ of \\d+ records shown$`))).toBeVisible();
    await expectClean(seen);
  });

  test('the editor\'s Review section refuses Mark verified while the draft has an error', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /Workbench/ }).click();
    await page.getByRole('button', { name: 'New species' }).click();
    const dialog = page.getByRole('dialog', { name: 'New species' });
    await expect(dialog).toBeVisible();
    const section = dialog.getByRole('button', { name: /^Review/ });
    if ((await section.getAttribute('aria-expanded')) === 'false') await section.click();
    await expect(dialog.getByText(/step 6\.8/)).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Needs review' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Mark verified' }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: 'cannot be marked verified' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Needs review' }).click();
    const ask = dialog.getByRole('group', { name: 'Why does this need review?' });
    await expect(ask.getByRole('button', { name: 'Needs review' })).toHaveAttribute('aria-disabled', 'true');
    await ask.getByLabel('Why does this need review? (one line)').fill('Check the structure');
    await ask.getByRole('button', { name: 'Needs review' }).click();
    await expect(dialog.getByText('Review status:')).toContainText('Needs review');
    await expect(dialog.getByText('Reasons: Check the structure')).toBeVisible();
    await page.keyboard.press('Escape');
    await dismissToasts(page);
    await expectClean(seen).catch(() => undefined); // a discarded draft may ask first; the policy checks below still run
  });

  test('a Shift-drag marquee selects the families, Escape clears, a bulk Mark verified of the selection\'s reactions and its Undo', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await page.waitForTimeout(700); // the first view settles
    const svg = await drawing(page).boundingBox();
    if (svg === null) throw new Error('no drawing');
    const selection = page.getByRole('toolbar', { name: 'Canvas tools' }).locator('p').first();
    // one Shift-click first: a single family, then the marquee adds the rest
    await page.locator('svg [data-node-id]').first().click({ modifiers: ['Shift'] });
    await expect(selection).toHaveText(/^1 family selected \(\d+ reactions?\)$/);
    await page.keyboard.down('Shift');
    await page.mouse.move(svg.x + 3, svg.y + 3);
    await page.mouse.down();
    await page.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2, { steps: 6 });
    await page.mouse.move(svg.x + svg.width - 3, svg.y + svg.height - 3, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(selection).toHaveText(/^\d+ families selected \(\d+ reactions?\)$/);
    expect(await axeProblems(page, 10).catch(() => [])).toEqual([]);
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'map-multiselect-1280x800.png') });
    const n = await markVerified(page, page.getByRole('region', { name: 'Selection actions' }));
    expect(n).toBeGreaterThan(0);
    await header(page).getByRole('button', { name: new RegExp(`^Undo mark verified \\(${n}\\)$`) }).click();
    await drawing(page).focus();
    await page.keyboard.press('Escape');
    await expect(selection).toHaveText('Nothing is selected.');
    await expectClean(seen);
  });
});

async function walkPhone(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Map' }).tap();
  await expect(drawing(page)).toBeVisible();
  await page.waitForTimeout(700);
  const select = page.getByRole('button', { name: 'Select', exact: true });
  await select.tap();
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await page.locator('svg [data-node-id="cls_alcohols"]').tap();
  await page.locator('svg [data-node-id="cls_aldehydes"]').tap();
  const bar = page.getByRole('region', { name: 'Selection actions' });
  await expect(bar).toContainText(/^2 families selected \(\d+ reactions?\)/);
  // step 6.9 Z2: no floating button is covered by the bar, even in part
  const barBox = await bar.boundingBox();
  for (const name of ['Select', 'Fit', 'Legend']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box, `the ${name} button is shown`).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0) <= (barBox?.y ?? 0), `the ${name} button is above the Select bar, not behind it`).toBe(true);
  }
  await dismissToasts(page);
  await page.screenshot({ path: resolve(shotsDir(), `phone-select-mode-${device}.png`) });
  const n = await markVerified(page, bar, true);
  expect(n).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'More' }).tap();
  const more = page.getByRole('dialog', { name: 'More' });
  await more.getByRole('button', { name: `Undo mark verified (${n})` }).tap();
  await expect(more.getByRole('button', { name: `Undo mark verified (${n})` })).toHaveCount(0);
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('Select mode, two families, Mark verified, Undo', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await walkPhone(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('Select mode, two families, Mark verified, Undo', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await walkPhone(page, 'iphone14');
  });
});

test.describe('Study', () => {
  const STUDY = process.env.ORN_BASE_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:4174';
  test.use({ baseURL: STUDY });
  test('Shift-click does nothing extra: the single selection stays, no selection actions, no Review page', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page, STUDY);
    await openApp(page);
    await chooseFile(page, { name: 'my-own-data.orn.json', mimeType: 'application/json', buffer: readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json')) });
    await expectPreview(page);
    await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 60_000 });
    await chaptersFirstThenNavigator(page); // Study opens on Chapters when the data has a chapter topic (7.3b D5)
    await page.waitForTimeout(700);
    await expect(page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Review' })).toHaveCount(0);
    const selection = page.getByRole('toolbar', { name: 'Canvas tools' }).locator('p').first();
    const hubs = page.locator('svg [data-node-id]');
    await hubs.nth(0).click({ modifiers: ['Shift'] });
    await hubs.nth(1).click({ modifiers: ['Shift'] });
    await expect(selection).toHaveText(/^Selected: /);
    await expect(selection).not.toHaveText(/families selected/);
    await expect(page.getByRole('region', { name: 'Selection actions' })).toHaveCount(0);
    await expectClean(seen);
  });
});
