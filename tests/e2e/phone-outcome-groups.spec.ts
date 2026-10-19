/**
 * Outcome groups on a phone (outcome groups step, part 2), PRODUCTION build, two touch devices (Pixel 7: Chromium; iPhone 14: WebKit): the
 * E2 reaction is one scheme drawn top to bottom, the reactant once, one down arrow, the two product tiles SIDE BY SIDE in a row under it
 * with their words; one "Show full equation" whose open panel is bordered, holds both products with their words and fits the card; the
 * page never scrolls sideways; no security-policy violation; axe. Screenshots: screenshots/phone-outcomes-e2-<pixel7|iphone14>.png and
 * screenshots/phone-outcomes-e2-equation-pixel7.png.
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';
import { box, findCard, shot } from './outcome-kit';

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function walk(page: Page, device: 'pixel7' | 'iphone14'): Promise<void> {
  test.setTimeout(300_000);
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('button', { name: /^Haloalkanes/ }).tap();
  await expect(page.getByRole('region', { name: 'Family page: Haloalkanes' })).toBeVisible();
  const card = await findCard(page, /alc\. KOH/);

  await expect(card.locator('[data-substance-id="spc_r-2-bromobutane"]')).toHaveCount(1);
  await expect(card.locator('[data-arrow][data-direction="down"]')).toHaveCount(1);
  await expect(card.locator('[data-arrow]')).toHaveCount(1);
  const major = card.locator('[data-outcome-id] [data-substance-id="spc_but-2-ene"]');
  const minor = card.locator('[data-outcome-id] [data-substance-id="spc_but-1-ene"]');
  await expect(major.locator('figcaption')).toContainText('major · Saytzeff');
  await expect(minor.locator('figcaption')).toContainText('minor · Hofmann');
  const [first, second, arrow] = [await box(major), await box(minor), await box(card.locator('[data-arrow]'))];
  expect(Math.abs(first.y - second.y), 'the two tiles are side by side in one row').toBeLessThan(4);
  expect(second.x, 'the minor is right of the major').toBeGreaterThan(first.x + first.width - 1);
  expect(first.y, 'under the down arrow').toBeGreaterThan(arrow.y + arrow.height - 1);
  await expect(card.getByText('Show full equation')).toHaveCount(1);
  expect(await noSidewaysScroll(page), 'no horizontal scroll').toBe(true);
  await shot(page, card, `phone-outcomes-e2-${device}.png`);

  await card.getByText('Show full equation').tap();
  const panel = card.locator('details[data-equation-panel]');
  const scheme = panel.getByRole('group', { name: 'Full equation' });
  await expect(scheme).toBeVisible();
  await expect(scheme.locator('[data-equation-word]')).toHaveText(['(major · Saytzeff)', '(minor · Hofmann)']);
  await expect(scheme.getByText('Drawing the structure…')).toHaveCount(0, { timeout: 60_000 });
  expect(await panel.evaluate((element) => [getComputedStyle(element).borderTopWidth, getComputedStyle(element).borderTopStyle])).toEqual(['1px', 'solid']);
  expect(await noSidewaysScroll(page), 'no horizontal scroll with the equation open').toBe(true);
  const cardBox = await box(card);
  for (const part of await panel.locator('[data-equation-term], [data-equation-arrow], img').all()) {
    const found = await box(part);
    expect(found.x, 'inside the card on the left').toBeGreaterThanOrEqual(cardBox.x - 0.5);
    expect(found.x + found.width, 'inside the card on the right').toBeLessThanOrEqual(cardBox.x + cardBox.width + 0.5);
  }
  if (device === 'pixel7') await shot(page, panel, 'phone-outcomes-e2-equation-pixel7.png');
  expect(await axeProblems(page), 'axe').toEqual([]);
  await expectClean(seen);
}

test.describe('phone outcome groups: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('the E2 card: one scheme, tiles side by side, one bordered full equation; nothing overflows', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium; Firefox has no touch emulation');
    await walk(page, 'pixel7');
  });
});

test.describe('phone outcome groups: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('the E2 card: one scheme, tiles side by side, one bordered full equation; nothing overflows', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    await walk(page, 'iphone14');
  });
});
