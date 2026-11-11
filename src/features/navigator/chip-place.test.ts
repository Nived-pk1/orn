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

describe('chips grow with the map (step 8.4c, B)', () => {
  const route = [{ x: 0, y: -60 }, { x: 0, y: 60 }];
  const between = (screenGap: number, zoom: number) => {
    const half = screenGap / zoom / 2; // the gap between the two boxes in map units
    return [box(-50, -half - 80, 100, 80), box(-50, half, 100, 80)];
  };
  it('a chip is 20 px tall at zoom 1: a gap of 30 screen px between two boxes holds it', () => {
    expect(placeChipsAtZoom([req('a', route)], between(30, 1), 1).has('a')).toBe(true);
  });
  it('at zoom 1.5 the chip is 26.7 px tall (a third bigger, the most it grows): the same 30 screen px no longer hold it', () => {
    expect(placeChipsAtZoom([req('a', route)], between(30, 1.5), 1.5).has('a')).toBe(false);
    expect(placeChipsAtZoom([req('a', route)], between(34, 1.5), 1.5).has('a')).toBe(true);
  });
});

describe('both chips of a two-way pair (step 8.4e: the map-marks pair spec was red since 8.4d)', () => {
  // The fixture's pair 08 <-> 13 with the pane open: the whole map is fitted at zoom 0.39, so each line is about 133 screen px long.
  const boxes = [{ x: 624, y: 200, width: 130, height: 61 }, { x: 936, y: 400, width: 130, height: 61 }];
  const makes: ChipRequest = { key: 'a', width: 20, start: 0.78, route: [{ x: 664.5, y: 260.7 }, { x: 976.5, y: 400 }] };
  const madeFrom: ChipRequest = { key: 'b', width: 20, start: 0.78, route: [{ x: 1025.5, y: 400 }, { x: 713.5, y: 260.7 }] };
  it('both get a place at zoom 0.39 (a slide of 0.1 skipped the only free stretch of the second line)', () => {
    const out = placeChipsAtZoom([makes, madeFrom], boxes, 0.39);
    expect([...out.keys()].sort()).toEqual(['a', 'b']);
  });
  it('and still never touch each other or a box', () => {
    const out = placeChipsAtZoom([makes, madeFrom], boxes, 0.39);
    const a = out.get('a') as { x: number; y: number };
    const b = out.get('b') as { x: number; y: number };
    expect(hit(rectOf(a, 20, 0.39), rectOf(b, 20, 0.39))).toBe(false);
    for (const at of [a, b]) for (const box of boxes) expect(hit(rectOf(at, 20, 0.39), { x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height })).toBe(false);
  });
});
