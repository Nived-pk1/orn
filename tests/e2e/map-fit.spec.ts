/**
 * Step 8.4b, Part E, the STUDIO build, own-data layout fixture: Fit is sticky (E2a): opening the inspector keeps the WHOLE map fitted, every family
 * on screen; "Zoom to selection" (the button in the "Selected" label, key Z) fits the focus set with titles of at least 12 px; the toolbar's Fit
 * fits the whole map again; after the person pans, a pane that opens does not move the view. The phone's "Show all n" leaves the map its room (E3).
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { boxTitlePx } from './box-text';
import { FAMILY_ONE, NAVIGATOR, openMapDesktop, openMapPhone } from './map-layout-kit';
import { chipsSettled, clickNode } from './map-focus-kit';
import { clickToolbar } from './map-toolbar-kit';
import { shotsDir } from './editor-kit';
import { leaveChapters, loadDemo } from './kit';

const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const FOCUS_TITLES = 'svg [data-label-of]:not([class*="faded"]) text:first-of-type';

/** How many family boxes are not wholly inside the map area. */
async function offScreen(page: Page): Promise<number> {
  return page.evaluate(() => {
    const area = (document.querySelector('svg[role="group"]') as unknown as SVGElement).getBoundingClientRect();
    return [...document.querySelectorAll('svg [data-node-id]')].filter((n) => {
      const b = n.getBoundingClientRect();
      return b.left < area.left || b.right > area.right || b.top < area.top || b.bottom > area.bottom;
    }).length;
  });
}

/** After "Zoom to selection": the selected box is wholly inside the map area, and no side has more than 48 px of empty map while focus-set boxes are cut on the opposite side. */
async function placementProblems(page: Page, selectedId: string): Promise<string[]> {
  return page.evaluate((id) => {
    const area = (document.querySelector('svg[role="group"]') as unknown as SVGElement).getBoundingClientRect();
    const rectOf = (key: string): DOMRect | undefined => document.querySelector(`svg [data-node-id="${key}"]`)?.getBoundingClientRect();
    const problems: string[] = [];
    const own = rectOf(id);
    if (own === undefined) return ['the selected box is not drawn'];
    if (own.left < area.left || own.right > area.right || own.top < area.top || own.bottom > area.bottom) problems.push('the selected box is not fully visible');
    const focus = [...document.querySelectorAll('svg [data-label-of]:not([class*="faded"])')].map((el) => rectOf(el.getAttribute('data-label-of') ?? '')).filter((r): r is DOMRect => r !== undefined);
    const edge = { left: Math.min(...focus.map((r) => r.left)) - area.left, top: Math.min(...focus.map((r) => r.top)) - area.top, right: area.right - Math.max(...focus.map((r) => r.right)), bottom: area.bottom - Math.max(...focus.map((r) => r.bottom)) };
    const pairs = [['left', 'right'], ['right', 'left'], ['top', 'bottom'], ['bottom', 'top']] as const;
    for (const [empty, cut] of pairs) if (edge[empty] > 48 && edge[cut] < 0) problems.push(`${empty}: ${edge[empty].toFixed(0)} px empty while focus boxes are cut on the ${cut}`);
    return problems;
  }, selectedId);
}

/** ADR-037: Fit never goes below this zoom (the names stay drawn); a map too wide for the area at that zoom is pannable. */
const FIT_FLOOR = 0.3775;
const scaleOf = (page: Page): Promise<number> => page.evaluate(() => (document.querySelector('svg [data-world]') as unknown as SVGGraphicsElement).getScreenCTM()?.a ?? 0);

/** How far the families reach past the map area, in px (right, bottom), and the families on the top-left corner that are not wholly on screen. */
async function overflow(page: Page): Promise<{ right: number; bottom: number; topLeftCut: boolean }> {
  return page.evaluate(() => {
    const area = (document.querySelector('svg[role="group"]') as unknown as SVGElement).getBoundingClientRect();
    const boxes = [...document.querySelectorAll('svg [data-node-id]')].map((n) => n.getBoundingClientRect());
    const first = boxes.reduce((a, b) => (b.left + b.top < a.left + a.top ? b : a));
    return { right: Math.max(...boxes.map((b) => b.right)) - area.right, bottom: Math.max(...boxes.map((b) => b.bottom)) - area.bottom, topLeftCut: first.left < area.left || first.top < area.top || first.right > area.right || first.bottom > area.bottom };
  });
}

const world = (page: Page): Promise<string | null> => page.locator('svg [data-world]').getAttribute('transform');

test.describe('Fit: sticky; Zoom to selection is a command', () => {
  test.use({ actionTimeout: 60_000 });

  for (const size of [{ width: 1280, height: 800 }, { width: 1366, height: 768 }, { width: 1920, height: 1000 }]) {
    test(`inspector open: the whole map stays fitted; Zoom to selection: titles of at least 12 px; Fit: the whole map again (${size.width} x ${size.height})`, async ({ page }, info) => {
      test.setTimeout(300_000);
      await openMapDesktop(page);
      await page.setViewportSize(size);
      await page.waitForTimeout(900);
      const shut = await boxTitlePx(page);
      await clickNode(page, page.locator(`svg [data-node-id="${FAMILY_ONE}"]`));
      const hide = page.getByRole('button', { name: 'Hide inspector' });
      const show = page.getByRole('button', { name: 'Show inspector' });
      await expect(hide.or(show)).toBeVisible(); // the pane may still be opening: do not read the count too early
      if ((await hide.count()) === 0) await page.getByRole('button', { name: 'Show inspector' }).click();
      await expect(hide).toBeVisible();
      await chipsSettled(page);
      // ADR-037's floor case (step 8.4e, reviewer decision): above FIT_FLOOR the whole map stays on screen; clamped AT the floor the zoom IS the floor, names are
      // drawn, the top-left family is wholly on screen and the rest is reachable by panning. (At 1280 x 800 the pane leaves 712 px; the fixture needs 0.378 there.)
      await expect.poll(() => scaleOf(page), { message: 'the view settles' }).toBeGreaterThan(0);
      const atFloor = (await scaleOf(page)) <= FIT_FLOOR + 0.001;
      if (!atFloor) {
        await expect.poll(() => offScreen(page), { message: 'the whole map is still fitted: every family on screen' }).toBe(0);
      } else {
        expect(Math.abs((await scaleOf(page)) - FIT_FLOOR), 'clamped Fit sits at the floor').toBeLessThan(0.001);
        expect(await boxTitlePx(page), 'names are drawn at the floor').toBeGreaterThan(0);
        const edge = await overflow(page);
        expect(edge.topLeftCut, 'the top-left family is wholly on screen').toBe(false);
        const area = (await page.locator('svg[role="group"]').boundingBox()) as { x: number; y: number; width: number; height: number };
        const from = { x: area.x + area.width * 0.6, y: area.y + area.height - 6 };
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x - Math.max(0, edge.right) - 12, from.y - Math.max(0, edge.bottom) - 4, { steps: 6 });
        await page.mouse.up();
        await expect.poll(async () => (await overflow(page)).right, { message: 'panning brings the far family wholly on screen' }).toBeLessThanOrEqual(0.5);
        await expect.poll(async () => (await overflow(page)).bottom, { message: 'and the lowest one' }).toBeLessThanOrEqual(0.5);
        await clickToolbar(page, 'Fit');
        await expect.poll(() => scaleOf(page)).toBeLessThan(FIT_FLOOR + 0.002);
      }
      const whole = await boxTitlePx(page);
      await page.screenshot({ path: `${shotsDir()}/map-fit-pane-open-${size.width}x${size.height}.png` });
      await page.getByRole('button', { name: /^Zoom to / }).click();
      await expect.poll(() => boxTitlePx(page, FOCUS_TITLES), { message: 'focus-set titles' }).toBeGreaterThanOrEqual(11.99); // 12 px up to floating-point rounding (Firefox 11.9999997)
      const zoomed = await boxTitlePx(page, FOCUS_TITLES);
      await page.waitForTimeout(600); // the move takes 200 ms
      expect(await placementProblems(page, FAMILY_ONE), 'where Zoom to selection puts the view').toEqual([]);
      await page.screenshot({ path: `${shotsDir()}/map-fit-zoomed-${size.width}x${size.height}.png` });
      info.annotations.push({ type: 'title px', description: `${size.width}x${size.height}: pane shut ${shut.toFixed(1)}; pane open, whole map ${whole.toFixed(1)}; zoomed to selection ${zoomed.toFixed(1)}` });
      await clickToolbar(page, 'Fit');
      if (atFloor) await expect.poll(() => scaleOf(page), { message: 'Fit returns to the floor (the whole map is pannable)' }).toBeLessThan(FIT_FLOOR + 0.002);
      else await expect.poll(() => offScreen(page), { message: 'Fit shows the whole map' }).toBe(0);
    });
  }

  // reviewer decision (resume 3): the DEMO map is smaller than the layout fixture, so at 1280 x 800 the pane leaves room for the whole of it
  test('the demo map: with the inspector open at 1280 x 800 the whole map stays fitted', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await loadDemo(page);
    await leaveChapters(page);
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(900);
    const first = page.locator('svg [data-node-id]').first();
    await clickNode(page, first);
    const hide = page.getByRole('button', { name: 'Hide inspector' });
    const show = page.getByRole('button', { name: 'Show inspector' });
    await expect(hide.or(show)).toBeVisible(); // the pane may still be opening: do not read the count too early
    if ((await hide.count()) === 0) await page.getByRole('button', { name: 'Show inspector' }).click();
    await expect(hide).toBeVisible();
    await chipsSettled(page);
    expect(await scaleOf(page), 'the demo is fitted above the floor').toBeGreaterThan(FIT_FLOOR + 0.001);
    await expect.poll(() => offScreen(page), { message: 'the whole demo map is on screen with the pane open' }).toBe(0);
  });

  test('the key Z zooms to the selection when the map has the focus', async ({ page }) => {
    test.setTimeout(300_000);
    await openMapDesktop(page);
    await clickNode(page, page.locator(`svg [data-node-id="${FAMILY_ONE}"]`));
    await chipsSettled(page);
    const before = await world(page);
    await page.locator('svg[role="group"]').focus();
    await page.keyboard.press('z');
    await expect.poll(() => world(page)).not.toBe(before);
  });

  test('after the person pans, a pane that opens does not move the view; a double click on a box still opens its page', async ({ page }) => {
    test.setTimeout(300_000);
    await openMapDesktop(page);
    const svg = page.locator('svg[role="group"]');
    const box = (await svg.boundingBox()) as { x: number; y: number; width: number; height: number };
    await page.mouse.move(box.x + 6, box.y + box.height - 6);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + box.height - 30, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const panned = await world(page);
    await page.getByRole('button', { name: 'Show inspector' }).click();
    await expect(page.getByRole('button', { name: 'Hide inspector' })).toBeVisible();
    await page.waitForTimeout(800);
    expect(await world(page)).toBe(panned);
    await clickToolbar(page, 'Fit');
    await page.waitForTimeout(500);
    await page.locator(`svg [data-node-id="${FAMILY_ONE}"]`).dblclick();
    await expect(page.locator('svg[role="group"]')).toHaveCount(0);
  });
});

test.describe('the phone: From A to B, Show all', () => {
  test.use({ ...PIXEL, actionTimeout: 60_000 });

  test('Show all n leaves at least 30% of the screen height for the map; the list scrolls inside the sheet', async ({ page }) => {
    test.setTimeout(300_000);
    await openMapPhone(page);
    await page.getByRole('button', { name: 'From A to B' }).tap();
    const panel = page.getByRole('complementary', { name: 'From A to B' });
    await expect(panel).toBeVisible();
    const from = panel.getByRole('combobox', { name: 'From' });
    const to = panel.getByRole('combobox', { name: 'To' });
    const values = await from.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ''));
    let opened = false;
    for (const a of values.slice(0, 8)) {
      await from.selectOption(a);
      const targets = await to.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ''));
      for (const b of targets.slice(0, 8)) {
        await to.selectOption(b);
        const all = panel.getByRole('button', { name: /^Show all \d+$/ });
        if ((await all.count()) > 0) {
          await all.tap();
          opened = true;
          break;
        }
      }
      if (opened) break;
    }
    expect(opened).toBe(true);
    const room = await page.evaluate(() => {
      const map = (document.querySelector('svg[role="group"]') as unknown as SVGElement).getBoundingClientRect();
      const sheet = (document.querySelector('aside[aria-label="From A to B"]') as HTMLElement).getBoundingClientRect();
      return { visible: Math.min(map.bottom, sheet.top) - map.top, screen: window.innerHeight };
    });
    expect(room.visible).toBeGreaterThanOrEqual(0.3 * room.screen);
    await page.screenshot({ path: `${shotsDir()}/map-phone-a-to-b-show-all.png` });
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
  });
});
