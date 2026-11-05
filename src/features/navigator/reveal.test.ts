/** Keeping a family, or a chain, on screen (step 5.7 f; step 8.2b-fix E2). */
import { describe, expect, it } from 'vitest';
import { viewportAboveSheet } from './chain-reveal';

describe('viewportAboveSheet (step 8.2b-fix, E2): the chain sits in the map area above the phone sheet', () => {
  const area = { width: 400, height: 800 };
  const sheet = 300; // px of the map the sheet covers at the bottom
  const box = (x: number, y: number, w = 100, h = 40) => ({ x, y, width: w, height: h });
  it('boxes already inside the visible part: no change', () => {
    expect(viewportAboveSheet({ x: 0, y: 0, scale: 1 }, area, sheet, [box(50, 100), box(200, 300)])).toBeUndefined();
  });
  it('boxes under the sheet: a pan only (the scale is kept) that puts them in the visible part', () => {
    const moved = viewportAboveSheet({ x: 0, y: 0, scale: 1 }, area, sheet, [box(50, 600), box(200, 650)]);
    expect(moved?.scale).toBe(1);
    const top = 600 * 1 + (moved?.y ?? 0);
    const bottom = 650 + 40 + (moved?.y ?? 0);
    expect(top).toBeGreaterThanOrEqual(16);
    expect(bottom).toBeLessThanOrEqual(area.height - sheet - 16);
  });
  it('boxes too big for the visible part at this scale: it zooms out just enough to fit them', () => {
    const moved = viewportAboveSheet({ x: 0, y: 0, scale: 1 }, area, sheet, [box(0, 0), box(0, 900)]);
    expect(moved?.scale).toBeLessThan(1);
    const bottom = (900 + 40) * (moved?.scale ?? 1) + (moved?.y ?? 0);
    expect(bottom).toBeLessThanOrEqual(area.height - sheet);
  });
  it('no boxes, or no room: nothing', () => {
    expect(viewportAboveSheet({ x: 0, y: 0, scale: 1 }, area, sheet, [])).toBeUndefined();
    expect(viewportAboveSheet({ x: 0, y: 0, scale: 1 }, area, 800, [box(0, 0)])).toBeUndefined();
  });
});
