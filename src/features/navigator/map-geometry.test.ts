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

describe('snapEnds (step 8.4c, C)', () => {
  const box = (x: number, y: number) => ({ x, y, width: 100, height: 40 });
  it('a line moved sideways has its ends put back on the borders of its boxes, along its own direction', async () => {
    const { snapEnds } = await import('./map-geometry');
    // boxes at x 0..100 and 300..400, y 0..40; the line y = 24 slid from y = 20 and was cut short / left long
    const out = snapEnds([{ x: 96, y: 24 }, { x: 310, y: 24 }], box(0, 0), box(300, 0));
    expect(out[0]).toEqual({ x: 100, y: 24 });
    expect(out[1]).toEqual({ x: 300, y: 24 });
  });
  it('an end that is already on the border stays; inner points stay; an end that meets no border keeps its place', async () => {
    const { snapEnds } = await import('./map-geometry');
    const bowed = [{ x: 100, y: 20 }, { x: 200, y: 90 }, { x: 300, y: 20 }];
    const out = snapEnds(bowed, box(0, 0), box(300, 0));
    expect(out[0]).toEqual({ x: 100, y: 20 });
    expect(out[1]).toEqual({ x: 200, y: 90 });
    const away = snapEnds([{ x: 500, y: 500 }, { x: 600, y: 500 }], box(0, 0), box(300, 0));
    expect(away[0]).toEqual({ x: 500, y: 500 });
  });
});
