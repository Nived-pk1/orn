import { describe, expect, it } from "vitest";
import { FIT_PADDING } from "@/render/viewport";
import { insetsOf, titleUnitsOf } from "./free-areas-rule";

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

describe("titleUnitsOf: the smallest family title as drawn (the phone's 13 px cap uses it)", () => {
  const nominal = 14;
  it("a box drawn bigger carries its title with it: the cap counts the DRAWN size, not the nominal one", () => {
    expect(titleUnitsOf([{ box: "hub", scale: 1.15 }], nominal)).toBeCloseTo(16.1, 1);
  });
  it("the smallest drawn hub wins; boxes that are not families do not count", () => {
    expect(
      titleUnitsOf([{ box: "hub", scale: 1.5 }, { box: "hub", scale: 0.9 }, { box: "unclassified", scale: 0.1 }, { box: "hub" }], nominal),
    ).toBeCloseTo(12.6, 1);
  });
  it("no family drawn: the nominal size", () => {
    expect(titleUnitsOf([], nominal)).toBe(nominal);
    expect(titleUnitsOf([{ box: "unclassified" }], nominal)).toBe(nominal);
  });
});

describe("insetsOf: a control as tall as the area is a side control (step 8.4f, M2)", () => {
  // phone landscape with the panel open: the panel is wider than it is tall and fills the map's whole height, but it is a column at the right, not a bar
  const landscape = { width: 694, height: 272 };
  const panel = { x: 300, y: 0, w: 394, h: 272 };
  it("takes the right side, nothing from the bottom", () => {
    const got = insetsOf([panel], landscape);
    expect(got.right).toBe(402);
    expect(got.bottom).toBe(16);
  });
  it("also when the content size is known (every choice of side is tried)", () => {
    const got = insetsOf([panel], landscape, { width: 1800, height: 600 });
    expect(got.right).toBe(402);
    expect(got.bottom).toBe(16);
  });
  it("a bar as wide as the area is still a top or bottom control", () => {
    const bar = { x: 0, y: 0, w: 694, h: 40 };
    expect(insetsOf([bar], landscape).top).toBe(48);
  });
  it("a control that sits right beside such a column belongs to its side: the stack at the panel's edge takes room from the right, not the left", () => {
    const wideMap = { width: 807, height: 292 };
    const column = { x: 407, y: 0, w: 400, h: 292 };
    const stack = { x: 351, y: 8, w: 48, h: 196 }; // its middle is left of the area's middle, but it hugs the panel
    for (const content of [undefined, { width: 1800, height: 600 }]) {
      const got = insetsOf([stack, column], wideMap, content);
      expect(got.left).toBe(24);
      expect(got.right).toBe(464);
    }
  });
  it("a bar beside the column is not pulled to its side (the top bar of the phone)", () => {
    const wideMap = { width: 694, height: 272 };
    const bar = { x: 8, y: 8, w: 289, h: 54 };
    const column = { x: 300, y: 0, w: 394, h: 272 };
    expect(insetsOf([bar, column], wideMap).top).toBe(70);
    expect(insetsOf([bar, column], wideMap).left).toBe(24);
  });
});

describe('the floor case (step 8.4m, M4): content that cannot fit at the smallest readable zoom', () => {
  // a 1900 x 1100 map in a 1100 x 640 area; at the floor (0.55) the content is 1045 x 605 px and cannot fit whichever edges the controls take
  const area = { width: 1100, height: 640 };
  const content = { width: 1900, height: 1100 };
  const toolbar = { x: 8, y: 8, w: 537, h: 42 };
  const key = { x: 8, y: 590, w: 91, h: 42 };
  const stack = { x: 1050, y: 513, w: 42, h: 119 };

  it('without a floor the largest zoom wins: the Key takes the left edge (107 px), which is the empty strip of screenshot 4', () => {
    expect(insetsOf([toolbar, key, stack], area, content).left).toBe(107);
  });

  it('with the floor the edges that CUT least win: the left stays at the padding and the Key takes the bottom', () => {
    const insets = insetsOf([toolbar, key, stack], area, content, 0.55);
    expect(insets.left).toBe(FIT_PADDING);
    expect(insets.bottom).toBe(58);
  });

  it('content that fits above the floor is not affected by it', () => {
    const roomy = { width: 1732, height: 888 };
    const controls = [toolbar, { x: 8, y: 838, w: 556, h: 42 }, { x: 1682, y: 761, w: 42, h: 119 }];
    expect(insetsOf(controls, roomy, { width: 1500, height: 900 }, 0.55)).toEqual(insetsOf(controls, roomy, { width: 1500, height: 900 }));
  });
});
