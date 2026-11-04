import { describe, expect, it } from 'vitest';
import { boxesRect } from './map-geometry';

describe('boxesRect: the rectangle of the visible boxes (step 8.2b, B1)', () => {
  it('is the smallest rectangle that holds every box', () => {
    expect(boxesRect([{ x: 10, y: 20, width: 100, height: 40 }, { x: 300, y: 5, width: 80, height: 30 }])).toEqual({ x0: 10, y0: 5, x1: 380, y1: 60 });
  });
  it('is undefined with no box (the whole drawing is fitted instead)', () => {
    expect(boxesRect([])).toBeUndefined();
  });
});
