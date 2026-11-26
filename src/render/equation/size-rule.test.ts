import { describe, expect, it } from 'vitest';
import { FIXED_SCALE_BOND_UNITS, LABEL_GLYPH_PX } from '@/chem/contracts';
import { FLOOR, formulaBreaks, MIN_LABEL_PX, nameBreaks, naturalRowWidth, rowScale, SIZE_RULES, sizeDrawing } from './size-rule';

const UNITS = FIXED_SCALE_BOND_UNITS;
/** A drawing `bonds` bonds wide and `rows` bonds tall, as RDKit gives it at the fixed scale. */
const natural = (bonds: number, rows = 2): { width: number; height: number } => ({ width: bonds * UNITS, height: rows * UNITS });
const family = SIZE_RULES.family;

describe('sizeDrawing: ONE size rule (step 8.5d), branches a to d', () => {
  it('fits: the standard bond length, the box follows the drawing', () => {
    const fit = sizeDrawing(natural(3), 'family', { available: 400 });
    expect(fit.mode).toBe('standard');
    expect(fit.scale).toBe(1);
    expect(fit.bondPx).toBe(family.standard);
    expect(fit.width).toBe(Math.round(3 * family.standard));
    expect(fit.boxWidth).toBe(fit.width);
  });

  it('(a) too wide for its own space but fits with the free space of its row: the box grows, the scale stays', () => {
    const fit = sizeDrawing(natural(6), 'family', { available: 120, free: 100 });
    expect(fit.mode).toBe('grown');
    expect(fit.scale).toBe(1);
    expect(fit.boxWidth).toBeGreaterThan(120);
  });

  it('(b) does not fit even with the free space: shrinks, never below the floor', () => {
    const wide = 8 * family.standard;
    const fit = sizeDrawing(natural(8), 'family', { available: wide * 0.9 });
    expect(fit.mode).toBe('shrunk');
    expect(fit.scale).toBeCloseTo(0.9, 2);
    expect(fit.bondPx).toBeCloseTo(family.standard * 0.9, 1);
    expect(fit.boxWidth).toBeLessThanOrEqual(wide * 0.9 + 1);
  });

  it('the floor keeps labels at 11 px or more: labels are 13 px at the standard (step 8.5e), so the floor is 11 / 13 = 85 %', () => {
    expect(MIN_LABEL_PX).toBe(11);
    expect(FLOOR).toBe(0.85);
    expect(LABEL_GLYPH_PX * FLOOR).toBeGreaterThanOrEqual(MIN_LABEL_PX);
    const fit = sizeDrawing(natural(8), 'family', { available: 8 * family.standard * FLOOR });
    expect(fit.mode).toBe('shrunk');
    expect(fit.scale).toBeCloseTo(FLOOR, 3);
  });

  it('the standards: family 28, equation 34, hero 40 (8.5e), mechanism 44 (8.5g) px per bond', () => {
    expect(Object.fromEntries(Object.entries(SIZE_RULES).map(([k, v]) => [k, v.standard]))).toEqual({ family: 28, equation: 34, hero: 40, mechanism: 44 });
  });

  it('(d) still wider at the floor: the floor scale inside its own box, which scrolls; never shrunk below the floor, never clipped', () => {
    const fit = sizeDrawing(natural(20), 'family', { available: 300 });
    expect(fit.mode).toBe('scroll');
    expect(fit.scale).toBe(FLOOR);
    expect(fit.bondPx).toBeCloseTo(family.standard * FLOOR, 1);
    expect(fit.boxWidth).toBe(300);
    expect(fit.width).toBeGreaterThan(300);
  });

  it('a tiny molecule gets the minimum box, centred; its drawing keeps the standard', () => {
    const fit = sizeDrawing({ width: 28, height: 17 }, 'family', { available: 400 });
    expect(fit.boxWidth).toBe(family.minWidth);
    expect(fit.boxHeight).toBe(family.minHeight);
    expect(fit.width).toBeLessThan(family.minWidth);
    expect(fit.bondPx).toBe(family.standard);
  });

  it('labels are set apart from the bond length, so every context shows 13 px labels at its standard and at least 11 px at the floor', () => {
    expect(Object.keys(SIZE_RULES)).toHaveLength(4);
    expect(LABEL_GLYPH_PX * FLOOR).toBeGreaterThanOrEqual(MIN_LABEL_PX);
  });

  it('is never zero-sized and is deterministic', () => {
    const a = sizeDrawing({ width: 0.1, height: 0.1 }, 'equation', { available: 100 });
    expect(a.width).toBeGreaterThanOrEqual(1);
    expect(sizeDrawing(natural(5), 'hero', { available: 90 })).toEqual(sizeDrawing(natural(5), 'hero', { available: 90 }));
  });
});

describe('rowScale: a row of drawings shrinks to the floor, then wraps (R2 b, c)', () => {
  it('fits: scale 1, no wrap', () => expect(rowScale(300, 400)).toEqual({ scale: 1, wrap: false }));
  it('too wide but within the floor: shrinks, no wrap', () => expect(rowScale(450, 400)).toEqual({ scale: 0.889, wrap: false }));
  it('beyond the floor: the floor scale and wrap', () => expect(rowScale(800, 400)).toEqual({ scale: FLOOR, wrap: true }));
  it('nothing measured: scale 1', () => expect(rowScale(0, 0)).toEqual({ scale: 1, wrap: false }));
});

describe('naturalRowWidth: the whole row at scale 1 from what is on the screen now (8.5e E2 a)', () => {
  it('at scale 1 it is the sum of the parts and the gaps', () => {
    expect(naturalRowWidth({ parts: [100, 40, 100], drawings: 200, gap: 10 }, 1)).toBe(100 + 40 + 100 + 20);
  });
  it('at a smaller scale the drawings are grown back to scale 1, the rest stays', () => {
    expect(naturalRowWidth({ parts: [90, 40, 90], drawings: 180, gap: 10 }, 0.9)).toBeCloseTo(90 + 40 + 90 + 20 + 20, 5);
  });
  it('the whole row shrinks together to the floor before it wraps', () => {
    const total = naturalRowWidth({ parts: [300, 60, 300], drawings: 600, gap: 10 }, 1);
    expect(rowScale(total, 612)).toEqual({ scale: 0.9, wrap: false });
    expect(rowScale(total, 500).wrap).toBe(true);
  });
});

describe('formulaBreaks and nameBreaks: where text may wrap (R3)', () => {
  it('a condensed formula breaks after a bond dash, never inside a group', () => {
    expect(formulaBreaks('CH3COO-CH2-CH2-R')).toEqual(['CH3COO-', 'CH2-', 'CH2-', 'R']);
  });
  it('a charge or a trailing dash is not a break', () => {
    expect(formulaBreaks('Na+')).toEqual(['Na+']);
    expect(formulaBreaks('HO-')).toEqual(['HO-']);
    expect(formulaBreaks('')).toEqual([]);
  });
  it('a name breaks after a comma (spaces and dashes already break); the characters are unchanged', () => {
    const parts = nameBreaks('2,3-dimethyl-butane, a long one');
    expect(parts.join('')).toBe('2,3-dimethyl-butane, a long one');
    expect(parts[0]).toBe('2,');
  });
});

describe('the Full (all atoms) standard (8.5g B)', () => {
  it('is 1.4 times the context standard, with the same floor', () => {
    const wide = { width: 108, height: 54 };
    expect(sizeDrawing(wide, 'family', { available: 400, allAtoms: true }).bondPx).toBeCloseTo(SIZE_RULES.family.standard * 1.4, 2);
    expect(sizeDrawing(wide, 'family', { available: 400, allAtoms: false }).bondPx).toBe(SIZE_RULES.family.standard);
    expect(sizeDrawing({ width: 5400, height: 54 }, 'equation', { available: 100, allAtoms: true }).bondPx).toBeCloseTo(SIZE_RULES.equation.standard * 1.4 * FLOOR, 2);
  });
});
