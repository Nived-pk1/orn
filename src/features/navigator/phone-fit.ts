/**
 * Fit and the first view on a touch screen (step 8.4e, C4). The phone's map is wider than its screen and pans sideways, so Fit does not squeeze every
 * family in (that put the titles at 6 to 8 px and left half the area empty). It uses the LARGEST zoom at which the visible boxes fit the map area's
 * HEIGHT, never below the zoom where a title is 10 px (and never below `FIT_FLOOR`), never above the zoom where a family title is 13 px. The view starts at the left edge, or is centred on the
 * selection (step 8.4f, M1: with the stack of buttons at the side, the first view takes the SMALLEST shift, left or right, that leaves every box's words clear of it, the leftmost
 * visible column whole and its margin at most 24 px; none such: the margin is 16 px and the stack sits where it covers the fewest boxes, reported as `clear: false`); when the boxes also fit the width they are centred. Pure: the answer is the world WINDOW to show, which the viewport's own `fitBox`
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

/** The shift search of a view centred on a selection is in steps of this many screen px, at most this share of the map area's width. */
const SLIDE_STEP_PX = 4;
const SLIDE_MAX = 0.6;
/** The left margin of the leftmost visible column: at most this many px (M1), 16 when the stack cannot be cleared. */
const MARGIN_MAX_PX = 24;
const MARGIN_FALLBACK_PX = 16;
/** At most this many candidate windows are tried (nearest to the plain one first). */
const MAX_CANDIDATES = 400;

export interface PhoneFitResult {
  /** The world window to show. */
  readonly box: Rect;
  /** False only when no shift keeps every box's words clear of the controls (the fallback case of M1). */
  readonly clear: boolean;
}

export function phoneFitBox(args: PhoneFitArgs): Rect {
  return phoneFit(args).box;
}

export function phoneFit(args: PhoneFitArgs): PhoneFitResult {
  const { content, size, insets, titleUnits, selected, avoid, boxes } = args;
  const availW = size.width - insets.left - insets.right;
  const availH = size.height - insets.top - insets.bottom;
  if (availW <= 0 || availH <= 0) return { box: content, clear: true };
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
  else if (selected !== undefined)
    x0 = Math.min(
      Math.max((selected.x0 + selected.x1) / 2 - winW / 2, content.x0),
      content.x1 - winW,
    );
  const finish = (at: number, clear: boolean): PhoneFitResult => ({
    box: { x0: at, y0, x1: at + winW, y1: y0 + winH },
    clear,
  });
  if (
    avoid === undefined ||
    avoid.length === 0 ||
    boxes === undefined ||
    boxes.length === 0 ||
    boxW <= winW
  )
    return finish(x0, true);
  const left = (b: Rect, at: number): number =>
    insets.left + (b.x0 - at) * scale;
  const right = (b: Rect, at: number): number =>
    insets.left + (b.x1 - at) * scale;
  const rowsOf = (b: Rect): [number, number] => [
    insets.top + (b.y0 - y0) * scale,
    insets.top + (b.y1 - y0) * scale,
  ];
  const count = (at: number): number =>
    boxes.filter((b) => {
      const [top, bottom] = rowsOf(b);
      return avoid.some(
        (a) =>
          left(b, at) < a.x1 &&
          right(b, at) > a.x0 &&
          top < a.y1 &&
          bottom > a.y0,
      );
    }).length;
  if (selected !== undefined) {
    // centred on a selection: the smallest shift either way, the selected box still on screen, no more than SLIDE_MAX of the width, no empty space beyond the content
    if (count(x0) === 0) return finish(x0, true);
    const step = SLIDE_STEP_PX / scale;
    const lowest = content.x0 - (MARGIN_MAX_PX - insets.left) / scale;
    const highest = content.x1 - winW;
    const mid = (selected.x0 + selected.x1) / 2;
    for (let k = 1; k * step < SLIDE_MAX * (size.width / scale); k += 1) {
      for (const at of [x0 - k * step, x0 + k * step]) {
        const onScreen =
          left({ ...selected, x0: mid, x1: mid }, at) > 0 &&
          left({ ...selected, x0: mid, x1: mid }, at) < size.width;
        if (at >= lowest && at <= highest && onScreen && count(at) === 0)
          return finish(at, true);
      }
    }
    return finish(x0, false);
  }
  // the first view: the window is put where a column starts at the margin; the nearest to the plain window that clears the controls wins
  const lowMargin = Math.min(MARGIN_FALLBACK_PX, insets.left);
  const highMargin = Math.max(MARGIN_MAX_PX, insets.left);
  const margins = [
    ...new Set([insets.left, MARGIN_FALLBACK_PX, 20, MARGIN_MAX_PX]),
  ].filter((m) => m >= lowMargin && m <= highMargin);
  const starts = [...new Set(boxes.map((b) => b.x0))];
  // never past the content: no empty space beyond its last column, none beyond the margin before its first
  const lowest = content.x0 - (highMargin - insets.left) / scale;
  const highest = content.x1 - winW;
  const candidates = [
    x0,
    ...starts.flatMap((start) =>
      margins.map((m) => start - (m - insets.left) / scale),
    ),
  ]
    .filter((at) => at === x0 || (at >= lowest && at <= highest))
    .sort((a, b) => Math.abs(a - x0) - Math.abs(b - x0))
    .slice(0, MAX_CANDIDATES);
  /** The margin of the leftmost visible column; null when a box is cut at the edge or none is on screen. */
  const marginAt = (at: number): number | null => {
    let least = Number.POSITIVE_INFINITY;
    for (const b of boxes) {
      const l = left(b, at);
      if (right(b, at) <= 0) continue;
      if (l < 0) return null;
      least = Math.min(least, l);
    }
    return Number.isFinite(least) ? least : null;
  };
  for (const at of candidates) {
    const margin = marginAt(at);
    if (
      margin !== null &&
      margin >= lowMargin - 0.01 &&
      margin <= highMargin + 0.01 &&
      count(at) === 0
    )
      return finish(at, true);
  }
  // none clears the controls: the margin is 16 px and the stack covers the fewest boxes
  let best: { at: number; hit: number } | undefined;
  for (const at of candidates) {
    const margin = marginAt(at);
    if (margin === null || Math.abs(margin - MARGIN_FALLBACK_PX) > 0.01)
      continue;
    const hit = count(at);
    if (best === undefined || hit < best.hit) best = { at, hit };
  }
  return finish(best?.at ?? x0, false);
}
