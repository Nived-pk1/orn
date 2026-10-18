/**
 * "Show full equation" on a phone (equation step, parts 6a and 6; the look: names directly under their drawings, a one-row toolbar), PRODUCTION build, two touch devices (Pixel 7: Chromium; iPhone 14: WebKit):
 * the terms stacked like the phone card (reactants, the down arrow with its text to the right, products), names under the drawings,
 * drawings at most 140 px wide, nothing wider than the card or the page. Screenshots:
 * screenshots/phone-equation-<pixel7|iphone14>-<lindlar|cannizzaro>.png and screenshots/phone-structures-condensed-pixel7.png.
 */
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, openPhoneApp, watch } from './kit';

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const box = async (locator: Locator) => {
  const found = await locator.boundingBox();
  if (found === null) throw new Error('no box');
  return found;
};

const cardOf = (page: Page, title: RegExp): Locator => page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: title }) });

async function openEquation(card: Locator): Promise<Locator> {
  await card.scrollIntoViewIfNeeded();
  await card.getByText('Show full equation').tap();
  const scheme = card.getByRole('group', { name: 'Full equation' });
  await expect(scheme).toBeVisible();
  await expect(scheme.locator('[data-equation-term]').first()).toBeVisible();
  await expect(scheme.getByText('Drawing the structure…')).toHaveCount(0, { timeout: 60_000 });
  await scheme.scrollIntoViewIfNeeded();
  return scheme;
}

/** Nothing overflows: the page does not scroll sideways, and every part of the scheme is inside the card and the viewport. */
async function expectFits(page: Page, card: Locator, scheme: Locator): Promise<void> {
  const viewport = page.viewportSize()?.width ?? 0;
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal scroll').toBe(true);
  const cardBox = await box(card);
  const right = Math.min(cardBox.x + cardBox.width, viewport) + 0.5;
  for (const part of await scheme.locator('[data-equation-term], [data-equation-arrow], [data-equation-text], img').all()) {
    const found = await box(part);
    expect(found.x, 'inside the card on the left').toBeGreaterThanOrEqual(cardBox.x - 0.5);
    expect(found.x + found.width, 'inside the card on the right').toBeLessThanOrEqual(right);
  }
  for (const image of await scheme.locator('img').all()) expect((await box(image)).width, 'a drawing is at most 140 px wide').toBeLessThanOrEqual(140.5);
}

/** Every name's top is within 8 px of the bottom of its drawing (the reactant row and the product row). */
async function expectNamesUnder(scheme: Locator): Promise<void> {
  let named = 0;
  for (const column of await scheme.locator('[data-equation-term] [role="group"]').all()) {
    const name = column.locator('[data-equation-name]');
    if ((await name.count()) === 0) continue;
    named += 1;
    const rep = await box(column.locator('[data-equation-rep]'));
    const gap = (await box(name)).y - (rep.y + rep.height);
    expect(gap, 'a name sits directly under its drawing').toBeLessThanOrEqual(8);
    expect(gap, 'and not over it').toBeGreaterThanOrEqual(-1);
  }
  expect(named, 'some names were checked').toBeGreaterThan(0);
}

/** The Names switch is on the "Show full equation" line (or directly under it when the card is too narrow). */
async function expectNamesSwitch(card: Locator): Promise<void> {
  const summary = await box(card.getByText('Show full equation'));
  const names = await box(card.getByRole('checkbox', { name: 'Names' }));
  const centre = names.y + names.height / 2;
  expect(centre, 'the Names switch is on the summary line or just under it').toBeGreaterThan(summary.y);
  expect(centre, 'the Names switch is on the summary line or just under it').toBeLessThan(summary.y + summary.height + 48);
}

/** The family page toolbar is ONE row: the back button and the compact Structures button share a line. */
async function expectOneRowToolbar(page: Page): Promise<void> {
  const toolbar = page.getByRole('toolbar', { name: 'Family page tools' });
  const back = await box(toolbar.getByRole('button', { name: /^< / }));
  const structures = await box(toolbar.getByRole('button', { name: /^Structures: / }));
  expect(Math.abs(back.y + back.height / 2 - (structures.y + structures.height / 2)), 'the two buttons share a line').toBeLessThan(4);
  expect((await box(toolbar)).height, 'the toolbar is one row high').toBeLessThan(Math.max(back.height, structures.height) + 24);
  expect(structures.x, 'Structures is right of the back button').toBeGreaterThan(back.x + back.width);
}

/** The arrow's text is right of the arrow's line. */
async function expectArrowText(scheme: Locator): Promise<void> {
  const arrow = scheme.locator('[data-equation-arrow]');
  await expect(arrow).toHaveAttribute('data-direction', 'down');
  const line = await box(arrow.locator('[data-equation-line]'));
  const text = await box(arrow.locator('[data-equation-text]'));
  expect(text.x, 'the arrow text is right of the arrow').toBeGreaterThanOrEqual(line.x + line.width - 0.5);
}

async function shot(page: Page, card: Locator, file: string): Promise<void> {
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/${file}` });
}

async function walk(page: Page, device: 'pixel7' | 'iphone14'): Promise<void> {
  test.setTimeout(300_000);
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();

  // Lindlar: three terms, hydrogen as text, the arrow's text right of the arrow
  await page.getByRole('button', { name: /^Alkenes/ }).tap();
  await expect(page.getByRole('region', { name: 'Family page: Alkenes' })).toBeVisible();
  await page.getByRole('button', { name: /^Alkynes\s*\d+\s*reactions?$/ }).first().tap();
  const lindlar = cardOf(page, /Lindlar/);
  const lindlarScheme = await openEquation(lindlar);
  await expect(lindlarScheme).toHaveAttribute('data-layout', 'stacked');
  await expect(lindlarScheme.locator('[data-equation-term]')).toHaveCount(3);
  await expect(lindlarScheme.getByRole('group', { name: 'Hydrogen' }).locator('sub')).toHaveText('2');
  await expect(lindlarScheme.locator('[data-equation-name]')).toHaveCount(3);
  await expectFits(page, lindlar, lindlarScheme);
  await expectArrowText(lindlarScheme);
  await expectNamesUnder(lindlarScheme);
  await expectNamesSwitch(lindlar);
  await expectOneRowToolbar(page);
  if (device === 'iphone14') await page.screenshot({ path: 'screenshots/phone-toolbar-iphone14.png', clip: { x: 0, y: 0, width: 390, height: 120 } });
  await shot(page, lindlar, `phone-equation-${device}-lindlar.png`);

  if (device === 'pixel7') {
    // Condensed on the phone
    await page.getByRole('button', { name: 'Structures: Skeletal' }).tap();
    await page.getByRole('menuitemradio', { name: 'Condensed' }).tap();
    await expect(page.getByRole('button', { name: 'Structures: Condensed' })).toBeVisible();
    await page.waitForTimeout(1_500);
    await expectFits(page, lindlar, lindlarScheme);
    await shot(page, lindlar, 'phone-structures-condensed-pixel7.png');
    await page.getByRole('button', { name: 'Structures: Condensed' }).tap();
    await page.getByRole('menuitemradio', { name: 'Skeletal' }).tap();
    await expect(page.getByRole('button', { name: 'Structures: Skeletal' })).toBeVisible();
  }

  // Cannizzaro: the coefficient, "(both exclusive)" once
  await page.getByRole('button', { name: '< Families' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('button', { name: /^Aldehydes/ }).tap();
  await expect(page.getByRole('region', { name: 'Family page: Aldehydes' })).toBeVisible();
  const cannizzaro = cardOf(page, /Cannizzaro/);
  const cannizzaroScheme = await openEquation(cannizzaro);
  await expect(cannizzaroScheme.locator('[data-equation-word]')).toHaveText('(both exclusive)');
  await expect(cannizzaroScheme.locator('[data-equation-coefficient]')).toHaveText('2');
  await expectFits(page, cannizzaro, cannizzaroScheme);
  await expectArrowText(cannizzaroScheme);
  await expectNamesUnder(cannizzaroScheme);
  await shot(page, cannizzaro, `phone-equation-${device}-cannizzaro.png`);
  await expectClean(seen);
}

test.describe('phone equation: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('stacked scheme: reactants, the down arrow with its text on the right, products; nothing overflows', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium; Firefox has no touch emulation');
    await walk(page, 'pixel7');
  });
});

test.describe('phone equation: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('stacked scheme: reactants, the down arrow with its text on the right, products; nothing overflows', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    await walk(page, 'iphone14');
  });
});
