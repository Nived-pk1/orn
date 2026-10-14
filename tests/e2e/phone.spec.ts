/**
 * The phone walk (release preview, part 1), PRODUCTION build, as a first-time visitor on two touch devices: Playwright's "iPhone 14"
 * (WebKit, 390 x 844) and "Pixel 7" (Chromium, 412 x 915; Firefox runs the same walk at that size without device emulation, which
 * it does not have). Stops: the first-run screen, the demo loaded, the overview map (pan and pinch where the engine can send them),
 * a family page, a reaction in the inspector and the inspector closed again, a search for "aldehyde". At each stop: the page does not
 * scroll sideways, no clipped text, every control at least 24 x 24 px, nothing behind the status bar, axe at WCAG 2.2 AA (which
 * includes target-size). A screenshot per stop goes to screenshots/phone-<device>-<n>-<stop>.png.
 */
import { devices, type CDPSession, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openApp, watch } from './kit';

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const record = (page: Page) => page.getByRole('complementary', { name: 'Inspector' }).getByRole('article', { name: 'Record' });

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

/** What is wrong with the page at this stop, as text (an empty list is a pass). */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth) problems.push(`page scrolls sideways: scrollWidth ${doc.scrollWidth} > clientWidth ${doc.clientWidth}`);
    const shown = (el: Element): boolean => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const label = (el: Element): string => `${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}]`;
    // text cut off: a clipping box whose content is wider than it is, without an ellipsis saying so
    for (const el of document.body.querySelectorAll('*')) {
      if (!shown(el) || el.closest('svg') !== null) continue;
      if (el.clientWidth <= 1) continue; // visually hidden text (a 1 px clip), not text a visitor sees
      const style = getComputedStyle(el);
      const clips = style.overflowX === 'hidden' || style.overflowX === 'clip';
      if (clips && el.scrollWidth > el.clientWidth + 1 && style.textOverflow !== 'ellipsis' && (el.textContent ?? '').trim() !== '') {
        problems.push(`text cut off in ${label(el)}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
      }
    }
    // a control inside a bar that scrolls sideways by design (the mode bar, the status bar) is reached by scrolling it
    const scrolledByDesign = (el: Element): boolean => {
      for (let up = el.parentElement; up !== null && up !== document.body; up = up.parentElement) {
        if (getComputedStyle(up).overflowX !== 'visible' && up.getBoundingClientRect().right <= doc.clientWidth + 1) return true;
      }
      return false;
    };
    // controls: reachable (inside the window sideways) and at least 24 x 24 px
    const status = document.querySelector('footer');
    const statusTop = status === null ? Infinity : status.getBoundingClientRect().top;
    for (const el of document.body.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="option"], [role="tab"]')) {
      if (!shown(el) || el.closest('svg') !== null || el.closest('[aria-hidden="true"]') !== null) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 24 || box.height < 24) problems.push(`control under 24 px: ${label(el)} ${Math.round(box.width)} x ${Math.round(box.height)}`);
      if ((box.right > doc.clientWidth + 1 || box.left < -1) && !scrolledByDesign(el)) problems.push(`control outside the window sideways: ${label(el)} ${Math.round(box.left)}..${Math.round(box.right)}`);
      const insideStatus = (status !== null && status.contains(el)) || el.closest('main') !== null; // main scrolls: what is below its edge is scrolled out, not behind the bar
      const topLayer = el.closest('dialog, [role="menu"], aside, nav') !== null;
      if (!insideStatus && !topLayer && box.bottom > statusTop + 1 && box.top < window.innerHeight) problems.push(`control behind the status bar: ${label(el)} bottom ${Math.round(box.bottom)} > ${Math.round(statusTop)}`);
    }
    return problems;
  });
}

async function stop(page: Page, device: string, n: number, name: string): Promise<void> {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/phone-${device}-${n}-${name}.png` });
  expect(await layoutProblems(page), `layout at stop ${n} (${name})`).toEqual([]);
  expect(await axeProblems(page, 10), `axe at stop ${n} (${name})`).toEqual([]);
}

type Touch = { x: number; y: number; id: number };
const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Touch[]): Promise<unknown> =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : points });
const scaleOf = (page: Page): Promise<number> =>
  page.evaluate(() => Number(/scale\((-?[\d.e+-]+)\)/.exec(document.querySelector('[data-world]')?.getAttribute('transform') ?? '')?.[1] ?? 'NaN'));

/** A point of the drawing that is not on any family or arrow (a gesture that starts on one selects it instead). */
async function emptyPoint(page: Page, margin: number): Promise<{ x: number; y: number }> {
  const svg = await page.getByRole('group', { name: NAVIGATOR }).boundingBox();
  if (svg === null) throw new Error('no drawing');
  for (let y = svg.y + svg.height - margin; y > svg.y + margin; y -= 20) {
    for (let x = svg.x + margin; x < svg.x + svg.width - margin; x += 20) {
      const free = await page.evaluate(([px, py]) => {
        const hit = document.elementFromPoint(px as number, py as number);
        return hit !== null && hit.closest('[data-node-id], [data-edge-id]') === null && hit.closest('svg[role="group"]') !== null;
      }, [x, y]);
      if (free) return { x, y };
    }
  }
  throw new Error('no empty point');
}

/** A one-finger drag then a two-finger pinch on the drawing (Chromium only: the DevTools protocol). */
async function panAndPinch(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const start = await emptyPoint(page, 20);
  await touch(cdp, 'touchStart', [{ ...start, id: 1 }]);
  for (let i = 1; i <= 6; i += 1) await touch(cdp, 'touchMove', [{ x: start.x + i * 6, y: start.y - i * 4, id: 1 }]);
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(100);
  const before = await scaleOf(page);
  const centre = await emptyPoint(page, 70);
  await touch(cdp, 'touchStart', [{ x: centre.x - 20, y: centre.y, id: 1 }, { x: centre.x + 20, y: centre.y, id: 2 }]);
  for (let i = 1; i <= 8; i += 1) await touch(cdp, 'touchMove', [{ x: centre.x - 20 - i * 6, y: centre.y, id: 1 }, { x: centre.x + 20 + i * 6, y: centre.y, id: 2 }]);
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(300);
  expect(await scaleOf(page), 'a pinch outwards zooms in').toBeGreaterThan(before);
  await cdp.detach();
}

/** The middle of a hub once the page has stopped moving: two equal reads in a row. */
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

async function walk(page: Page, device: string, pinch: boolean): Promise<void> {
  const seen = await watch(page);
  await openApp(page);
  await stop(page, device, 1, 'first-run');

  await page.getByRole('button', { name: 'About this preview' }).tap();
  await expect(page.getByRole('dialog', { name: 'About this preview' })).toContainText('has NOT been checked by an expert yet');
  await stop(page, device, 1.5, 'about');
  await page.getByRole('dialog', { name: 'About this preview' }).getByRole('button', { name: 'Close' }).first().tap();
  await expect(page.getByRole('dialog', { name: 'About this preview' })).toBeHidden();

  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByText(/^Imported \d+ records from demo\.orn\.json\./)).toBeVisible();
  await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
  await stop(page, device, 2, 'demo-loaded');

  // the import notice and the storage warning lie over the map; a visitor dismisses them before using it
  for (let n = 0; n < 4 && (await page.getByRole('button', { name: 'Dismiss' }).count()) > 0; n += 1) await page.getByRole('button', { name: 'Dismiss' }).first().tap();
  // Reviewer decision 1 (2026-10-14): the first view is the Fit view. Fit would fall below the scale where names are drawn on a phone
  // (case 2), so the first view is Fit's floor (LOD 1 threshold, from the top-left); the Fit button is on screen and changes nothing.
  const firstScale = await scaleOf(page);
  const fitButton = page.getByRole('button', { name: 'Fit' });
  await expect(fitButton).toBeInViewport({ ratio: 1 });
  await fitButton.tap();
  await page.waitForTimeout(700);
  expect(await scaleOf(page), 'Fit does not change the first view').toBeCloseTo(firstScale, 5);
  if (pinch) await panAndPinch(page);
  await stop(page, device, 3, 'overview-map');

  // a tap selects the family (the inspector sheet opens over the map); close it, then two taps open the family page
  await page.getByRole('button', { name: 'Fit' }).tap(); // the pinch above zoomed in; Fit brings the map back
  await page.waitForTimeout(700);
  const first = await centreOf(page, 'cls_alcohols');
  await page.touchscreen.tap(first.x, first.y);
  await expect(record(page)).toHaveAttribute('data-record-id', 'cls_alcohols', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Close inspector' }).tap();
  await expect(record(page)).toBeHidden();
  const again = await centreOf(page, 'cls_alcohols');
  await page.touchscreen.tap(again.x, again.y);
  await page.touchscreen.tap(again.x, again.y);
  const family = page.getByRole('region', { name: 'Family page: Alcohols' });
  await expect(family).toBeVisible();
  await stop(page, device, 4, 'family-page');

  await page.getByRole('button', { name: /^Aldehydes\s*3\s*reactions$/ }).tap();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: 'Ethanol → ethanal (PCC)' }) });
  await card.getByRole('button', { name: 'Ethanol → ethanal (PCC)' }).tap();
  await expect(record(page)).toBeVisible();
  await stop(page, device, 5, 'inspector-open');

  await page.getByRole('button', { name: 'Close inspector' }).tap();
  await expect(record(page)).toBeHidden();
  await stop(page, device, 6, 'inspector-closed');

  await page.getByRole('button', { name: 'Search' }).tap();
  const palette = page.getByRole('dialog', { name: 'Search' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').fill('aldehyde');
  await expect(palette.getByRole('status')).not.toHaveText('Search is starting');
  await expect(palette.getByRole('option').first()).toBeVisible();
  await stop(page, device, 7, 'search');
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium, Firefox at the same size)', () => {
  test.use({ ...PIXEL });
  test('first-run, demo, map, family, inspector open and closed, search', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit runs the iPhone 14 walk');
    test.skip(browserName === 'firefox', 'Playwright has no mobile or touch emulation for Firefox');
    test.setTimeout(240_000);
    await walk(page, browserName === 'chromium' ? 'pixel7' : 'pixel7-firefox', browserName === 'chromium');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('first-run, demo, map, family, inspector open and closed, search', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(240_000);
    await walk(page, 'iphone14', false);
  });
});
