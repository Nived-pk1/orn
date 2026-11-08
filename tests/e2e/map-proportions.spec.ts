/**
 * Step 8.4c, the STUDIO build: the map's proportions are back to the airy old map (A: column gap at least 1.4 box widths, row gap at least 2 box
 * heights, nothing in a box overlaps), marks grow with the map within limits (B), and a two-way pair is TWO separate parallel lines, one per
 * direction (C; user decision 2026-11-08). Screenshots go to screenshots/.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { leaveChapters, loadDemo } from './kit';
import { shotsDir } from './editor-kit';
import { boxTitlePx } from './box-text';
import { cornerLabel } from './map-toolbar-kit';
import { NAVIGATOR, openMapDesktop } from './map-layout-kit';
import { PAIR_DATA } from './map-marks-kit';
import { chipsSettled, clickNode } from './map-focus-kit';
import { edgeGap, gapRatios, hubRects, linesBetween, markSizes, overlapsInBoxes } from './map-proportions-kit';

async function openDemoAt(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await loadDemo(page);
  await leaveChapters(page);
  await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(1200);
}

const FAM8 = 'cls_family-08';
const FAM13 = 'cls_family-13';

async function zoomIn(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(900);
  }
  await chipsSettled(page);
}

test.describe('A. proportions', () => {
  test.use({ actionTimeout: 60_000 });

  for (const size of [{ width: 1389, height: 868 }, { width: 1920, height: 1000 }]) {
    test(`the demo at Fit (${size.width} x ${size.height}): column gap at least 1.4 widths, row gap at least 2 heights, nothing overlaps in a box`, async ({ page }) => {
      test.setTimeout(300_000);
      await openDemoAt(page, size.width, size.height);
      const ratios = gapRatios(await hubRects(page));
      console.log(`demo ${size.width}x${size.height}: columns ${ratios.columns.toFixed(2)}, rows ${ratios.rows.toFixed(2)}, ${ratios.pairs} neighbours; title ${(await boxTitlePx(page)).toFixed(2)} px`);
      expect(ratios.pairs).toBeGreaterThan(0);
      expect(ratios.columns).toBeGreaterThanOrEqual(1.4 - 0.02);
      expect(ratios.rows).toBeGreaterThanOrEqual(2 - 0.02);
      expect(await overlapsInBoxes(page)).toEqual([]);
      await page.screenshot({ path: `${shotsDir()}/map-proportions-now-${size.width}x${size.height}.png` });
    });
  }

  test('the 20-family fixture at Fit (1920 x 1000): the same ratios; nothing overlaps in a box', async ({ page }) => {
    test.setTimeout(300_000);
    await openMapDesktop(page);
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.waitForTimeout(1200);
    const ratios = gapRatios(await hubRects(page));
    console.log(`fixture 1920x1000: columns ${ratios.columns.toFixed(2)}, rows ${ratios.rows.toFixed(2)}, ${ratios.pairs} neighbours; title ${(await boxTitlePx(page)).toFixed(2)} px`);
    expect(ratios.columns).toBeGreaterThanOrEqual(1.4 - 0.02);
    expect(ratios.rows).toBeGreaterThanOrEqual(2 - 0.02);
    expect(await overlapsInBoxes(page)).toEqual([]);
    await page.screenshot({ path: `${shotsDir()}/map-proportions-fixture-1920x1000.png` });
  });

  test('the demo at 1280 x 800 with the pane shut: box titles at least 10 px at Fit (reviewer decision, 8.4c A.4)', async ({ page }) => {
    test.setTimeout(300_000);
    await openDemoAt(page, 1280, 800);
    const px = await boxTitlePx(page);
    console.log(`demo 1280x800: box title ${px.toFixed(2)} px`);
    expect(px).toBeGreaterThanOrEqual(10);
  });
});

test.describe('B. marks grow with the map', () => {
  test.use({ actionTimeout: 60_000 });

  test('at Fit the 8.4b minimums hold; after 3 zoom-ins the stroke is above its minimum and within its maximum, and the chips grew', async ({ page }) => {
    test.setTimeout(400_000);
    await openMapDesktop(page, PAIR_DATA());
    await page.getByRole('combobox', { name: 'Chapter' }).selectOption('top_chapter-4');
    await page.waitForTimeout(1500);
    await chipsSettled(page);
    const fit = await markSizes(page);
    expect(fit.strokes.length).toBeGreaterThan(0);
    fit.strokes.forEach((s) => expect(s).toBeGreaterThanOrEqual(2 - 0.05));
    fit.hits.forEach((h) => expect(h).toBeGreaterThanOrEqual(16 - 0.05));
    fit.heads.forEach((h) => expect(h).toBeGreaterThanOrEqual(10 - 0.2));
    fit.chipHeights.forEach((h) => expect(h).toBeGreaterThanOrEqual(19.9));
    fit.chipText.forEach((h) => expect(h).toBeGreaterThanOrEqual(11.9));
    await zoomIn(page, 3);
    const big = await markSizes(page);
    console.log(`zoom ${fit.zoom.toFixed(2)} -> ${big.zoom.toFixed(2)}: stroke ${Math.min(...fit.strokes).toFixed(2)} -> ${Math.min(...big.strokes).toFixed(2)}, chip ${Math.min(...fit.chipHeights).toFixed(1)} -> ${Math.min(...big.chipHeights).toFixed(1)}`);
    expect(big.zoom).toBeGreaterThan(fit.zoom);
    expect(Math.min(...big.strokes)).toBeGreaterThan(Math.min(...fit.strokes) + 0.05); // above its minimum (a heavy line: 3 px, then up to 5)
    big.strokes.forEach((s) => expect(s).toBeLessThanOrEqual(5 + 0.05)); // 4 for a normal line, 5 for a heavy one
    big.heads.forEach((h) => expect(h).toBeLessThanOrEqual(16 + 0.3));
    expect(Math.min(...big.chipHeights)).toBeGreaterThan(Math.min(...fit.chipHeights) + 0.5);
    big.chipHeights.forEach((h) => expect(h).toBeLessThanOrEqual(30.1));
    big.chipText.forEach((h) => expect(h).toBeLessThanOrEqual(16.5));
    await page.screenshot({ path: `${shotsDir()}/map-proportions-zoomed-1280x800.png` });
  });
});

test.describe('C. a two-way pair is two parallel lines', () => {
  test.use({ actionTimeout: 60_000 });

  test('one end selected: exactly two visible lines, one solid in the family colour, one dashed; at least 8 px between their stroke edges at Fit and after 3 zoom-ins; two chips; each line and each chip selects its own direction', async ({ page }) => {
    test.setTimeout(400_000);
    await openMapDesktop(page, PAIR_DATA());
    await clickNode(page, page.locator(`svg [data-node-id="${FAM8}"]`));
    await page.waitForTimeout(900);
    await chipsSettled(page);
    // the inspector opened with the selection and narrowed the map: with a pane shut the whole map is fitted at the zoom the 8 px are stated for
    const hide = page.getByRole('button', { name: 'Hide inspector' });
    if ((await hide.count()) > 0) await hide.click();
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.waitForTimeout(900);
    await chipsSettled(page);
    for (const stage of ['Fit', 'after 3 zoom-ins']) {
      if (stage !== 'Fit') await zoomIn(page, 3);
      await page.waitForTimeout(500);
      const lines = await linesBetween(page, FAM8, FAM13);
      expect(lines, `${stage}: exactly two lines`).toHaveLength(2);
      const makes = lines.find((l) => l.from === FAM8) as (typeof lines)[number];
      const madeFrom = lines.find((l) => l.from === FAM13) as (typeof lines)[number];
      expect(makes.dashed, 'makes is solid').toBe(false);
      expect(makes.tone, 'makes carries the family colour').not.toBeNull();
      expect(madeFrom.dashed, 'made from is dashed').toBe(true);
      const gap = Math.min(edgeGap(makes, madeFrom), edgeGap(madeFrom, makes));
      console.log(`${stage}: edge gap ${gap.toFixed(2)} px, strokes ${makes.stroke.toFixed(2)} / ${madeFrom.stroke.toFixed(2)}`);
      expect(gap, `${stage}: the gap along the whole length`).toBeGreaterThanOrEqual(8 - 0.4);
      const chips = await page.locator(`svg [data-count-of="${makes.id}"], svg [data-count-of="${madeFrom.id}"]`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => ({ l: b.left, t: b.top, r: b.right, b: b.bottom })));
      expect(chips, `${stage}: one chip per line`).toHaveLength(2);
      const [a, b] = chips as [(typeof chips)[number], (typeof chips)[number]];
      expect(Math.max(a.l - b.r, b.l - a.r, a.t - b.b, b.t - a.b), `${stage}: chips at least 8 px apart`).toBeGreaterThanOrEqual(8 - 0.5);
    }
    await page.screenshot({ path: `${shotsDir()}/map-proportions-pair-zoomed-1280x800.png` });
    // each line, each chip: its own direction is selected
    for (const line of await linesBetween(page, FAM8, FAM13)) {
      await page.getByRole('button', { name: 'Fit', exact: true }).click(); // the whole map in view: nothing under the toolbar
      await page.waitForTimeout(900);
      const fresh = (await linesBetween(page, FAM8, FAM13)).find((l) => l.id === line.id) as (typeof line);
      const at = fresh.points[Math.floor(fresh.points.length * 0.45)] as { x: number; y: number };
      await page.mouse.click(at.x, at.y);
      await expect(page.locator(`svg [data-overlay="selected"][data-overlay-id="${line.id}"]`), `a click on the line ${line.id}`).toHaveCount(1);
      await page.waitForTimeout(900);
    }
    for (const line of await linesBetween(page, FAM8, FAM13)) {
      await page.getByRole('button', { name: 'Fit', exact: true }).click();
      await page.waitForTimeout(900);
      await page.locator(`svg [data-count-of="${line.id}"]`).click();
      await expect(page.locator(`svg [data-overlay="selected"][data-overlay-id="${line.id}"]`), `a click on the chip of ${line.id}`).toHaveCount(1);
      await expect(cornerLabel(page)).toContainText('Selected:');
      await page.waitForTimeout(900);
    }
  });

  test('nothing selected, a chapter: both lines solid and dark; hover on an unselected family still shows its arrows', async ({ page }) => {
    test.setTimeout(400_000);
    await openMapDesktop(page, PAIR_DATA());
    await page.getByRole('combobox', { name: 'Chapter' }).selectOption('top_chapter-4');
    await page.waitForTimeout(1500);
    const lines = await linesBetween(page, FAM8, FAM13);
    expect(lines).toHaveLength(2);
    lines.forEach((l) => {
      expect(l.dashed).toBe(false);
      expect(l.tone).toBeNull();
    });
    await page.getByRole('combobox', { name: 'Chapter' }).selectOption('');
    await page.waitForTimeout(900);
    await expect(page.locator('svg [data-layer="edges"] [data-edge-id]')).toHaveCount(0);
    await page.locator(`svg [data-node-id="${FAM13}"]`).hover();
    await expect.poll(() => page.locator('svg [data-layer="edges"] [data-edge-id]').count()).toBeGreaterThan(0);
  });
});
