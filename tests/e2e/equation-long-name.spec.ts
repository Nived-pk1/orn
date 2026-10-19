/**
 * A 60-character name under a drawing (step 6.1b part 1; the review's question about the estimated name room `--hang`). The test's own
 * data: Ethanol is renamed through the Edit names editor (never the demo files), then the PCC card of the Alcohols family opens its full
 * equation, and NO name or word hanging under a drawing may overlap anything else: another drawing, a "+", the arrow, the card's links or
 * text below the scheme, and none may reach past the card's bottom edge. 1280 x 800 (three engines), Pixel 7 (Chromium), iPhone 14 (WebKit).
 * Screenshots: screenshots/equation-long-name-1280x800.png and screenshots/phone-equation-long-name-pixel7.png.
 */
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, openPhoneApp, watch } from './kit';
import { canonicalInput, editorDialog, openDemo, openNamesEditor, palette, record, searchFor, shotsDir, showSpecies } from './editor-kit';

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

/** Exactly 60 characters, with spaces and a hyphen, like a real long name. */
const LONG_NAME = 'Ethanol, a two-carbon alcohol made by fermenting sugar: EtOH';
const cardOf = (page: Page, title: RegExp): Locator => page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: title }) });

interface Overlap {
  readonly what: string;
  readonly with: string;
}

/**
 * In the page: every name and word of the scheme against every other visible box of the card (drawings, formulas, pluses, arrows, links,
 * buttons, text blocks, headings) that neither contains it nor sits inside it, and against the card's bottom edge. Returns what overlaps.
 */
async function overlapsOf(card: Locator): Promise<{ hangs: number; overlaps: Overlap[]; lowest: number; cardBottom: number }> {
  return card.evaluate((cardElement, schemeSelector) => {
    const scheme = cardElement.querySelector(schemeSelector as string);
    if (scheme === null) throw new Error('no scheme');
    const hangs = [...scheme.querySelectorAll<HTMLElement>('[data-equation-name], [data-equation-word]')];
    const obstacles = [...cardElement.querySelectorAll<HTMLElement>('a, button, img, svg, p, summary, li, h1, h2, h3, h4, h5, h6, input, label, figure, figcaption, [data-equation-rep], [data-equation-arrow], [data-equation-plus], [data-equation-text]')];
    const overlaps: Overlap[] = [];
    let lowest = 0;
    const describe = (element: Element): string => `${element.tagName.toLowerCase()}${element.getAttribute('aria-label') === null ? '' : `[${element.getAttribute('aria-label')}]`} "${(element.textContent ?? '').trim().slice(0, 30)}"`;
    for (const hang of hangs) {
      const a = hang.getBoundingClientRect();
      lowest = Math.max(lowest, a.bottom);
      for (const other of obstacles) {
        if (other === hang || other.contains(hang) || hang.contains(other)) continue;
        const b = other.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        const wide = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const high = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (wide > 1 && high > 1) overlaps.push({ what: describe(hang), with: describe(other) });
      }
    }
    return { hangs: hangs.length, overlaps, lowest, cardBottom: cardElement.getBoundingClientRect().bottom };
  }, '[data-equation-scheme]');
}

async function expectNothingOverlaps(card: Locator): Promise<void> {
  const found = await overlapsOf(card);
  expect(found.hangs, 'the names were measured').toBeGreaterThan(0);
  expect(found.overlaps, 'no name or word overlaps anything below or beside it').toEqual([]);
  expect(found.lowest, "the lowest name ends inside the card").toBeLessThanOrEqual(found.cardBottom + 0.5);
}

async function openEquation(card: Locator, tap: boolean): Promise<Locator> {
  await card.scrollIntoViewIfNeeded();
  const summary = card.getByText('Show full equation');
  await (tap ? summary.tap() : summary.click());
  const scheme = card.getByRole('group', { name: 'Full equation' });
  await expect(scheme).toBeVisible();
  await expect(scheme.locator('[data-equation-term]').first()).toBeVisible();
  await expect(scheme.getByText('Drawing the structure…')).toHaveCount(0, { timeout: 60_000 });
  await expect(scheme.locator('[data-equation-name]').first()).toBeVisible();
  return scheme;
}

test('desktop 1280 x 800: a 60-character name overlaps nothing in the full equation', async ({ page }) => {
  test.setTimeout(240_000);
  expect(LONG_NAME).toHaveLength(60);
  const seen = await watch(page);
  await openDemo(page);
  await showSpecies(page, 'spc_ethanol', 'ethanol');
  await openNamesEditor(page, 'Ethanol');
  await canonicalInput(page).fill(LONG_NAME);
  await editorDialog(page, 'Ethanol').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editorDialog(page, 'Ethanol')).toBeHidden();
  await expect(record(page).getByRole('heading', { level: 3, name: LONG_NAME })).toBeVisible();

  await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
  await expect(page.getByRole('region', { name: /^Family page: Alcohols/ })).toBeVisible();
  const dismiss = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  while ((await dismiss.count()) > 0) await dismiss.first().click();
  await page.getByRole('button', { name: /^Aldehydes\s*\d+\s*reactions?$/ }).last().click();
  const card = cardOf(page, /ethanal \(PCC\)/);
  const scheme = await openEquation(card, false);
  await expect(scheme.locator('[data-equation-name]').filter({ hasText: LONG_NAME })).toHaveCount(1);
  await expectNothingOverlaps(card);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/equation-long-name-1280x800.png` });
  // control: a paragraph put over the long name IS reported, so the measurement can fail
  await card.evaluate((element) => {
    const name = element.querySelector('[data-equation-name]');
    if (name === null) throw new Error('no name');
    const rect = name.getBoundingClientRect();
    const intruder = document.createElement('p');
    intruder.textContent = 'intruder';
    intruder.style.cssText = `position:fixed;margin:0;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
    element.append(intruder);
    const at = intruder.getBoundingClientRect(); // a transformed ancestor may offset fixed boxes: move it by the difference
    intruder.style.transform = `translate(${rect.left - at.left}px, ${rect.top - at.top}px)`;
  });
  expect((await overlapsOf(card)).overlaps.length, 'an object over a name is detected').toBeGreaterThan(0);
  await expectClean(seen);
});

async function phoneWalk(page: Page, device: 'pixel7' | 'iphone14'): Promise<void> {
  test.setTimeout(300_000);
  expect(LONG_NAME).toHaveLength(60);
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Search' }).tap();
  await expect(palette(page)).toBeVisible();
  await searchFor(page, 's: ethanol');
  await palette(page).locator('[role="option"][data-record-id="spc_ethanol"]').tap();
  await page.getByRole('button', { name: 'Show the whole record' }).tap();
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  const dialog = editorDialog(page, 'Ethanol');
  await expect(dialog).toBeVisible();
  await canonicalInput(page).fill(LONG_NAME);
  await dialog.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Close inspector' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('button', { name: /^Alcohols/ }).tap();
  await expect(page.getByRole('region', { name: /^Family page: Alcohols/ })).toBeVisible();
  await page.getByRole('button', { name: /^Aldehydes\s*\d+\s*reactions?$/ }).last().tap();
  const card = cardOf(page, /ethanal \(PCC\)/);
  const scheme = await openEquation(card, true);
  await expect(scheme).toHaveAttribute('data-layout', 'stacked');
  await expect(scheme.locator('[data-equation-name]').filter({ hasText: LONG_NAME })).toHaveCount(1);
  await expectNothingOverlaps(card);
  await scheme.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  await page.screenshot({ path: `${shotsDir()}/phone-equation-long-name-${device}.png` });
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('a 60-character name overlaps nothing in the stacked equation', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium; Firefox has no touch emulation');
    await phoneWalk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('a 60-character name overlaps nothing in the stacked equation', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    await phoneWalk(page, 'iphone14');
  });
});

