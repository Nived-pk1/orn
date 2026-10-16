/**
 * The page never scrolls sideways with the inspector open (step 5.10a review; UI_ARCHITECTURE: the narrow behaviour is a drawer or sheet, not
 * a wider page). At 700 x 800 and at 1280 x 800, in Chromium, Firefox and WebKit: `scrollWidth <= clientWidth` of the document.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loadDemo, openApp, watch, expectClean } from './kit';

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const record = (page: Page) => page.getByRole('complementary', { name: 'Inspector' }).getByRole('article', { name: 'Record' });

/** The elements that reach past the right edge of the window (for the failure message). */
const wider = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const edge = document.documentElement.clientWidth;
    const found: string[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      const box = el.getBoundingClientRect();
      // an element inside a scrolling or clipping box that itself fits is not what widens the page
      let clipped = false;
      for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
        if (getComputedStyle(up).overflowX !== 'visible' && up.getBoundingClientRect().right <= edge + 1) clipped = true;
      }
      if (!clipped && box.width > 0 && box.right > edge + 1) found.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(box.right)}`);
      if (found.length >= 8) break;
    }
    return found;
  });

for (const width of [700, 1280]) {
  test(`with the inspector open the page is not wider than the window at ${width} x 800`, async ({ page }) => {
    test.setTimeout(240_000);
    const seen = await watch(page);
    await page.setViewportSize({ width, height: 800 });
    await openApp(page);
    await loadDemo(page);
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
    await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
    await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
    const show = page.getByRole('button', { name: 'Show inspector' });
    if ((await show.count()) > 0) await show.click();
    await expect(record(page)).toBeVisible();
    for (const level of [1, 2, 3, 4, 5]) {
      const button = record(page).getByRole('button', { name: new RegExp(`Level ${level}`) });
      if ((await button.count()) > 0 && (await button.getAttribute('aria-expanded')) === 'false') await button.click();
    }
    const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(sizes.scroll, `scrollWidth ${sizes.scroll} vs clientWidth ${sizes.client}; past the edge: ${JSON.stringify(await wider(page))}`).toBeLessThanOrEqual(sizes.client);
    await expectClean(seen);
  });
}
