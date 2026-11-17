/**
 * Step 8.4m2 (B1): while the view is the automatic fit, a change of the map area (the pane opening or closing) or of the boxes shown (a chapter to
 * "All chapters") fits again to the NEW size and boxes. The owner saw (Edge, 1920 x 1200) the map stay at the narrow fit, and a smaller set's zoom
 * keep cutting the top row and the side columns. Every box lies inside the map area each time; a hover afterwards moves nothing.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { clickNode, chipsSettled } from './map-focus-kit';
import { leaveChapters, loadDemo } from './kit';
import { NAVIGATOR } from './map-layout-kit';

const world = (page: Page): Promise<string | null> => page.locator('svg [data-world]').getAttribute('transform');

/** The family boxes that are not wholly inside the map area. */
async function cut(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const area = (document.querySelector('svg[role="group"]') as unknown as SVGElement).getBoundingClientRect();
    return [...document.querySelectorAll('svg [data-node-id][data-box]')]
      .filter((n) => {
        const b = n.getBoundingClientRect();
        return b.left < area.left - 1 || b.right > area.right + 1 || b.top < area.top - 1 || b.bottom > area.bottom + 1;
      })
      .map((n) => n.getAttribute('data-node-id') ?? '');
  });
}

/** The view has not moved for 600 ms. */
async function settled(page: Page): Promise<void> {
  let last = '';
  await expect
    .poll(async () => {
      const now = (await world(page)) ?? '';
      const still = now === last;
      last = now;
      if (!still) await page.waitForTimeout(600);
      return still;
    }, { timeout: 15_000 })
    .toBe(true);
}

/** The boxes spread over most of the area's width: the view is the fit for THIS area, not a narrower one kept from before. */
async function expectFills(page: Page, why: string): Promise<void> {
  const share = await page.evaluate(() => {
    const area = (document.querySelector('svg[role="group"]') as unknown as SVGElement).getBoundingClientRect();
    const boxes = [...document.querySelectorAll('svg [data-node-id][data-box]')].map((n) => n.getBoundingClientRect());
    return (Math.max(...boxes.map((b) => b.right)) - Math.min(...boxes.map((b) => b.left))) / area.width;
  });
  expect(share, `${why}: the boxes fill the area's width`).toBeGreaterThan(0.6);
}

async function everyBoxInside(page: Page, why: string): Promise<void> {
  await expect.poll(() => cut(page), { message: why, timeout: 15_000 }).toEqual([]);
}

test.describe('the automatic fit follows the area and the boxes (step 8.4m2, B1)', () => {
  test.use({ actionTimeout: 60_000 });

  test('a chapter then All chapters, a pick that opens the pane and its close: every box inside the area each time; a hover moves nothing', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1920, height: 1040 });
    await page.goto('/');
    await loadDemo(page);
    await leaveChapters(page);
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(900);
    const chapter = page.getByRole('combobox', { name: 'Chapter' });
    const options = await chapter.locator('option').allTextContents();
    expect(options.length, 'the demo has a chapter to choose').toBeGreaterThan(2);
    await chapter.selectOption({ index: 1 });
    await page.waitForTimeout(900);
    await everyBoxInside(page, 'one chapter chosen');
    await chapter.selectOption({ index: 0 });
    await page.waitForTimeout(400);
    await everyBoxInside(page, 'All chapters');
    await settled(page);
    await expectFills(page, 'All chapters');
    for (const round of [1, 2]) {
      await clickNode(page, page.locator('svg [data-node-id][data-box]').first());
      const hide = page.getByRole('button', { name: 'Hide inspector' });
      await expect(hide).toBeVisible();
      await chipsSettled(page);
      await everyBoxInside(page, `pane open, round ${round}`);
      await hide.click();
      await expect(page.getByRole('button', { name: 'Show inspector' })).toBeVisible();
      await everyBoxInside(page, `pane closed, round ${round}`);
      await settled(page);
      await expectFills(page, `pane closed, round ${round}`);
    }
    await settled(page);
    await expectFills(page, 'pane closed, settled');
    const before = await world(page);
    const second = page.locator('svg [data-node-id][data-box]').nth(1);
    await second.hover();
    await page.waitForTimeout(600);
    expect(await world(page), 'a hover leaves the view as it is').toBe(before);
  });
});
