/**
 * Step 8.5g G1: the mechanism drawings at 44 px per bond. Desktop 1280: every demo step fits its card without a scroll box. Pixel 7:
 * every step obeys the size rule (never under the floor, so no label under 11 px; what is wider is in the scroll box, nothing clipped).
 */
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { leaveChapters, loadDemo, openPhoneApp } from './kit';
import { changedDemo, importOwn } from './own-data-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const view = (page: Page) => page.getByRole('region', { name: 'Mechanisms', exact: true });
const ALDOL = 'Aldol addition of ethanal';
const SN2 = 'SN2 substitution of a haloalkane';
const ALDOL_STEPS = ['Hydroxide removes an α-hydrogen to give the enolate', 'Enolate carbon attacks a second ethanal', 'Alkoxide is protonated by water'];
const SN2_STEPS = ['Hydroxide attacks the carbon opposite the leaving group'];
const STANDARD = 44;
const FLOOR = 0.85;
const UNITS = 54;

const measure = (step: Locator) =>
  step.locator('[data-drawing-scroll]').first().evaluate((box, units) => {
    const svg = box.querySelector('svg') as SVGSVGElement;
    const width = svg.getBoundingClientRect().width;
    return { bondPx: (width / svg.viewBox.baseVal.width) * units, width, box: box.clientWidth, scroll: box.scrollWidth };
  }, UNITS);

async function check(page: Page, titles: readonly string[], noScroll: boolean): Promise<void> {
  for (const title of titles) {
    const step = view(page).locator('[data-step]').filter({ hasText: title }).first();
    await expect(step.getByRole('img', { name: /^Drawing of step/ })).toBeVisible({ timeout: 90_000 });
    await step.scrollIntoViewIfNeeded();
    const m = await measure(step);
    expect(m.bondPx, `${title}: not under the floor`).toBeGreaterThanOrEqual(STANDARD * FLOOR - 0.3);
    expect(m.bondPx, `${title}: not over the standard`).toBeLessThanOrEqual(STANDARD + 0.3);
    if (noScroll) expect(m.scroll, `${title}: no scroll box`).toBeLessThanOrEqual(m.box + 1);
    else expect(m.scroll, `${title}: nothing clipped (all of it can be scrolled to)`).toBeGreaterThanOrEqual(Math.floor(m.width) - 1);
  }
}

test('desktop 1280: every demo step fits its card without a scroll box', async ({ page }) => {
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await importOwn(page, changedDemo(() => undefined));
  await leaveChapters(page);
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Mechanisms' }).click();
  for (const [name, titles] of [[ALDOL, ALDOL_STEPS], [SN2, SN2_STEPS]] as const) {
    const back = view(page).getByRole('button', { name: 'All mechanisms' });
    if (await back.isVisible()) await back.click();
    await view(page).getByRole('list', { name: 'Mechanisms' }).locator('[data-mechanism-id]').filter({ hasText: name }).getByRole('button', { name }).click();
    await check(page, titles, true);
  }
});

test.describe('phone: Pixel 7', () => {
  test.use({ ...PIXEL });
  test('every demo step obeys the size rule', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(480_000);
    await openPhoneApp(page);
    await loadDemo(page);
    await expect(page.getByRole('region', { name: 'Families' })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Explore' }).tap();
    await page.getByRole('combobox', { name: 'Show:' }).selectOption({ label: 'Mechanisms' });
    await view(page).getByRole('button', { name: ALDOL }).tap();
    await check(page, ALDOL_STEPS, false);
    await view(page).getByRole('button', { name: 'All mechanisms' }).tap();
    await view(page).getByRole('button', { name: SN2 }).tap();
    await check(page, SN2_STEPS, false);
  });
});
