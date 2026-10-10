/**
 * The self-loop glyph (decision Q4; ADV-005; redrawn in step 5.5d, item c): the layout never sees a loop, so the builder draws it at
 * the top-right corner of its node: a loop that leaves the top edge `LOOP_INSET` px from the corner, swings up and out to the right
 * and comes back into the right edge `LOOP_INSET` px below the corner, ending in an arrowhead that points into the box. Its count
 * chip sits beside it, to the right of the swing. The loop reaches `LOOP_RISE` px above the node's top: the builder lifts the whole
 * drawing when a loop would otherwise leave the bounds (coordinates stay at least 0).
 */
import type { Point } from '@/layout/contracts';
import { CHIP_HEIGHT } from './label-sizes';

/** How far the loop's chip and curve reach above the node's top edge. */
export const LOOP_RISE = 40;
/** How far from the corner the loop leaves the top edge and enters the right edge. */
export const LOOP_INSET = 12;
/** How far to the right of the node's edge the loop swings. */
export const LOOP_REACH = 40;
const SEGMENTS = 20;
/** Air between the swing of the loop and its chip. */
const LOOP_LABEL_GAP = 4;

export interface LoopGeometry {
  readonly points: readonly Point[];
  readonly labelAt: Point;
}

/** `box` is the node's top-left corner and size; `label` the chip's size. */
export function loopGeometry(box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, label?: { readonly width: number; readonly height: number }): LoopGeometry {
  const right = box.x + box.width;
  const start = { x: right - LOOP_INSET, y: box.y };
  const end = { x: right, y: box.y + LOOP_INSET };
  // a cubic curve: up from the top edge, out to the right, back left into the right edge (the last tangent points into the box)
  const c1 = { x: right - LOOP_INSET, y: box.y - LOOP_RISE * 1.7 };
  const c2 = { x: right + LOOP_REACH * 1.7, y: box.y + LOOP_INSET };
  const points: Point[] = [];
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const t = i / SEGMENTS;
    const u = 1 - t;
    points.push({
      x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
      y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
    });
  }
  const far = Math.max(...points.map((p) => p.x));
  const width = label?.width ?? CHIP_HEIGHT;
  return { points, labelAt: { x: far + LOOP_LABEL_GAP + width / 2, y: box.y - LOOP_RISE / 2 + (label?.height ?? CHIP_HEIGHT) / 4 } };
}
