import { describe, expect, it } from 'vitest';
import { FIT_FLOOR, fitBox, toScreen } from '@/render/viewport';
import { phoneFitBox, PHONE_TITLE_MAX_PX, PHONE_TITLE_MIN_PX } from './phone-fit';

/**
 * Step 8.4e, C4: on a touch screen Fit and the first view use the LARGEST zoom at which the visible boxes fit the map area's HEIGHT, never below
 * FIT_FLOOR, never above the zoom where a family title is 13 px; the map pans sideways. The view starts at the left edge, or is centred on the
 * selection; when the boxes also fit the width they are centred. The rule answers the world window to show; `fitBox` turns it into the view.
 */
const size = { width: 400, height: 800 };
const insets = { top: 70, right: 60, bottom: 60, left: 8 };
const TITLE = 16; // a family title in map units
const free = { w: size.width - insets.left - insets.right, h: size.height - insets.top - insets.bottom };
const viewOf = (window: ReturnType<typeof phoneFitBox>) => fitBox(window, size, insets);

describe('phoneFitBox', () => {
  it('the largest zoom at which the height fits: the content just fills the free height', () => {
    const content = { x0: 0, y0: 0, x1: 2000, y1: 1000 };
    const view = viewOf(phoneFitBox({ content, size, insets, titleUnits: TITLE }));
    expect(view.scale).toBeCloseTo(free.h / 1000, 6);
    expect(toScreen(view, { x: 0, y: 0 })).toEqual({ x: expect.closeTo(insets.left, 6), y: expect.closeTo(insets.top, 6) }); // starts at the left edge, at the top of the free area
    expect(toScreen(view, { x: 0, y: 1000 }).y).toBeCloseTo(size.height - insets.bottom, 6);
  });
  it('never below the zoom where a title is 10 px (resume 4): a very tall map starts there at the top-left and is panned both ways', () => {
    const view = viewOf(phoneFitBox({ content: { x0: 0, y0: 0, x1: 2000, y1: 20_000 }, size, insets, titleUnits: TITLE }));
    expect(PHONE_TITLE_MIN_PX).toBe(10);
    expect(view.scale).toBeCloseTo(PHONE_TITLE_MIN_PX / TITLE, 6);
    expect(view.scale).toBeGreaterThan(FIT_FLOOR);
    expect(toScreen(view, { x: 0, y: 0 })).toEqual({ x: expect.closeTo(insets.left, 6), y: expect.closeTo(insets.top, 6) });
  });
  it('a selection lower than the first window is brought into view: the window is centred on it, clamped to the map', () => {
    const content = { x0: 0, y0: 0, x1: 2000, y1: 20_000 };
    const selected = { x0: 900, y0: 15_000, x1: 1100, y1: 15_100 };
    const view = viewOf(phoneFitBox({ content, size, insets, titleUnits: TITLE, selected }));
    const mid = toScreen(view, { x: 1000, y: 15_050 });
    expect(mid.y).toBeCloseTo((insets.top + size.height - insets.bottom) / 2, 4);
    const last = viewOf(phoneFitBox({ content, size, insets, titleUnits: TITLE, selected: { x0: 0, y0: 19_900, x1: 100, y1: 20_000 } }));
    expect(toScreen(last, { x: 0, y: 20_000 }).y).toBeCloseTo(size.height - insets.bottom, 4); // clamped: the map's end, not empty space
  });
  it('but never below FIT_FLOOR either: titles drawn so large that 10 px is under the floor', () => {
    const view = viewOf(phoneFitBox({ content: { x0: 0, y0: 0, x1: 2000, y1: 20_000 }, size, insets, titleUnits: 40 }));
    expect(view.scale).toBeCloseTo(FIT_FLOOR, 6);
  });
  it('never above the zoom where a title is 13 px: a small map is not blown up, and is centred', () => {
    const content = { x0: 0, y0: 0, x1: 200, y1: 100 };
    const view = viewOf(phoneFitBox({ content, size, insets, titleUnits: TITLE }));
    expect(view.scale).toBeCloseTo(PHONE_TITLE_MAX_PX / TITLE, 6);
    const mid = toScreen(view, { x: 100, y: 50 });
    expect(mid.x).toBeCloseTo((insets.left + size.width - insets.right) / 2, 6);
    expect(mid.y).toBeCloseTo((insets.top + size.height - insets.bottom) / 2, 6);
  });
  it('when the boxes also fit the width at that zoom they are centred sideways', () => {
    const content = { x0: 100, y0: 0, x1: 400, y1: 1000 }; // 300 wide: fits at free.h / 1000
    const view = viewOf(phoneFitBox({ content, size, insets, titleUnits: TITLE }));
    expect(toScreen(view, { x: 250, y: 0 }).x).toBeCloseTo((insets.left + size.width - insets.right) / 2, 6);
  });
  it('with a selection that is off to the right, the view is centred on it', () => {
    const content = { x0: 0, y0: 0, x1: 3000, y1: 1000 };
    const selected = { x0: 2000, y0: 400, x1: 2200, y1: 460 };
    const view = viewOf(phoneFitBox({ content, size, insets, titleUnits: TITLE, selected }));
    expect(toScreen(view, { x: 2100, y: 430 }).x).toBeCloseTo((insets.left + size.width - insets.right) / 2, 6);
  });
  it('a selection near the left edge does not push empty space in: the view starts at the left edge', () => {
    const content = { x0: 0, y0: 0, x1: 3000, y1: 1000 };
    const view = viewOf(phoneFitBox({ content, size, insets, titleUnits: TITLE, selected: { x0: 0, y0: 0, x1: 100, y1: 50 } }));
    expect(toScreen(view, { x: 0, y: 0 }).x).toBeCloseTo(insets.left, 6);
  });
  it('a selection near the right edge does not push empty space in either: the view ends at the right edge', () => {
    const content = { x0: 0, y0: 0, x1: 3000, y1: 1000 };
    const view = viewOf(phoneFitBox({ content, size, insets, titleUnits: TITLE, selected: { x0: 2900, y0: 0, x1: 3000, y1: 50 } }));
    expect(toScreen(view, { x: 3000, y: 0 }).x).toBeCloseTo(size.width - insets.right, 6);
  });
  it('an empty or degenerate screen answers the content itself', () => {
    const content = { x0: 0, y0: 0, x1: 100, y1: 100 };
    expect(phoneFitBox({ content, size: { width: 50, height: 50 }, insets, titleUnits: TITLE })).toEqual(content);
  });
});

describe('phoneFitBox: the stack at the side keeps clear of the boxes (A3 for the phone, resume 4)', () => {
  const content = { x0: 0, y0: 0, x1: 2000, y1: 1000 };
  const boxes = [
    { x0: 0, y0: 0, x1: 150, y1: 100 },
    { x0: 400, y0: 0, x1: 550, y1: 100 },
    { x0: 800, y0: 0, x1: 950, y1: 100 },
    { x0: 400, y0: 600, x1: 550, y1: 700 },
  ];
  const avoid = [{ x0: 330, y0: 90, x1: 395, y1: 300 }]; // the stack, screen px
  const clashes = (view: ReturnType<typeof viewOf>): number =>
    boxes.filter((b) => {
      const a = toScreen(view, { x: b.x0, y: b.y0 });
      const z = toScreen(view, { x: b.x1, y: b.y1 });
      return avoid.some((r) => a.x < r.x1 && z.x > r.x0 && a.y < r.y1 && z.y > r.y0);
    }).length;
  it('without the rule a box would lie under the stack (the test is not empty)', () => {
    expect(clashes(viewOf(phoneFitBox({ content, size, insets, titleUnits: TITLE })))).toBeGreaterThan(0);
  });
  it('with it the first view is slid until no box in the stack rows is under it', () => {
    const view = viewOf(phoneFitBox({ content, size, insets, titleUnits: TITLE, avoid, boxes }));
    expect(clashes(view)).toBe(0);
  });
  it('the slide is only to the right (nothing is cut at the left) and as small as it can be', () => {
    const plain = viewOf(phoneFitBox({ content, size, insets, titleUnits: TITLE }));
    const view = viewOf(phoneFitBox({ content, size, insets, titleUnits: TITLE, avoid, boxes }));
    expect(view.scale).toBeCloseTo(plain.scale, 9);
    expect(view.x).toBeGreaterThanOrEqual(plain.x);
  });
  it('every control counts: the stack and a hint pill at the foot are both cleared', () => {
    const both = [{ x0: 330, y0: 90, x1: 395, y1: 300 }, { x0: 150, y0: 600, x1: 250, y1: 740 }];
    const view = viewOf(phoneFitBox({ content, size, insets, titleUnits: TITLE, avoid: both, boxes }));
    const hit = boxes.filter((b) => {
      const a = toScreen(view, { x: b.x0, y: b.y0 });
      const z = toScreen(view, { x: b.x1, y: b.y1 });
      return both.some((r) => a.x < r.x1 && z.x > r.x0 && a.y < r.y1 && z.y > r.y0);
    });
    expect(hit).toEqual([]);
  });
  it('nothing under the stack to begin with: the view is left alone', () => {
    const clear = [{ x0: 900, y0: 90, x1: 960, y1: 300 }];
    const a = phoneFitBox({ content, size, insets, titleUnits: TITLE, avoid: clear, boxes });
    expect(a).toEqual(phoneFitBox({ content, size, insets, titleUnits: TITLE }));
  });
});

