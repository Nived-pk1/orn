/**
 * The phone walk (phone mode, part 4; ADR-039), PRODUCTION build, as a first-time visitor on two touch devices: Playwright's "iPhone 14"
 * (WebKit, 390 x 844) and "Pixel 7" (Chromium, 412 x 915; Firefox has no mobile or touch emulation and skips). The layout is the phone
 * layout: a slim top bar (ORN, Search, More), the bottom tabs Families | Map | Search, the bottom-sheet inspector. Stops: the first-run
 * screen and its About dialog, the demo's Families tab, the More menu, the Map tab (floating Fit and Legend; pan and a pinch that cannot
 * go below the name floor, where the engine can send them), the Legend sheet, a tap on an arrow (its reactions), a tap on a family (the
 * sheet at peek), the family page, a reaction in the sheet at peek and at full and the sheet closed, the Search tab with "aldehyde",
 * (the remembered tab after a reload is its own test below). At each stop: the page does not scroll sideways, no clipped text, every control at least 24 x 24
 * px, nothing behind the tab bar, and axe at WCAG 2.2 AA. Screenshots go to screenshots/phone2-<device>-<n>-<stop>.png.
 */
import { devices, type CDPSession, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch, exampleCard } from './kit';

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
/** FIT_FLOOR of src/render/viewport/transform.ts (LOD 1 entry with hysteresis, 0.35 x 1.05, plus 0.01): the smallest scale a phone map reaches. */
const FIT_FLOOR = 0.3775;
const sheet = (page: Page) => page.locator('aside[data-sheet]');
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Home' });

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
    // controls: reachable (inside the window sideways) and at least 24 x 24 px; none under the tab bar
    const bar = document.querySelector('nav[aria-label="Home"]');
    const barTop = bar === null ? Infinity : bar.getBoundingClientRect().top;
    for (const el of document.body.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="option"], [role="tab"]')) {
      if (!shown(el) || el.closest('svg') !== null || el.closest('[aria-hidden="true"]') !== null) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 24 || box.height < 24) problems.push(`control under 24 px: ${label(el)} ${Math.round(box.width)} x ${Math.round(box.height)}`);
      if (box.right > doc.clientWidth + 1 || box.left < -1) problems.push(`control outside the window sideways: ${label(el)} ${Math.round(box.left)}..${Math.round(box.right)}`);
      const insideBar = bar !== null && bar.contains(el);
      const topLayer = el.closest('dialog, [role="menu"], aside') !== null || el.closest('main') !== null; // main scrolls: what is below its edge is scrolled out, not behind the bar
      if (!insideBar && !topLayer && box.bottom > barTop + 1 && box.top < window.innerHeight) problems.push(`control behind the tab bar: ${label(el)} bottom ${Math.round(box.bottom)} > ${Math.round(barTop)}`);
    }
    return problems;
  });
}

async function stop(page: Page, device: string, n: number, name: string): Promise<void> {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/phone2-${device}-${n}-${name}.png` });
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

/** Two fingers on the drawing, `spread` px apart at the start and `to` px at the end (Chromium only: the DevTools protocol). */
async function pinch(page: Page, cdp: CDPSession, from: number, to: number): Promise<void> {
  const centre = await emptyPoint(page, 40);
  const steps = 8;
  const at = (i: number): number => from + ((to - from) * i) / steps;
  await touch(cdp, 'touchStart', [{ x: centre.x - from / 2, y: centre.y, id: 1 }, { x: centre.x + from / 2, y: centre.y, id: 2 }]);
  for (let i = 1; i <= steps; i += 1) await touch(cdp, 'touchMove', [{ x: centre.x - at(i) / 2, y: centre.y, id: 1 }, { x: centre.x + at(i) / 2, y: centre.y, id: 2 }]);
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(300);
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

/** A tap on a family; the map may still be settling (a second layout), so a tap that opens nothing is made again. */
async function tapFamily(page: Page, id: string, name: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const at = await centreOf(page, id);
    await page.touchscreen.tap(at.x, at.y);
    if (await page.getByRole('complementary', { name }).isVisible({ timeout: 6_000 }).catch(() => false)) return;
    await page.waitForTimeout(1_000);
  }
  throw new Error(`a tap on ${id} did not open its sheet`);
}

/** Points on the drawn arrows (their hit paths, in screen pixels), the ones a finger can reach first. */
async function arrowPoints(page: Page): Promise<{ id: string; x: number; y: number; several: boolean }[]> {
  return page.evaluate(() => {
    const out: { id: string; x: number; y: number; several: boolean }[] = [];
    const frame = document.querySelector('svg[role="group"]')?.getBoundingClientRect();
    if (frame === undefined) return out;
    for (const hit of document.querySelectorAll<SVGGeometryElement>('[data-edge-id] [data-hit]')) {
      const id = hit.closest('[data-edge-id]')?.getAttribute('data-edge-id') ?? '';
      const matrix = hit.getScreenCTM();
      if (matrix === null || typeof hit.getTotalLength !== 'function') continue;
      const length = hit.getTotalLength();
      for (const fraction of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.15, 0.85, 0.1, 0.9]) {
        const point = hit.getPointAtLength(length * fraction);
        const x = point.x * matrix.a + point.y * matrix.c + matrix.e;
        const y = point.x * matrix.b + point.y * matrix.d + matrix.f;
        if (x < frame.left + 8 || x > frame.right - 8 || y < frame.top + 8 || y > frame.bottom - 8) continue;
        const on = document.elementFromPoint(x, y)?.closest('[data-edge-id]')?.getAttribute('data-edge-id');
        if (on === id) {
          const several = /(?:^|\D)(?:[2-9]|\d\d+) reactions/.test(hit.closest('[data-edge-id]')?.getAttribute('aria-label') ?? '');
          out.push({ id, x, y, several });
          break;
        }
      }
    }
    return out;
  });
}

async function walk(page: Page, device: string, pinching: boolean): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await stop(page, device, 1, 'first-run');

  await page.getByRole('button', { name: 'About this preview' }).tap();
  await expect(page.getByRole('dialog', { name: 'About this preview' })).toContainText('has NOT been checked by an expert yet');
  await stop(page, device, 1.5, 'about');
  await page.getByRole('dialog', { name: 'About this preview' }).getByRole('button', { name: 'Close' }).first().tap();
  await expect(page.getByRole('dialog', { name: 'About this preview' })).toBeHidden();

  // the demo: the phone opens on the Families tab (cards), with no status line and no toolbar
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByText(/^Imported \d+ records from demo\.orn\.json\./)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await expect(tabs(page).getByRole('button', { name: 'Families' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: /^Alcohols/ })).toBeVisible();
  await expect(page.locator('footer')).toHaveCount(0);
  await stop(page, device, 2, 'families');

  // More: File items, Exam scope, Dataset counts, About, Status
  await page.getByRole('button', { name: 'More' }).tap();
  const more = page.getByRole('dialog', { name: 'More' });
  await expect(more.getByRole('button', { name: 'Import a file...' })).toBeVisible();
  await expect(more.getByRole('button', { name: 'Status' })).toBeVisible();
  await stop(page, device, 3, 'more');
  await more.getByRole('button', { name: 'Close' }).first().tap();
  await expect(more).toBeHidden();

  // the Map tab: a floating Fit and Legend, no toolbar row; names are drawn
  await tabs(page).getByRole('button', { name: 'Map' }).tap();
  await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
  await expect.poll(() => page.locator('svg[role="group"]').getAttribute('data-lod'), { message: 'LOD after the map shows' }).not.toBe('0');
  await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fit' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Legend' })).toBeInViewport({ ratio: 1 });
  const first = await scaleOf(page);
  expect(first, 'the first view is the name floor on a phone').toBeGreaterThanOrEqual(FIT_FLOOR - 0.001);
  if (pinching) {
    const cdp = await page.context().newCDPSession(page);
    await pinch(page, cdp, 200, 40); // fingers together: zoom out
    expect(await scaleOf(page), 'a pinch in cannot go below the name floor').toBeGreaterThanOrEqual(FIT_FLOOR - 0.001);
    await pinch(page, cdp, 60, 260); // fingers apart: zoom in
    expect(await scaleOf(page), 'a pinch out zooms in').toBeGreaterThan(first);
    await cdp.detach();
    await page.getByRole('button', { name: 'Fit' }).tap();
    await page.waitForTimeout(700);
    expect(await scaleOf(page), 'Fit is the floor again').toBeCloseTo(first, 3);
  }
  await stop(page, device, 4, 'map');

  // Legend: a sheet with the legend's content
  await page.getByRole('button', { name: 'Legend' }).tap();
  await expect(page.getByRole('dialog', { name: 'Legend' })).toContainText('number of reactions on this arrow');
  await stop(page, device, 5, 'legend');
  await page.getByRole('dialog', { name: 'Legend' }).getByRole('button', { name: 'Close' }).first().tap();
  await expect(page.getByRole('dialog', { name: 'Legend' })).toBeHidden();

  // a tap on an arrow: the sheet opens with that arrow's reactions (one reaction: the reaction; several: a list)
  // arrows that carry several (chip 2 or more) first. The sheet opens at peek for every tap and shows the arrow's reactions: a list when the
  // arrow joins several different reactions (an arrow's chip also counts outcomes, so its reaction may be one), that one reaction otherwise.
  const points = (await arrowPoints(page)).sort((x, y) => Number(y.several) - Number(x.several));
  expect(points.length, 'arrows are on the screen').toBeGreaterThan(0);
  const tapped = points.slice(0, 5);
  let listed = false;
  for (const [at, arrow] of tapped.entries()) {
    if (at > 0) await page.getByRole('button', { name: 'Close inspector' }).tap();
    await page.touchscreen.tap(arrow.x, arrow.y);
    await expect(sheet(page)).toHaveAttribute('data-sheet', 'peek');
    const list = page.getByRole('region', { name: 'Reactions on this arrow' });
    const record = page.getByRole('article', { name: 'Record' });
    await expect(list.or(record), 'the sheet shows the reactions of the arrow').toBeVisible();
    if (await list.isVisible()) {
      listed = true;
      break;
    }
  }
  test.info().annotations.push({ type: 'arrow', description: `${points.length} arrows on screen, ${tapped.length} tapped; list of several reactions shown: ${listed}` });
  await stop(page, device, 6, 'arrow-sheet');
  await page.getByRole('button', { name: 'Close inspector' }).tap();
  await expect(sheet(page)).toBeHidden();

  // one tap on a family: the sheet at peek, with the main actions; Open family opens the page and the sheet goes
  await tapFamily(page, 'cls_alcohols', 'Alcohols');
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'peek');
  await stop(page, device, 7, 'family-peek');
  await page.getByRole('complementary', { name: 'Alcohols' }).getByRole('button', { name: 'Open family' }).tap();
  await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
  await expect(sheet(page)).toBeHidden();
  await stop(page, device, 8, 'family-page');

  // a reaction card: the sheet at peek, swipe up to full, then closed
  await page.getByRole('button', { name: /^Aldehydes\s*2\s*reactions$/ }).last().tap();
  const card = await exampleCard(page, 'Ethanol → ethanal (PCC)'); // folded under the general oxidation (7.3a C1)
  await card.getByRole('button', { name: 'Ethanol → ethanal (PCC)' }).tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'peek');
  await stop(page, device, 9, 'reaction-peek');
  await page.getByRole('button', { name: 'Show the whole record' }).tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'full');
  await stop(page, device, 10, 'reaction-full');
  await page.getByRole('button', { name: 'Close inspector' }).tap();
  await expect(sheet(page)).toBeHidden();
  await stop(page, device, 11, 'sheet-closed');

  // the Search tab: the palette on the whole screen
  await tabs(page).getByRole('button', { name: 'Search' }).tap();
  const palette = page.getByRole('dialog', { name: 'Search' });
  await expect(palette).toBeVisible();
  const frame = await palette.boundingBox();
  const viewport = page.viewportSize();
  expect(frame?.width ?? 0, 'the palette fills the screen').toBeGreaterThanOrEqual((viewport?.width ?? 0) - 1);
  await palette.getByRole('combobox').fill('aldehyde');
  await expect(palette.getByRole('status')).not.toHaveText('Search is starting');
  await expect(palette.getByRole('option').first()).toBeVisible();
  await stop(page, device, 12, 'search');
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  await expectClean(seen);
}

/** The last tab is remembered: the Map tab survives a reload (its own test: a reload starts a new document, and the page-error watch is per document). */
async function remembered(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await tabs(page).getByRole('button', { name: 'Map' }).tap();
  await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
  await page.waitForTimeout(1_500); // the saved view state is written after a short quiet time
  await page.reload();
  await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible({ timeout: 60_000 });
  await expect(tabs(page).getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
  await tabs(page).getByRole('button', { name: 'Families' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.waitForTimeout(1_500);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible({ timeout: 60_000 });
  await expect(tabs(page).getByRole('button', { name: 'Families' })).toHaveAttribute('aria-current', 'page');
  await tabs(page).getByRole('button', { name: 'Map' }).tap();
  await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
  await stop(page, device, 13, 'map-tab-chosen');
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium, Firefox at the same size)', () => {
  test.use({ ...PIXEL });
  test('first-run, families, more, map, legend, arrow, family, reaction sheet, search', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit runs the iPhone 14 walk');
    test.skip(browserName === 'firefox', 'Playwright has no mobile or touch emulation for Firefox');
    test.setTimeout(300_000);
    await walk(page, 'pixel7', true);
  });
  test('the last tab is remembered after a reload', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(180_000);
    await remembered(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('first-run, families, more, map, legend, arrow, family, reaction sheet, search', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await walk(page, 'iphone14', false);
  });
  test('the last tab is remembered after a reload', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(180_000);
    await remembered(page, 'iphone14');
  });
});
