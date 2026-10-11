/**
 * Touch on the overview map (step 5.7, part 2, item i), Chromium with touch emulation against the PRODUCTION build: a tap selects, two
 * taps open the family page, a one-finger drag pans, two fingers pinch-zoom, a 500 ms press opens the context menu, and on a coarse
 * pointer the hit path of an arrow is 44 screen pixels wide at any zoom. Zero policy violations, console errors and foreign requests.
 */
import { devices, expect, test, type CDPSession, type Page } from '@playwright/test';
import { expectClean, loadDemo, openApp, watch } from './kit';

test.use({ ...devices['Pixel 5'], viewport: { width: 1280, height: 800 } });

const drawing = (page: Page) => page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ });

async function openDemo(page: Page): Promise<void> {
  await openApp(page);
  await loadDemo(page);
  await expect(drawing(page)).toBeVisible();
  await page.waitForTimeout(700); // the first view settles
}

type Touch = { x: number; y: number; id: number };
const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Touch[]): Promise<unknown> =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : points.map((p) => ({ x: p.x, y: p.y, id: p.id })) });

const worldOf = (page: Page): Promise<{ x: number; y: number; scale: number }> =>
  page.evaluate(() => {
    const found = /translate\((-?[\d.e+-]+) (-?[\d.e+-]+)\) scale\((-?[\d.e+-]+)\)/.exec(document.querySelector('[data-world]')?.getAttribute('transform') ?? '');
    if (found === null) throw new Error('no transform');
    return { x: Number(found[1]), y: Number(found[2]), scale: Number(found[3]) };
  });

/** The middle of a family once the page has stopped moving (banners and toasts settle, the pane opens): two equal reads in a row. */
async function centreOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  let previous = '';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const box = await page.locator(`svg [data-node-id="${id}"]`).boundingBox();
    if (box === null) throw new Error(`${id} is not drawn`);
    const now = `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)}`;
    if (now === previous) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    previous = now;
    await page.waitForTimeout(250);
  }
  throw new Error(`${id} keeps moving`);
}

/** A point of the drawing that is not on any family or arrow. */
async function emptyPoint(page: Page): Promise<{ x: number; y: number }> {
  const svg = await drawing(page).boundingBox();
  if (svg === null) throw new Error('no drawing');
  for (let y = svg.y + svg.height - 20; y > svg.y + 20; y -= 25) {
    for (let x = svg.x + 20; x < svg.x + svg.width - 20; x += 25) {
      const free = await page.evaluate(([px, py]) => {
        const hit = document.elementFromPoint(px as number, py as number);
        return hit !== null && hit.closest('[data-node-id], [data-edge-id]') === null && hit.closest('svg[role="group"]') !== null;
      }, [x, y]);
      if (free) return { x, y };
    }
  }
  throw new Error('no empty point');
}

test.describe('touch on the overview map', () => {
  test('a tap selects at once and shows the inspector after the window; two taps open the family page', async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await watch(page);
    await openDemo(page);
    const at = await centreOf(page, 'cls_alcohols');
    await page.touchscreen.tap(at.x, at.y);
    await expect(page.getByText(/^Selected: Alcohols/)).toBeVisible();
    await expect(page.getByRole('status', { name: 'Navigator announcements' })).toContainText('Selected Alcohols');
    // the pane opens when the 300 ms window has passed and moves the drawing; the next tap is aimed after it has
    await expect(page.getByRole('complementary', { name: 'Inspector' }).getByRole('article', { name: 'Record' })).toHaveAttribute('data-record-id', 'cls_alcohols');
    const other = await centreOf(page, 'cls_aldehydes');
    await page.touchscreen.tap(other.x, other.y);
    await page.touchscreen.tap(other.x, other.y);
    await expect(page.getByRole('region', { name: /^Family page: Aldehydes/ })).toBeVisible();
    await expectClean(seen);
  });

  test('a 500 ms press opens the context menu on the family', async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await watch(page);
    await openDemo(page);
    const cdp = await page.context().newCDPSession(page);
    const at = await centreOf(page, 'cls_alcohols');
    await touch(cdp, 'touchStart', [{ ...at, id: 1 }]);
    await page.waitForTimeout(700);
    await expect(page.getByRole('menu', { name: /^Alcohols/ })).toBeVisible();
    await touch(cdp, 'touchEnd', []);
    await expect(page.getByRole('menuitem', { name: 'Open family page' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expectClean(seen);
  });

  test('one finger pans and selects nothing; two fingers pinch-zoom', async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await watch(page);
    await openDemo(page);
    const cdp = await page.context().newCDPSession(page);
    const start = await emptyPoint(page);
    const before = await worldOf(page);
    await touch(cdp, 'touchStart', [{ ...start, id: 1 }]);
    for (let step = 1; step <= 6; step += 1) await touch(cdp, 'touchMove', [{ x: start.x + step * 10, y: start.y - step * 6, id: 1 }]);
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(100);
    const panned = await worldOf(page);
    expect(Math.abs(panned.x - before.x) + Math.abs(panned.y - before.y)).toBeGreaterThan(20);
    expect(panned.scale).toBeCloseTo(before.scale, 5);
    await expect(page.getByText('Nothing is selected.')).toBeVisible();

    const centre = await emptyPoint(page);
    await touch(cdp, 'touchStart', [{ x: centre.x - 20, y: centre.y, id: 1 }, { x: centre.x + 20, y: centre.y, id: 2 }]);
    for (let step = 1; step <= 8; step += 1) {
      await touch(cdp, 'touchMove', [{ x: centre.x - 20 - step * 12, y: centre.y, id: 1 }, { x: centre.x + 20 + step * 12, y: centre.y, id: 2 }]);
    }
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(100);
    const zoomed = await worldOf(page);
    expect(zoomed.scale).toBeGreaterThan(panned.scale * 1.3);
    await expect(page.getByText('Nothing is selected.')).toBeVisible();
    await expectClean(seen);
  });

  test('on a coarse pointer the hit path of an arrow is 44 screen pixels wide, at any zoom', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);
    const style = await page.evaluate(() => {
      const hit = document.querySelector('[data-edge-id] path[data-hit]') as SVGPathElement;
      const computed = getComputedStyle(hit);
      return { width: computed.strokeWidth, effect: computed.vectorEffect };
    });
    expect(style).toEqual({ width: '44px', effect: 'non-scaling-stroke' });
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    expect((await worldOf(page)).scale).toBeLessThan(0.9);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-edge-id] path[data-hit]') as SVGPathElement).strokeWidth)).toBe('44px');
    await expectClean(seen);
  });
});
