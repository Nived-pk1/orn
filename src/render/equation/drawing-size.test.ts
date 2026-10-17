import { describe, expect, it } from 'vitest';
import { FIXED_SCALE_BOND_UNITS } from '@/chem/contracts';
import { drawingSizeOf } from './drawing-size';

describe('drawingSizeOf', () => {
  it('a drawing of one bond (the nominal bond wide) is shown one bond long: the same bond for every drawing', () => {
    const a = drawingSizeOf({ width: FIXED_SCALE_BOND_UNITS, height: 40 }, 32, 220, 112);
    const b = drawingSizeOf({ width: FIXED_SCALE_BOND_UNITS * 3, height: 80 }, 32, 220, 112);
    expect(a.width).toBe(32);
    expect(a.bondPx).toBe(32);
    expect(b.width).toBe(96);
    expect(b.bondPx).toBe(32);
  });

  it('wider than the cap: scaled down whole (the ratio is kept), and the bond shrinks with the drawing', () => {
    const wide = drawingSizeOf({ width: FIXED_SCALE_BOND_UNITS * 20, height: FIXED_SCALE_BOND_UNITS * 2 }, 32, 220, 112);
    expect(wide.width).toBe(220);
    expect(wide.height).toBe(22);
    expect(wide.bondPx).toBeCloseTo(11, 1);
  });

  it('taller than the cap: scaled down whole as well', () => {
    const tall = drawingSizeOf({ width: FIXED_SCALE_BOND_UNITS * 2, height: FIXED_SCALE_BOND_UNITS * 8 }, 32, 220, 112);
    expect(tall.height).toBe(112);
    expect(tall.width).toBe(28);
  });

  it('is never zero-sized', () => {
    const tiny = drawingSizeOf({ width: 0.1, height: 0.1 }, 32, 220, 112);
    expect(tiny.width).toBeGreaterThanOrEqual(1);
    expect(tiny.height).toBeGreaterThanOrEqual(1);
  });
});
