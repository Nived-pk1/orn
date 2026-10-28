/**
 * The mouse wheel and the page width on the long pages (step 7.2a, A1; the user's bug on the Studio Review page at about 1700 px):
 * the wheel over the MIDDLE of a long list must move it (not only the scrollbar at the far right), and no page may be wider than
 * its window at 1280 and 1700 px. PRODUCTION build, every engine. The Review queue is the demo's own (well over 60 records).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loadDemo, openApp, watch } from './kit';

test.use({ actionTimeout: 60_000 });

const WIDTHS = [1280, 1700] as const;

async function open(page: Page, width: number, mode: string): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await openApp(page);
  await loadDemo(page);
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: mode, exact: true }).click();
}

/** Sum of every element's scrollTop plus the window's: whatever scrolled shows up as a bigger number. */
const scrolled = (page: Page): Promise<number> =>
  page.evaluate(() => {
    let sum = window.scrollY;
    for (const one of document.querySelectorAll('*')) sum += one.scrollTop;
    return sum;
  });

/** The widest ancestor overflow: every element from the point up to the root must fit its own width. */
const overflowing = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const bad: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) bad.push(`document ${root.scrollWidth} > ${root.clientWidth}`);
    for (const one of document.querySelectorAll('main, [data-virtual-list], section, [class*="canvas"]')) {
      const style = getComputedStyle(one);
      if (style.display === 'none' || (one as HTMLElement).offsetParent === null) continue;
      if (one.scrollWidth > one.clientWidth) bad.push(`${one.tagName}.${(one as HTMLElement).className} ${one.scrollWidth} > ${one.clientWidth}`);
    }
    return bad;
  });

for (const width of WIDTHS) {
  for (const mode of ['Review', 'Reactions', 'Workbench', 'Dataset']) {
    test(`${mode} at ${width} px: the wheel in the middle scrolls, the page is not wider than the window`, async ({ page }) => {
      test.setTimeout(180_000);
      await watch(page);
      await open(page, width, mode);
      if (mode === 'Review') {
        const rows = page.getByRole('list', { name: 'Records to review' }).getByRole('listitem');
        await expect(rows.first()).toBeVisible({ timeout: 60_000 });
        const total = Number(/^(\d+)/.exec((await page.getByText(/^\d+ records? to review$/).textContent()) ?? '')?.[1]);
        expect(total).toBeGreaterThanOrEqual(60);
      } else {
        await page.waitForTimeout(1500);
      }
      expect(await overflowing(page)).toEqual([]);
      // can anything on this page scroll down at all?
      const room = await page.evaluate(() => [...document.querySelectorAll('*')].some((one) => {
        const style = getComputedStyle(one);
        return /(auto|scroll)/.test(style.overflowY) && one.scrollHeight > one.clientHeight + 40 && (one as HTMLElement).offsetParent !== null;
      }));
      if (!room) return;
      const before = await scrolled(page);
      await page.mouse.move(Math.round(width * 0.35), 520);
      await page.mouse.wheel(0, 500);
      await expect.poll(() => scrolled(page), { timeout: 5000 }).toBeGreaterThan(before);
    });
  }
}
