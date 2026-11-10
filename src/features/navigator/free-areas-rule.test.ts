import { describe, expect, it } from "vitest";
import { insetsOf } from "./free-areas-rule";

const area = { width: 400, height: 600 };

describe("insetsOf: the room each floating control takes", () => {
  it("no controls: the plain margins", () => {
    expect(insetsOf([], area)).toEqual({
      top: 16,
      right: 24,
      bottom: 16,
      left: 24,
    });
  });
  it("a wide bar near the top takes the top, a wide pill near the bottom takes the bottom", () => {
    expect(insetsOf([{ x: 8, y: 8, w: 250, h: 52 }], area).top).toBe(68);
    expect(insetsOf([{ x: 80, y: 540, w: 240, h: 36 }], area).bottom).toBe(68);
  });
  it("a tall stack takes the side it is nearest", () => {
    expect(insetsOf([{ x: 344, y: 8, w: 48, h: 160 }], area).right).toBe(64);
    expect(insetsOf([{ x: 8, y: 8, w: 48, h: 160 }], area).left).toBe(64);
  });
  it("the largest need on a side wins, a zero-size control is ignored", () => {
    const bars = [
      { x: 0, y: 4, w: 100, h: 30 },
      { x: 0, y: 8, w: 100, h: 60 },
      { x: 0, y: 0, w: 0, h: 0 },
    ];
    expect(insetsOf(bars, area).top).toBe(76);
  });
});

describe('insetsOf with the size of what Fit shows: each corner control reserves the edge that costs the fit least', () => {
  const wide = { width: 1112, height: 684 };
  const stack = { x: 1062, y: 565, w: 42, h: 119 }; // bottom-right: right costs 58, bottom costs 127
  const bar = { x: 8, y: 8, w: 430, h: 42 }; // top-left: top costs 58, left costs 446
  it('a map limited by its WIDTH puts the zoom stack on the bottom (the height has room), not on the right', () => {
    const got = insetsOf([bar, stack], wide, { width: 1300, height: 400 });
    expect(got.right).toBe(24);
    expect(got.bottom).toBe(127);
  });
  it('a map limited by its HEIGHT puts the stack on the right (the width has room)', () => {
    const got = insetsOf([bar, stack], wide, { width: 400, height: 900 });
    expect(got.right).toBe(58);
    expect(got.bottom).toBe(16);
  });
  it('the bar stays on the top whatever the content', () => {
    expect(insetsOf([bar, stack], wide, { width: 1300, height: 400 }).top).toBe(58);
  });
  it('without the content size the nearest edge by shape is used, as before', () => {
    expect(insetsOf([bar, stack], wide).right).toBe(58);
  });
});
