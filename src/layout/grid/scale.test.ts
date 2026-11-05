/** The box scale (step 8.2b-fix, C1): the largest factor in 1..1.8 that keeps every box 16 px from every other and off every chip of the unscaled drawing. */
import { describe, expect, it } from 'vitest';
import type { Rect } from './geometry';
import { BOX_SCALE_MAX, BOX_SCALE_MIN_GAP, boxScaleFor, scaleAbout } from './scale';

const box = (x: number, y: number, w = 100, h = 40): Rect => ({ x, y, width: w, height: h });
const gapBetween = (a: Rect, b: Rect): number => {
  const sx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
  const sy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
  return sx > 0 && sy > 0 ? Math.hypot(sx, sy) : Math.max(sx, sy);
};

describe('boxScaleFor', () => {
  it('spread boxes grow to the cap and no further', () => {
    expect(boxScaleFor([box(0, 0), box(1000, 0)], [])).toBe(BOX_SCALE_MAX);
    expect(BOX_SCALE_MAX).toBe(1.8);
  });
  it('a single box, or none: the cap (nothing to collide with)', () => {
    expect(boxScaleFor([box(0, 0)], [])).toBe(BOX_SCALE_MAX);
    expect(boxScaleFor([], [])).toBe(BOX_SCALE_MAX);
  });
  it('no two boxes come closer than 16 px at the chosen scale (the binding pair decides)', () => {
    const boxes = [box(0, 0), box(160, 0), box(0, 100), box(160, 100)];
    const s = boxScaleFor(boxes, []);
    expect(s).toBeGreaterThan(1);
    expect(s).toBeLessThan(BOX_SCALE_MAX);
    const grown = boxes.map((b) => scaleAbout(b, s));
    for (let i = 0; i < grown.length; i += 1) for (let j = i + 1; j < grown.length; j += 1) expect(gapBetween(grown[i] as Rect, grown[j] as Rect)).toBeGreaterThanOrEqual(BOX_SCALE_MIN_GAP - 1e-6);
    // and it is the largest: a little more would break the 16 px rule for some pair
    const more = boxes.map((b) => scaleAbout(b, s + 0.01));
    expect(Math.min(...more.flatMap((a, i) => more.slice(i + 1).map((b) => gapBetween(a, b))))).toBeLessThan(BOX_SCALE_MIN_GAP);
  });
  it('a crowded layout (boxes already 16 px or closer) gives 1.0', () => {
    expect(boxScaleFor([box(0, 0), box(110, 0)], [])).toBe(1);
    expect(boxScaleFor([box(0, 0), box(100, 0)], [])).toBe(1);
  });
  it('a box never grows over a chip that the unscaled drawing has', () => {
    const boxes = [box(0, 0), box(1000, 0)];
    const chip = box(120, 10, 20, 20); // 20 px from the first box's right edge
    const s = boxScaleFor(boxes, [chip]);
    const grown = scaleAbout(boxes[0] as Rect, s);
    expect(grown.x + grown.width).toBeLessThanOrEqual(chip.x + 1e-6);
    expect(s).toBeLessThan(BOX_SCALE_MAX);
    expect(s).toBeGreaterThan(1);
  });
  it('a chip already touching a box keeps the scale at 1', () => {
    expect(boxScaleFor([box(0, 0), box(1000, 0)], [box(90, 10, 20, 20)])).toBe(1);
  });
  it('scaleAbout keeps the centre', () => {
    const r = scaleAbout(box(10, 20, 100, 40), 1.5);
    expect(r).toEqual({ x: -15, y: 10, width: 150, height: 60 });
  });
  it('more boxes than the bound: the scale stays 1 (bounded work)', () => {
    const many = Array.from({ length: 700 }, (_, i) => box(i * 500, 0));
    expect(boxScaleFor(many, [])).toBe(1);
  });
});
