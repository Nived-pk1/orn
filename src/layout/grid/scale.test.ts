/**
 * The box scale (step 8.4c, A1; before: 8.2b-fix C1 and 8.3b A5): the largest factor (at least 1) at which the gap between neighbouring columns is at
 * least 1.4 box widths and the gap between neighbouring rows at least 2.0 box heights (the old map had 1.7 and 2.5). The upper limit 1.8 is gone;
 * a technical ceiling only ends the search.
 */
import { describe, expect, it } from 'vitest';
import type { Rect } from './geometry';
import { BOX_SCALE_CEILING, BOX_SCALE_MIN_GAP, COLUMN_GAP_RATIO, ROW_GAP_RATIO, boxScaleFor, scaleAbout } from './scale';

const box = (x: number, y: number, w = 100, h = 40): Rect => ({ x, y, width: w, height: h });
const sideGap = (a: Rect, b: Rect): { readonly x: number; readonly y: number } => ({
  x: Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)),
  y: Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)),
});

describe('boxScaleFor', () => {
  it('states the two ratios and no upper limit of 1.8', () => {
    expect(COLUMN_GAP_RATIO).toBe(1.4);
    expect(ROW_GAP_RATIO).toBe(2);
    expect(BOX_SCALE_CEILING).toBeGreaterThan(1.8);
  });
  it('neighbouring columns: the gap is exactly 1.4 widths at the chosen scale (pitch 250, width 100 gives 250 / 240)', () => {
    const s = boxScaleFor([box(0, 0), box(250, 0)], []);
    expect(s).toBeCloseTo(250 / 240, 5);
    const [a, b] = [scaleAbout(box(0, 0), s), scaleAbout(box(250, 0), s)] as [Rect, Rect];
    expect(sideGap(a, b).x / a.width).toBeGreaterThanOrEqual(COLUMN_GAP_RATIO - 1e-6);
  });
  it('neighbouring rows: the gap is exactly 2 heights at the chosen scale (pitch 200, height 40 gives 200 / 120)', () => {
    const s = boxScaleFor([box(0, 0), box(0, 200)], []);
    expect(s).toBeCloseTo(200 / 120, 5);
  });
  it('the narrower rule binds: both neighbours present', () => {
    const boxes = [box(0, 0), box(250, 0), box(0, 200)];
    expect(boxScaleFor(boxes, [])).toBeCloseTo(250 / 240, 5);
  });
  it('boxes with nothing beside them grow to the ceiling and no further; none at all: the ceiling', () => {
    expect(boxScaleFor([box(0, 0), box(1000, 500)], [])).toBe(BOX_SCALE_CEILING);
    expect(boxScaleFor([], [])).toBe(BOX_SCALE_CEILING);
  });
  it('a layout that is already tighter than the ratios keeps the boxes at 1 (never below)', () => {
    expect(boxScaleFor([box(0, 0), box(200, 0)], [])).toBe(1);
    expect(boxScaleFor([box(0, 0), box(110, 0)], [])).toBe(1);
  });
  it('the largest: a little more breaks a rule', () => {
    const boxes = [box(0, 0), box(260, 0), box(0, 150)];
    const s = boxScaleFor(boxes, []);
    const broken = (f: number): boolean => {
      const g = boxes.map((b) => scaleAbout(b, f));
      return g.some((a, i) => g.slice(i + 1).some((b) => (sideGap(a, b).y < 0 ? sideGap(a, b).x < COLUMN_GAP_RATIO * Math.max(a.width, b.width) : sideGap(a, b).x < 0 ? sideGap(a, b).y < ROW_GAP_RATIO * Math.max(a.height, b.height) : false)));
    };
    expect(broken(s)).toBe(false);
    expect(broken(s + 0.01)).toBe(true);
  });
  it('no two boxes ever come closer than 16 px (diagonal neighbours too)', () => {
    const boxes = [box(0, 0), box(112, 60)];
    const s = boxScaleFor(boxes, []);
    const [a, b] = boxes.map((r) => scaleAbout(r, s)) as [Rect, Rect];
    const g = sideGap(a, b);
    expect(g.x > 0 && g.y > 0 ? Math.hypot(g.x, g.y) : Math.max(g.x, g.y)).toBeGreaterThanOrEqual(Math.min(BOX_SCALE_MIN_GAP, 100) - 1e-6);
  });
  it('a box never grows over a chip that the unscaled drawing has', () => {
    const boxes = [box(0, 0), box(1000, 0)];
    const chip = box(120, 10, 20, 20);
    const s = boxScaleFor(boxes, [chip]);
    const grown = scaleAbout(boxes[0] as Rect, s);
    expect(grown.x + grown.width).toBeLessThanOrEqual(chip.x + 1e-6);
  });
  it('scaleAbout keeps the centre', () => {
    expect(scaleAbout(box(10, 20, 100, 40), 1.5)).toEqual({ x: -15, y: 10, width: 150, height: 60 });
  });
  it('more boxes than the bound: the scale stays 1 (bounded work)', () => {
    expect(boxScaleFor(Array.from({ length: 700 }, (_, i) => box(i * 500, 0)), [])).toBe(1);
  });
});
