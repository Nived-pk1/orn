import { describe, expect, it } from 'vitest';
import { FIT_FLOOR, fitBox, toScreen } from '@/render/viewport';
import { phoneFitBox, PHONE_TITLE_MAX_PX } from './phone-fit';

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
  it('never below FIT_FLOOR: a very tall map starts at the floor and is panned', () => {
    const view = viewOf(phoneFitBox({ content: { x0: 0, y0: 0, x1: 2000, y1: 20_000 }, size, insets, titleUnits: TITLE }));
    expect(view.scale).toBeCloseTo(FIT_FLOOR, 6);
    expect(toScreen(view, { x: 0, y: 0 }).x).toBeCloseTo(insets.left, 6);
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
