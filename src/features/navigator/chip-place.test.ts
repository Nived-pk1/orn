import { describe, expect, it } from 'vitest';
import { CHIP_GAP_PX, placeChipsAtZoom, type ChipRequest } from './chip-place';

const line = (x0: number, x1: number, y = 0) => [{ x: x0, y }, { x: x1, y }];
const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const req = (key: string, route: readonly { x: number; y: number }[], width = 20, start = 0.5): ChipRequest => ({ key, route, width, start });

/** The chip's rectangle in map units at a zoom: its screen size divided by the zoom. */
const rectOf = (at: { x: number; y: number }, width: number, zoom: number) => ({ x0: at.x - width / 2 / zoom, x1: at.x + width / 2 / zoom, y0: at.y - 10 / zoom, y1: at.y + 10 / zoom });
const hit = (a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe('chips placed in screen pixels', () => {
  it('puts a chip in the middle of a free line', () => {
    const placed = placeChipsAtZoom([req('a', line(0, 400))], [], 1);
    expect(placed.get('a')).toEqual({ x: 200, y: 0 });
  });

  it('measures a chip as its screen size over the zoom: a box that clears it at zoom 1 touches it at zoom 0.25', () => {
    const near = box(220, -40, 40, 80); // 20 units right of the middle
    expect(placeChipsAtZoom([req('a', line(0, 400))], [near], 1).get('a')).toEqual({ x: 200, y: 0 });
    const far = placeChipsAtZoom([req('a', line(0, 400))], [near], 0.25).get('a');
    if (far !== undefined) expect(hit(rectOf(far, 20, 0.25), { x0: 220, x1: 260, y0: -40, y1: 40 })).toBe(false);
  });

  it('slides along the line to the first free place', () => {
    const blocked = box(185, -20, 30, 40);
    const at = placeChipsAtZoom([req('a', line(0, 400))], [blocked], 1).get('a');
    expect(at).toBeDefined();
    expect(at?.x).not.toBe(200);
    expect(hit(rectOf(at as { x: number; y: number }, 20, 1), { x0: 185, x1: 215, y0: -20, y1: 20 })).toBe(false);
  });

  it('draws no chip when every place touches a box (never an overlap)', () => {
    const wall = box(0, -30, 400, 60);
    expect(placeChipsAtZoom([req('a', line(0, 400))], [wall], 1).has('a')).toBe(false);
  });

  it('keeps two chips of the same line at least CHIP_GAP_PX screen pixels apart, each near its own end', () => {
    const route = line(0, 400);
    const placed = placeChipsAtZoom([req('a', route, 20, 0.78), req('b', route, 20, 0.22)], [], 0.5);
    const a = placed.get('a') as { x: number; y: number };
    const b = placed.get('b') as { x: number; y: number };
    expect(a.x).toBeGreaterThan(b.x);
    expect(((a.x - b.x) * 0.5) - 20).toBeGreaterThanOrEqual(CHIP_GAP_PX);
  });

  it('never lets two chips overlap: the second one slides or is not drawn', () => {
    const route = line(0, 400);
    const placed = placeChipsAtZoom([req('a', route), req('b', route)], [], 1);
    const a = placed.get('a') as { x: number; y: number };
    const b = placed.get('b');
    if (b !== undefined) expect(hit(rectOf(a, 20, 1), rectOf(b, 20, 1))).toBe(false);
  });

  it('is deterministic: the same request gives the same places', () => {
    const route = line(0, 300, 5);
    const first = placeChipsAtZoom([req('a', route), req('b', route, 40)], [box(100, -30, 20, 60)], 0.8);
    const second = placeChipsAtZoom([req('a', route), req('b', route, 40)], [box(100, -30, 20, 60)], 0.8);
    expect([...first]).toEqual([...second]);
  });
});
