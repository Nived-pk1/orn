/**
 * The Reactions view end to end (step 7.1b, ADR-042), STUDIO production build, every engine, through the UI only:
 *  (1) desktop on the demo: the mode opens; every filter narrows the list and its chip removes it; Cards and Compact; the empty state; the
 *      inspector opens from a card; Alt+Enter from the palette; "Show its reactions"; an overview arrow's "Open these n reactions in
 *      Reactions" (the count equals the arrow's reactions); the exam scope with "Only <exam version>" and the hidden count; the choices
 *      survive a reload; axe;
 *  (2) a dataset of more than 30 reactions (made by the test): 30 at a time, "Show 30 more", "Showing 30 of n";
 *  (3) phone (Pixel 7 in Chromium, iPhone 14 in WebKit): the Explore tab, the Filters sheet with "Show n reactions", a card; axe.
 * Study (no editing code) is covered in study-edition.spec.ts. Screenshots: reactions-cards-1280x800.png, reactions-compact-1280x800.png,
 * reactions-filter-open-1280x800.png, reactions-empty-1280x800.png, inspector-arrow-open-reactions-1280x800.png,
 * phone-reactions-<pixel7|iphone14>.png, phone-reactions-filters-<pixel7|iphone14>.png.
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, chooseFile, expectClean, expectPreview, generatedFileWithAnchors, loadDemo, openApp, openPhoneApp, watch } from './kit';
import { palette, pane, record, searchFor, shotsDir } from './editor-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const TOTAL = 27; // the reactions of the demo
const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const modes = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const view = (page: Page) => page.getByRole('region', { name: 'Reactions', exact: true });
const countLine = (page: Page, text: string | RegExp) => view(page).getByText(text, { exact: typeof text === 'string' }).first();
const rows = (page: Page) => view(page).locator('[data-reaction-id]');
const chips = (page: Page) => view(page).getByRole('list', { name: 'Chosen filters' }).getByRole('listitem');

async function openDemo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
}

async function openReactions(page: Page): Promise<void> {
  await modes(page).getByRole('button', { name: 'Reactions' }).click();
  await expect(page.getByRole('heading', { name: 'Reactions', exact: true })).toBeVisible();
  await expect(view(page).locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
}

/** Opens a filter's popover, ticks its first option and returns the count line it produced. */
async function tickFirst(page: Page, filter: string): Promise<void> {
  await view(page).getByRole('button', { name: new RegExp(`^${filter}`) }).click();
  const panel = view(page).getByRole('group', { name: `${filter} filter` });
  await expect(panel).toBeVisible();
  await panel.getByRole('checkbox').first().check();
}

test.describe('desktop', () => {
  test('the mode opens; each filter narrows the list and its chip removes it; Cards and Compact; empty state; the choices survive a reload', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);
    await openReactions(page);
    await expect(countLine(page, `${TOTAL} reactions`)).toBeVisible();
    expect(await rows(page).count()).toBe(TOTAL);
    await page.screenshot({ path: `${shotsDir()}/reactions-cards-1280x800.png` });

    // every filter: tick the first option, the list narrows (or stays, never grows), a chip names it, the chip removes it
    for (const filter of ['From family', 'To family', 'Type', 'Named reaction', 'Review status']) {
      await tickFirst(page, filter);
      await expect(chips(page)).toHaveCount(1);
      expect(await rows(page).count(), filter).toBeLessThanOrEqual(TOTAL);
      await expect(countLine(page, new RegExp(`^\\d+ of ${TOTAL} reactions$`))).toBeVisible();
      if (filter === 'Type') await page.screenshot({ path: `${shotsDir()}/reactions-filter-open-1280x800.png` });
      await page.keyboard.press('Escape');
      await chips(page).first().getByRole('button', { name: /^Remove / }).click();
      await expect(chips(page)).toHaveCount(0);
      await expect(countLine(page, `${TOTAL} reactions`)).toBeVisible();
    }

    // the Type filter again, by name, with the live region saying the count
    await view(page).getByRole('button', { name: /^Type/ }).click();
    await view(page).getByRole('group', { name: 'Type filter' }).getByRole('checkbox', { name: /^Oxidation \(\d+\)$/ }).check();
    await expect(chips(page).first()).toContainText('Type: Oxidation');
    const narrowed = await rows(page).count();
    expect(narrowed).toBeGreaterThan(0);
    expect(narrowed).toBeLessThan(TOTAL);
    await expect(view(page).getByRole('status', { name: 'Announcements' })).toHaveText(`${narrowed} of ${TOTAL} reactions`);
    await page.keyboard.press('Escape');

    // Substance: search, choose, Used as
    await view(page).getByRole('button', { name: /^Substance/ }).click();
    const substance = view(page).getByRole('group', { name: 'Substance filter' });
    await expect(substance.getByRole('radio', { name: 'Any' })).toBeChecked();
    await substance.getByRole('searchbox').fill('Ethanol');
    await substance.getByRole('checkbox', { name: /^Ethanol \(\d+\)$/ }).first().click({ timeout: 60_000 });
    await expect(substance.getByRole('list', { name: 'Chosen substances' }).getByRole('checkbox', { name: 'Ethanol' })).toBeChecked();
    await substance.getByRole('radio', { name: 'Product' }).check();
    await expect(view(page).getByText('Used as: Product')).toBeVisible();
    await page.keyboard.press('Escape');
    await view(page).getByRole('button', { name: 'Clear all filters' }).first().click();
    await expect(chips(page)).toHaveCount(0);

    // Cards and Compact
    await view(page).getByRole('radio', { name: 'Compact' }).check();
    await expect(view(page).locator('article[data-reaction-id]')).toHaveCount(0);
    expect(await view(page).locator('li[data-reaction-id]').count()).toBe(TOTAL);
    await page.screenshot({ path: `${shotsDir()}/reactions-compact-1280x800.png` });

    // empty state
    await view(page).getByRole('searchbox', { name: 'Find by name' }).fill('zzzzqq');
    await expect(view(page).getByText('No reaction matches these filters.')).toBeVisible();
    await page.screenshot({ path: `${shotsDir()}/reactions-empty-1280x800.png` });
    await view(page).getByRole('searchbox', { name: 'Find by name' }).fill('');

    // the choices survive a reload: Compact and a Type filter
    await view(page).getByRole('button', { name: /^Type/ }).click();
    await view(page).getByRole('group', { name: 'Type filter' }).getByRole('checkbox', { name: /^Oxidation/ }).check();
    await page.keyboard.press('Escape');
    await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
    await page.waitForTimeout(1000);
    await page.reload();
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
    await modes(page).getByRole('button', { name: 'Reactions' }).click();
    await expect(chips(page).first()).toContainText('Type: Oxidation');
    await expect(view(page).getByRole('radio', { name: 'Compact' })).toBeChecked();
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('a card opens the inspector; Alt+Enter and "Show its reactions" open Reactions filtered; an arrow opens its reactions with the same count', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);
    await openReactions(page);

    // a card selects its reaction: the inspector shows it as on the family page
    const card = view(page).locator('article[data-reaction-id]').first();
    const id = await card.getAttribute('data-reaction-id');
    await card.getByRole('button').first().click();
    await expect(record(page)).toHaveAttribute('data-record-id', id as string);

    // Alt+Enter on a species hit
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeVisible();
    await searchFor(page, 's: Ethanol');
    const option = palette(page).getByRole('option', { name: /^Ethanol/ }).first();
    await expect(option).toBeVisible({ timeout: 60_000 });
    await expect(palette(page).getByText('Alt+Enter: show its reactions')).toBeVisible();
    await page.keyboard.press('Alt+Enter');
    await expect(palette(page)).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Reactions', exact: true })).toBeVisible();
    await expect(chips(page).first()).toContainText('Substance: Ethanol');
    expect(await rows(page).count()).toBeLessThan(TOTAL);

    // plain Enter opens the record in the inspector, whose "Show its reactions" comes back
    await page.keyboard.press('Control+K');
    await searchFor(page, 's: Ethanol');
    await expect(palette(page).getByRole('option', { name: /^Ethanol/ }).first()).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press('Enter');
    await expect(record(page)).toContainText('Ethanol');
    await pane(page).getByRole('button', { name: 'Show its reactions' }).click();
    await expect(page.getByRole('heading', { name: 'Reactions', exact: true })).toBeVisible();
    await expect(chips(page).first()).toContainText('Substance: Ethanol');

    // an overview arrow of several reactions
    await modes(page).getByRole('button', { name: 'Navigator' }).click();
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
    await page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: 'List' }).click();
    const table = page.getByRole('table', { name: 'Arrows' });
    await expect(table).toBeVisible();
    const wanted = await table.locator('[data-row-key]').evaluateAll((all) => all.findIndex((row) => Number(row.querySelectorAll('[role="cell"]')[2]?.textContent) >= 3));
    expect(wanted).toBeGreaterThanOrEqual(0);
    await table.locator('[data-row-key]').nth(wanted).click();
    const region = pane(page).getByRole('region', { name: 'Reactions on this arrow' });
    await expect(region).toBeVisible();
    const n = Number(/\((\d+)\)/.exec((await region.getByRole('heading').textContent()) ?? '')?.[1]);
    expect(n).toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: `${shotsDir()}/inspector-arrow-open-reactions-1280x800.png` });
    await region.getByRole('button', { name: `Open these ${n} reactions in Reactions` }).click();
    await expect(page.getByRole('heading', { name: 'Reactions', exact: true })).toBeVisible();
    await expect(chips(page)).toHaveCount(2);
    await expect(chips(page).nth(0)).toContainText('From family: ');
    await expect(chips(page).nth(1)).toContainText('To family: ');
    await expect(countLine(page, `${n} of ${TOTAL} reactions`)).toBeVisible();
    expect(await rows(page).count()).toBe(n);
    await expectClean(seen);
  });

  test('the exam scope: outside reactions are marked, "Only <exam version>" hides them and the count says how many', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await page.getByRole('combobox', { name: /Exam scope/ }).selectOption({ label: 'JEE Main, provisional, not verified' });
    await openReactions(page);
    await expect(view(page).locator('[data-outside]').first()).toContainText('outside JEE Main');
    const marked = await view(page).locator('[data-outside]').count();
    expect(marked).toBeGreaterThan(0);
    expect(await rows(page).count()).toBe(TOTAL); // nothing is hidden by default
    await view(page).getByRole('checkbox', { name: /^Only / }).check();
    await expect(countLine(page, new RegExp(`^${TOTAL - marked} of ${TOTAL} reactions \\(${marked} outside JEE Main hidden\\)$`))).toBeVisible();
    expect(await rows(page).count()).toBe(TOTAL - marked);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });
});

test.describe('a long list', () => {
  test('30 at a time: Show 30 more, "Showing 30 of n"', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await chooseFile(page, generatedFileWithAnchors('tiny', 'dense'));
    await expectPreview(page);
    await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 90_000 });
    await modes(page).getByRole('button', { name: 'Reactions' }).click();
    await expect(page.getByRole('heading', { name: 'Reactions', exact: true })).toBeVisible();
    const total = Number(/^(\d+) reactions$/.exec((await view(page).locator('p').first().textContent()) ?? '')?.[1]);
    expect(total).toBeGreaterThan(30);
    await expect(view(page).getByText(`Showing 30 of ${total}`)).toBeVisible();
    expect(await rows(page).count()).toBe(30);
    await view(page).getByRole('button', { name: 'Show 30 more' }).click();
    expect(await rows(page).count()).toBe(Math.min(60, total));
    await expectClean(seen);
  });
});

async function phoneWalk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  const tabs = page.getByRole('navigation', { name: 'Home' });
  await expect(tabs.getByRole('button')).toHaveText(['Families', 'Map', 'Explore', 'Search']);
  await tabs.getByRole('button', { name: 'Explore' }).tap();
  await expect(page.getByRole('heading', { name: 'Reactions', exact: true })).toBeVisible();
  await expect(tabs.getByRole('button', { name: 'Explore' })).toHaveAttribute('aria-current', 'page');
  await expect(view(page).locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
  // 44 px targets
  const box = await view(page).getByRole('button', { name: /^Filters \(0\)$/ }).boundingBox();
  expect(box !== null && box.height >= 44).toBe(true);
  await page.screenshot({ path: `${shotsDir()}/phone-reactions-${device}.png` });
  // the Filters sheet
  await view(page).getByRole('button', { name: 'Filters (0)' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('checkbox', { name: /^Oxidation \(\d+\)$/ }).first().check();
  await page.screenshot({ path: `${shotsDir()}/phone-reactions-filters-${device}.png` });
  expect(await axeProblems(page, 10)).toEqual([]);
  const show = sheet.getByRole('button', { name: /^Show \d+ reactions?$/ });
  const n = Number(/\d+/.exec((await show.textContent()) ?? '')?.[0]);
  await show.tap();
  await expect(sheet).toBeHidden();
  await expect(view(page).getByRole('button', { name: 'Filters (1)' })).toBeVisible();
  expect(await view(page).locator('[data-reaction-id]').count()).toBe(n);
  // a card selects its reaction: the sheet shows it
  await view(page).locator('article[data-reaction-id]').first().getByRole('button').first().tap();
  await expect(page.getByRole('article', { name: 'Record' })).toBeVisible();
  expect(await axeProblems(page)).toEqual([]);
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('the Explore tab, the Filters sheet, a card', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await phoneWalk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('the Explore tab, the Filters sheet, a card', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await phoneWalk(page, 'iphone14');
  });
});
