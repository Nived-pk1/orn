/**
 * Shared geometry (pure): straight edge routes between node boxes, and the bounds of a set of boxes. Used by the fallback layout
 * for every edge and by the ELK adapter for the edges ELK did not route (non-tree edges of a radial layout, stress self-loops).
 */
import type { Point } from './contracts';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const centre = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** Where the line from the centre of `box` towards `toward` leaves the box. */
function exit(box: Box, toward: Point): Point {
  const c = centre(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const scale = Math.min(dx === 0 ? Infinity : box.width / 2 / Math.abs(dx), dy === 0 ? Infinity : box.height / 2 / Math.abs(dy));
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

/** A straight route from the border of `from` to the border of `to`; a self-loop leaves and re-enters the right side. */
export function straightRoute(from: Box, to: Box, loopSize: number): readonly Point[] {
  if (from === to) {
    const out = Math.max(loopSize, 4);
    const right = from.x + from.width;
    const upper = from.y + from.height / 4;
    const lower = from.y + (from.height * 3) / 4;
    return [{ x: right, y: upper }, { x: right + out, y: upper }, { x: right + out, y: lower }, { x: right, y: lower }];
  }
  return [exit(from, centre(to)), exit(to, centre(from))];
}

export function boundsOf(boxes: Iterable<Box>): { readonly width: number; readonly height: number } {
  let width = 0;
  let height = 0;
  for (const box of boxes) {
    width = Math.max(width, box.x + box.width);
    height = Math.max(height, box.y + box.height);
  }
  return { width, height };
}
