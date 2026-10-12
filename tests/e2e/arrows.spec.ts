/**
 * Clearer arrows on the arranged overview (step 5.5d, Part 1), Chromium against the PRODUCTION build with real fonts and the real layout
 * worker, the demo in 1280 x 800: arrows meet a box on the side that faces the other box, the end points on one side are at least
 * 12 px apart and clear of the rounded corners, an arrow and its reverse run apart, zero lines through a box, zero chip overlaps,
 * a hovered arrow is drawn by the overlay, the legend explains the marks; axe and zero CSP violations. The numbers go to
 * `screenshots/arrow-numbers.json`, the screenshot to `screenshots/overview-arrows-1280x800.png` (both git-ignored).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { axeProblems, expectClean, loadDemo, openApp, watch } from './kit';
import { linesThroughBoxes, measure, problemsOf, type Measured } from './readability';

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const drawing = (page: Page) => page.getByRole('group', { name: NAVIGATOR });
const SHOTS = resolve(process.cwd(), 'screenshots');

async function openDemo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(drawing(page)).toBeVisible();
  await page.getByRole('button', { name: 'Fit' }).click();
  await page.waitForTimeout(500);
}

interface End {
  readonly edge: string;
  readonly node: string;
  readonly side: 'left' | 'right' | 'top' | 'bottom';
  /** Distance along the side from its start, px. */
  readonly along: number;
  readonly length: number;
}

/** The two end points of every arrow between two different boxes, as a side and a position along it. */
function endsOf(m: Measured): { ends: End[]; offBorder: string[] } {
  const ends: End[] = [];
  const offBorder: string[] = [];
  const parts = new Map<string, Measured['segments']>();
  for (const s of m.segments) parts.set(s.id, [...(parts.get(s.id) ?? []), s]);
  for (const [id, list] of parts) {
    const first = list[0] as Measured['segments'][number];
    const last = list[list.length - 1] as Measured['segments'][number];
    if (first.from === first.to) continue;
    for (const [nodeId, x, y] of [[first.from, first.x1, first.y1], [first.to, last.x2, last.y2]] as const) {
      const box = m.nodes.find((n) => n.id === nodeId);
      if (box === undefined) continue;
      const near = { left: Math.abs(x - box.x), right: Math.abs(x - (box.x + box.width)), top: Math.abs(y - box.y), bottom: Math.abs(y - (box.y + box.height)) };
      const side = (Object.keys(near) as (keyof typeof near)[]).reduce((a, b) => (near[a] <= near[b] ? a : b));
      if (near[side] > 0.6) offBorder.push(`${id} at ${nodeId}`);
      const horizontal = side === 'left' || side === 'right';
      ends.push({ edge: id, node: nodeId, side, along: horizontal ? y - box.y : x - box.x, length: horizontal ? box.height : box.width });
    }
  }
  return { ends, offBorder };
}

/** The point half way along the length of an edge's drawn route. */
function middleOf(m: Measured, id: string): { x: number; y: number } {
  const list = m.segments.filter((s) => s.id === id);
  const total = list.reduce((sum, s) => sum + Math.hypot(s.x2 - s.x1, s.y2 - s.y1), 0);
  let left = total / 2;
  for (const s of list) {
    const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (length >= left && length > 0) return { x: s.x1 + ((s.x2 - s.x1) * left) / length, y: s.y1 + ((s.y2 - s.y1) * left) / length };
    left -= length;
  }
  const last = list[list.length - 1] as Measured['segments'][number];
  return { x: last.x2, y: last.y2 };
}

test.describe('the arrows of the arranged demo overview', () => {
  test('ends on the facing side, at least 12 px apart and clear of the corners; an arrow and its reverse run apart', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    const m = await measure(page);
    const { ends, offBorder } = endsOf(m);
    expect(offBorder, 'every end point lies on the border of its box').toEqual([]);
    expect(ends.length).toBeGreaterThan(10);
    const groups = new Map<string, End[]>();
    for (const e of ends) groups.set(`${e.node}/${e.side}`, [...(groups.get(`${e.node}/${e.side}`) ?? []), e]);
    let closest = Infinity;
    let nearestCorner = Infinity;
    for (const [key, list] of groups) {
      const sorted = [...list].sort((a, b) => a.along - b.along);
      for (let i = 1; i < sorted.length; i += 1) {
        const gap = (sorted[i] as End).along - (sorted[i - 1] as End).along;
        closest = Math.min(closest, gap);
        expect(gap, `${key}: ${(sorted[i - 1] as End).edge} and ${(sorted[i] as End).edge}`).toBeGreaterThanOrEqual(12 - 0.1);
      }
      for (const e of sorted) nearestCorner = Math.min(nearestCorner, e.along, e.length - e.along);
    }
    expect(nearestCorner, 'clear of the rounded corners (radius 8)').toBeGreaterThanOrEqual(10 - 0.1);
    // an arrow and its reverse: the middle of their lines are at least 10 px apart
    const reverse: Record<string, number> = {};
    const edges = new Map(m.segments.map((s) => [s.id, s]));
    for (const a of edges.values()) {
      if (a.from === a.to) continue;
      const b = [...edges.values()].find((s) => s.from === a.to && s.to === a.from && s.id > a.id);
      if (b === undefined) continue;
      const pa = middleOf(m, a.id);
      const pb = middleOf(m, b.id);
      reverse[`${a.id} / ${b.id}`] = Math.round(Math.hypot(pa.x - pb.x, pa.y - pb.y) * 10) / 10;
    }
    expect(Object.keys(reverse).length).toBeGreaterThan(0);
    for (const [pair, apart] of Object.entries(reverse)) expect(apart, pair).toBeGreaterThanOrEqual(10);
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(resolve(SHOTS, 'arrow-numbers.json'), JSON.stringify({ endPoints: ends.length, sides: groups.size, closestEndsOnOneSide: Math.round(closest * 10) / 10, nearestToACorner: Math.round(nearestCorner * 10) / 10, reversePairs: reverse }, null, 1));
    await expectClean(seen);
  });

  test('zero lines through a box and zero chip overlaps at the fitted view; the chips are drawn at LOD 1 or more', async ({ page }) => {
    await openDemo(page);
    const m = await measure(page);
    const problems = problemsOf(m);
    expect(linesThroughBoxes(m)).toEqual([]);
    expect(problems.labelOverLabel).toEqual([]);
    expect(problems.labelOverNode).toEqual([]);
    expect(problems.outside).toEqual([]);
    expect(problems.labels, 'the chips were measured').toBeGreaterThanOrEqual(5);
    const sizes = await page.evaluate(() => [...document.querySelectorAll('[data-count-of]')].map((g) => ({ name: g.getAttribute('aria-label'), text: getComputedStyle(g.querySelector('text') as Element).fontSize, height: g.getAttribute('data-chip-height') })));
    for (const chip of sizes) {
      expect(chip.name).toMatch(/^\d+ reactions?$/);
      expect(chip.text).toBe('12px');
      expect(chip.height).toBe('20');
    }
  });

  test('a hovered arrow is drawn by the overlay in the accent with its two families outlined; moving away clears it', async ({ page }) => {
    await openDemo(page);
    const edge = page.locator('[data-layer="edges"] [data-edge-id][data-from="cls_haloalkanes"][data-to="cls_alkenes"]');
    await expect(edge).toHaveCount(1);
    const at = await edge.locator('path:not([data-hit])').evaluate((path) => {
      const p = path as SVGPathElement;
      const point = p.getPointAtLength(p.getTotalLength() * 0.3);
      const m = p.getScreenCTM() as DOMMatrix;
      return { x: point.x * m.a + point.y * m.c + m.e, y: point.x * m.b + point.y * m.d + m.f };
    });
    const commits = async (): Promise<number> => Number(await page.locator('[data-layer-commits]').getAttribute('data-layer-commits'));
    const before = await commits();
    await page.mouse.move(at.x, at.y);
    await expect(page.locator('[data-overlay="hover"]')).toHaveCount(1);
    await expect(page.locator('[data-overlay="end"]')).toHaveCount(2);
    const hover = page.locator('[data-overlay="hover"]');
    expect(Number(await hover.evaluate((el) => getComputedStyle(el).strokeWidth.replace('px', '')))).toBeGreaterThan(3);
    // only the overlay layer committed: one commit
    expect((await commits()) - before).toBe(1);
    await page.mouse.move(2, 2);
    await expect(page.locator('[data-overlay="hover"]')).toHaveCount(0);
    await expect(page.locator('[data-overlay="end"]')).toHaveCount(0);
  });

  test('ADV-005: reactions from a family into itself are a loop with an arrowhead, named "N reactions that stay within <family>", with its count chip; the legend explains it', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    const loops = await page.locator('svg g[data-edge-id]').evaluateAll((groups) =>
      groups
        .filter((g) => g.getAttribute('data-from') === g.getAttribute('data-to'))
        .map((g) => ({
          id: g.getAttribute('data-edge-id') ?? '',
          label: g.getAttribute('aria-label') ?? '',
          arrowhead: g.querySelector('path')?.getAttribute('marker-end') ?? '',
          chip: document.querySelector(`[data-count-of="${g.getAttribute('data-edge-id')}"]`)?.getAttribute('aria-label') ?? '',
        })),
    );
    expect(loops.length, 'the demo overview has at least one family with reactions into itself').toBeGreaterThan(0);
    for (const loop of loops) {
      expect(loop.label).toMatch(/^\d+ reactions? that stays? within \S/);
      expect(loop.arrowhead, `an arrowhead on the loop ${loop.id}`).toMatch(/^url\(#/);
      // the count chip beside the loop carries the number (its own name is "N reactions"; the loop's name says where they stay)
      expect(loop.chip, `a count chip on the loop ${loop.id}`).toMatch(/^\d+ reactions?$/);
    }
    // the legend explains the loop, in words
    const marks = page.getByRole('list', { name: 'What the marks mean' });
    await expect(marks).toContainText('reactions within the same family');
    await expectClean(seen);
  });

  test('the legend explains the chip, the loop and Unclassified in words; axe; zero CSP violations; screenshot', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    const marks = page.getByRole('list', { name: 'What the marks mean' });
    await expect(marks.getByRole('listitem')).toHaveCount(3);
    await expect(marks).toContainText('number of reactions on this arrow');
    await expect(marks).toContainText('reactions within the same family');
    await expect(marks).toContainText('compounds not in any family yet');
    expect(await axeProblems(page)).toEqual([]);
    mkdirSync(SHOTS, { recursive: true });
    const path = resolve(SHOTS, 'overview-arrows-1280x800.png');
    await page.screenshot({ path });
    test.info().annotations.push({ type: 'screenshot', description: path });
    await expectClean(seen);
  });
});
