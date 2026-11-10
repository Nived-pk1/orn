import { describe, expect, it } from "vitest";
import { FIT_FLOOR, fitBox, fitScene, toScreen } from "./transform";

/** Step 8.4e, A3: Fit takes the free areas the floating controls leave (measured by the map), instead of constant bands. */
const size = { width: 1000, height: 600 };
const insets = { top: 70, right: 80, bottom: 50, left: 10 };

describe("Fit with measured insets", () => {
  it("fitBox keeps the content inside the free area on all four sides", () => {
    const box = { x0: 0, y0: 0, x1: 400, y1: 400 };
    const view = fitBox(box, size, insets);
    const a = toScreen(view, { x: box.x0, y: box.y0 });
    const b = toScreen(view, { x: box.x1, y: box.y1 });
    expect(a.x).toBeGreaterThanOrEqual(insets.left - 1e-9);
    expect(a.y).toBeGreaterThanOrEqual(insets.top - 1e-9);
    expect(b.x).toBeLessThanOrEqual(size.width - insets.right + 1e-9);
    expect(b.y).toBeLessThanOrEqual(size.height - insets.bottom + 1e-9);
  });
  it("centres the content in the free area (not the whole area)", () => {
    const view = fitBox({ x0: 0, y0: 0, x1: 100, y1: 100 }, size, insets);
    const mid = toScreen(view, { x: 50, y: 50 });
    expect(mid.x).toBeCloseTo((insets.left + size.width - insets.right) / 2);
    expect(mid.y).toBeCloseTo((insets.top + size.height - insets.bottom) / 2);
  });
  it("fitScene uses them too, and below the name floor starts at the free area corner", () => {
    const view = fitScene({ width: 40_000, height: 30_000 }, size, insets);
    expect(view.scale).toBe(FIT_FLOOR);
    expect(toScreen(view, { x: 0, y: 0 })).toEqual({
      x: insets.left,
      y: insets.top,
    });
  });
  it("without insets nothing changes (the constant bands stay)", () => {
    expect(fitBox({ x0: 0, y0: 0, x1: 400, y1: 400 }, size)).toEqual(
      fitBox({ x0: 0, y0: 0, x1: 400, y1: 400 }, size, undefined),
    );
  });
});
