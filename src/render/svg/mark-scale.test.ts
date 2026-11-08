/**
 * Marks grow with the map, within limits (step 8.4c, B). Size on the screen = map size x zoom, clamped. The stylesheet writes the same clamps
 * as CSS (it cannot import this module), so a test reads the stylesheet and checks that every expression here is in it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAIR_SEPARATION_CAP, chipFactor, cssClamp, headFactor, hitPx, MARK_LIMITS, pairGapPx, pairSeparationMap, strokePx } from './mark-scale';

const css = readFileSync(resolve(__dirname, 'scene-svg.module.css'), 'utf8');

describe('mark sizes on the screen', () => {
  it('a stroke is 2 to 4 px (heavy 3 to 5) and grows with the zoom between', () => {
    expect(strokePx('normal', 0.3)).toBe(2);
    expect(strokePx('normal', 1)).toBe(2);
    expect(strokePx('normal', 1.37)).toBeCloseTo(2.74, 6);
    expect(strokePx('normal', 5)).toBe(4);
    expect(strokePx('heavy', 0.3)).toBe(3);
    expect(strokePx('heavy', 1.5)).toBeCloseTo(4.5, 6);
    expect(strokePx('heavy', 9)).toBe(5);
  });
  it('an arrowhead is 10 to 16 px long', () => {
    expect(10 * headFactor(0.2)).toBe(10);
    expect(10 * headFactor(1.2)).toBeCloseTo(12, 6);
    expect(10 * headFactor(9)).toBeCloseTo(16, 6);
  });
  it('a count chip is 20 to 30 px across, its text 12 to 16 px', () => {
    expect(20 * chipFactor(0.2)).toBe(20);
    expect(12 * chipFactor(0.2)).toBe(12);
    expect(20 * chipFactor(9)).toBeGreaterThanOrEqual(20);
    expect(20 * chipFactor(9)).toBeLessThanOrEqual(30);
    expect(12 * chipFactor(9)).toBeLessThanOrEqual(16);
    expect(chipFactor(1.2)).toBeCloseTo(1.2, 6);
  });
  it('the hit area is at least 16 px (28 on touch) and grows with the stroke', () => {
    expect(hitPx(0.3, false)).toBe(16);
    expect(hitPx(0.3, true)).toBe(28);
    expect(hitPx(9, false)).toBeGreaterThan(hitPx(0.3, false));
    expect(hitPx(9, true)).toBeGreaterThan(hitPx(0.3, true));
  });
  it('the gap between the two lines of a pair is 8 to 16 px between the stroke edges; the centres are that gap plus one stroke apart, in map units', () => {
    expect(pairGapPx(0.3)).toBe(8.5); // 8 px asked for, half a pixel of slack
    expect(pairGapPx(9)).toBe(16);
    expect(pairGapPx(1)).toBeGreaterThan(8);
    expect(pairSeparationMap(0.7)).toBeCloseTo((8.5 + 2) / 0.7, 6);
    expect(pairSeparationMap(1.2) * 1.2).toBeCloseTo(pairGapPx(1.2) + strokePx('normal', 1.2), 6);
  });
  it('the pair separation never exceeds the layout port gap (the room on a box side)', async () => {
    const { PORT_GAP } = await import('@/layout/grid');
    expect(PAIR_SEPARATION_CAP).toBe(PORT_GAP);
    expect(pairSeparationMap(0.2)).toBe(PORT_GAP);
  });
  it('the centres of two heavier lines are further apart: the gap is between the EDGES, whatever the strokes', () => {
    expect(pairSeparationMap(0.8, 3) * 0.8).toBeCloseTo(pairGapPx(0.8) + 3, 6);
    expect(pairSeparationMap(1.2, 4.5) * 1.2).toBeCloseTo(pairGapPx(1.2) + 4.5, 6);
  });
  it('every clamp is in the stylesheet, written the same way', () => {
    const { stroke, heavy, head, chip } = MARK_LIMITS;
    for (const wanted of [cssClamp(stroke), cssClamp(heavy), cssClamp(head), cssClamp(chip)]) expect(css, wanted).toContain(wanted);
  });
});
