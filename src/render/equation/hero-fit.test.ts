import { describe, expect, it } from 'vitest';
import { fitHero, MIN_DRAWING_PX, PEEK_MAX_HEIGHT } from './hero-fit';

describe('fitHero (step 8.1 review decision 0): the hero equation never wraps', () => {
  it('one row at full size when it fits', () => {
    expect(fitHero({ available: 400, width: 380, height: 140, drawingHeight: 100 })).toEqual({ mode: 'row', scale: 1 });
  });

  it('one row scaled down to the width when the drawings stay at least 80 px tall', () => {
    const fit = fitHero({ available: 300, width: 400, height: 140, drawingHeight: 120 });
    expect(fit).toEqual({ mode: 'row', scale: 0.75 });
    expect(120 * 0.75).toBeGreaterThanOrEqual(MIN_DRAWING_PX);
  });

  it('the vertical layout when scaling would make a drawing shorter than 80 px', () => {
    expect(fitHero({ available: 240, width: 400, height: 140, drawingHeight: 100 })).toEqual({ mode: 'stacked' });
  });

  it('formulas only (no drawing): scaled down to 0.6, else vertical', () => {
    expect(fitHero({ available: 250, width: 400, height: 40, drawingHeight: 0 })).toEqual({ mode: 'row', scale: 0.625 });
    expect(fitHero({ available: 200, width: 400, height: 40, drawingHeight: 0 })).toEqual({ mode: 'stacked' });
  });

  it('nothing measured yet: a row at full size (the first paint is measured again)', () => {
    expect(fitHero({ available: 0, width: 0, height: 0, drawingHeight: 0 })).toEqual({ mode: 'row', scale: 1 });
  });
});

describe('fitHero in the peek: one row at most PEEK_MAX_HEIGHT high, else the one-line text', () => {
  it('a small equation is one row, scaled to the height and the width', () => {
    expect(fitHero({ available: 340, width: 300, height: 160, drawingHeight: 110 }, { peek: true, reactants: 1, products: 1 })).toEqual({ mode: 'row', scale: PEEK_MAX_HEIGHT / 160 });
  });

  it('more than two reactants or two products: the text', () => {
    expect(fitHero({ available: 340, width: 300, height: 100, drawingHeight: 80 }, { peek: true, reactants: 3, products: 1 })).toEqual({ mode: 'text' });
    expect(fitHero({ available: 340, width: 300, height: 100, drawingHeight: 80 }, { peek: true, reactants: 1, products: 3 })).toEqual({ mode: 'text' });
  });

  it('too small to read after scaling (drawings under 40 px): the text', () => {
    expect(fitHero({ available: 340, width: 1200, height: 160, drawingHeight: 120 }, { peek: true, reactants: 2, products: 2 })).toEqual({ mode: 'text' });
  });
});
