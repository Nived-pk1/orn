/**
 * The box scale of the grid layout (step 8.4c, A1; before: 8.2b-fix C1, 8.3b A5). The boxes are drawn bigger about their own centres: the largest
 * factor, at least 1, at which the gap between neighbouring columns is at least `COLUMN_GAP_RATIO` box widths and the gap between neighbouring
 * rows at least `ROW_GAP_RATIO` box heights (the old map had 1.7 and 2.5), and no two boxes come closer than `BOX_SCALE_MIN_GAP` px. The upper
 * limit 1.8 is gone; `BOX_SCALE_CEILING` only ends the search for boxes with nothing beside them. The `chips` argument is kept for callers and
 * tests. The centres stay (the arrangement is unchanged). Pure and deterministic; bounded (more than `BOX_SCALE_MAX_BOXES` boxes: no scaling,
 * the pair test is quadratic).
 */
import type { Rect } from './geometry';

/** Neighbouring columns: gap / box width (the old map: 1.7). */
export const COLUMN_GAP_RATIO = 1.4;
/** Neighbouring rows: gap / box height (the old map: 2.5). */
export const ROW_GAP_RATIO = 2;
/** The search stops here: a technical bound, not a design limit. */
export const BOX_SCALE_CEILING = 3;
export const BOX_SCALE_MIN_GAP = 16;
export const BOX_SCALE_MAX_BOXES = 400;
const STEPS = 24;

/** The rectangle grown by `factor` about its own centre. */
export function scaleAbout(rect: Rect, factor: number): Rect {
  const width = rect.width * factor;
  const height = rect.height * factor;
  return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
}

/** The distance between two rectangles: negative or zero when they overlap or touch along one axis only. */
function gap(a: Rect, b: Rect): number {
  const sx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
  const sy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
  return sx > 0 && sy > 0 ? Math.hypot(sx, sy) : Math.max(sx, sy);
}

/** True when two boxes, drawn at these sizes, keep the ratios (beside each other: columns; above each other: rows) and the least distance. */
function apart(a: Rect, b: Rect): boolean {
  const sx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
  const sy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
  if (gap(a, b) < BOX_SCALE_MIN_GAP) return false;
  if (sy < 0 && sx < COLUMN_GAP_RATIO * Math.max(a.width, b.width)) return false;
  if (sx < 0 && sy < ROW_GAP_RATIO * Math.max(a.height, b.height)) return false;
  return true;
}

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export function boxScaleFor(boxes: readonly Rect[], chips: readonly Rect[]): number {
  if (boxes.length > BOX_SCALE_MAX_BOXES) return 1;
  const fits = (factor: number): boolean => {
    const grown = boxes.map((rect) => scaleAbout(rect, factor));
    for (let i = 0; i < grown.length; i += 1) {
      for (let j = i + 1; j < grown.length; j += 1) if (!apart(grown[i] as Rect, grown[j] as Rect)) return false;
      for (const chip of chips) if (overlaps(grown[i] as Rect, chip)) return false;
    }
    return true;
  };
  if (!fits(1)) return 1;
  if (fits(BOX_SCALE_CEILING)) return BOX_SCALE_CEILING;
  let low = 1;
  let high = BOX_SCALE_CEILING;
  for (let i = 0; i < STEPS; i += 1) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}
