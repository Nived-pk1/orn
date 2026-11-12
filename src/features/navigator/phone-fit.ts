/**
 * Fit and the first view on a touch screen (step 8.4e, C4). The phone's map is wider than its screen and pans sideways, so Fit does not squeeze every
 * family in (that put the titles at 6 to 8 px and left half the area empty). It uses the LARGEST zoom at which the visible boxes fit the map area's
 * HEIGHT, never below the zoom where a title is 10 px (and never below `FIT_FLOOR`), never above the zoom where a family title is 13 px. The view starts at the left edge, or is centred on the
 * selection; when the boxes also fit the width they are centred. Pure: the answer is the world WINDOW to show, which the viewport's own `fitBox`
 * turns into the view (so sticky Fit, rotation and the Fit button all work as they do on the desktop). No chemistry, no DOM.
 */
import { FIT_FLOOR, type Insets, type Rect, type Size } from '@/render/viewport';

/** The largest a family title is drawn on the phone's first view and Fit, in screen px. */
export const PHONE_TITLE_MAX_PX = 13;
/** The smallest a family title is drawn on the phone's first view and Fit (the 10 px the desktop keeps), unless that is below `FIT_FLOOR`: the map then pans both ways. Pinch can still go down to `FIT_FLOOR`. */
export const PHONE_TITLE_MIN_PX = 10;

export interface PhoneFitArgs {
  /** The visible boxes' rectangle, in map units. */
  readonly content: Rect;
  /** The map area, screen px. */
  readonly size: Size;
  /** The room the floating controls leave (measured). */
  readonly insets: Insets;
  /** A family title's size in map units (the smallest on the map). */
  readonly titleUnits: number;
  /** The selected box, in map units: the view is centred on it when the boxes do not fit the width. */
  readonly selected?: Rect | undefined;
  /** The controls that must stay clear of every box (the stack of buttons at the side, the hint pill), in screen px of the map area (with their gap): the first view is slid right until no box in its rows lies under it (A3 for the phone). */
  readonly avoid?: readonly Rect[] | undefined;
  /** Every box, in map units; needed with `avoid`. */
  readonly boxes?: readonly Rect[] | undefined;
}

/** The slide is in steps of this many screen px, at most this share of the map area's width. */
const SLIDE_STEP_PX = 4;
const SLIDE_MAX = 0.6;

export function phoneFitBox(args: PhoneFitArgs): Rect {
  const { content, size, insets, titleUnits, selected, avoid, boxes } = args;
  const availW = size.width - insets.left - insets.right;
  const availH = size.height - insets.top - insets.bottom;
  if (availW <= 0 || availH <= 0) return content;
  const boxW = Math.max(1, content.x1 - content.x0);
  const boxH = Math.max(1, content.y1 - content.y0);
  const units = Math.max(1, titleUnits);
  const scale = Math.max(FIT_FLOOR, PHONE_TITLE_MIN_PX / units, Math.min(availH / boxH, PHONE_TITLE_MAX_PX / units));
  const winW = availW / scale;
  const winH = availH / scale;
  // the window is the free area in map units: centred on the content where the content is smaller than it, else started at the top / left edge
  let y0 = content.y0;
  if (boxH <= winH) y0 = (content.y0 + content.y1) / 2 - winH / 2;
  else if (selected !== undefined) y0 = Math.min(Math.max((selected.y0 + selected.y1) / 2 - winH / 2, content.y0), content.y1 - winH);
  let x0 = content.x0;
  if (boxW <= winW) x0 = (content.x0 + content.x1) / 2 - winW / 2;
  else if (selected !== undefined) x0 = Math.min(Math.max((selected.x0 + selected.x1) / 2 - winW / 2, content.x0), content.x1 - winW);
  if (avoid !== undefined && avoid.length > 0 && boxes !== undefined && boxW > winW) {
    const under = (at: number): boolean =>
      boxes.some((b) => avoid.some((a) => insets.left + (b.x0 - at) * scale < a.x1 && insets.left + (b.x1 - at) * scale > a.x0 && insets.top + (b.y0 - y0) * scale < a.y1 && insets.top + (b.y1 - y0) * scale > a.y0));
    const step = SLIDE_STEP_PX / scale;
    // the smallest slide to the right that clears the stack; none within reach: the view is left as it is
    for (let k = 1; under(x0) && k * step < SLIDE_MAX * (size.width / scale); k += 1) {
      if (!under(x0 - k * step)) x0 -= k * step;
    }
  }
  return { x0, y0, x1: x0 + winW, y1: y0 + winH };
}
