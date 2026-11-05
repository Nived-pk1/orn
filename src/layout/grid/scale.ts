/**
 * The box scale of the grid layout (step 8.2b-fix, C1). The boxes of the overview are small for the space between them, so they are
 * drawn bigger about their own centres: the largest factor from 1 to `BOX_SCALE_MAX` such that no two boxes come closer than
 * `BOX_SCALE_MIN_GAP` px and no box covers a chip of the unscaled drawing. The centres stay (the arrangement is unchanged). Pure and
 * deterministic; bounded (more than `BOX_SCALE_MAX_BOXES` boxes: no scaling, the pair test is quadratic).
 */
import type { Rect } from './geometry';

export const BOX_SCALE_MAX = 1.8;
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

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export function boxScaleFor(boxes: readonly Rect[], chips: readonly Rect[]): number {
  if (boxes.length > BOX_SCALE_MAX_BOXES) return 1;
  const fits = (factor: number): boolean => {
    const grown = boxes.map((rect) => scaleAbout(rect, factor));
    for (let i = 0; i < grown.length; i += 1) {
      for (let j = i + 1; j < grown.length; j += 1) if (gap(grown[i] as Rect, grown[j] as Rect) < BOX_SCALE_MIN_GAP) return false;
      for (const chip of chips) if (overlaps(grown[i] as Rect, chip)) return false;
    }
    return true;
  };
  if (!fits(1)) return 1;
  if (fits(BOX_SCALE_MAX)) return BOX_SCALE_MAX;
  let low = 1;
  let high = BOX_SCALE_MAX;
  for (let i = 0; i < STEPS; i += 1) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}
