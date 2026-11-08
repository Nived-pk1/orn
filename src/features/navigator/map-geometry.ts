/** Small pure geometry for the map's derived view (step 8.2a): a point along a polyline, a sideways shift, words for counts. No chemistry, no DOM. */
import type { Point } from '@/layout/contracts';

const length = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** The point at fraction `t` (0 to 1) of the polyline's length. An empty line gives the origin. */
export function pointAlong(points: readonly Point[], t: number): Point {
  const first = points[0];
  if (first === undefined) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += length(points[i - 1] as Point, points[i] as Point);
  if (total === 0) return first;
  let want = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    const step = length(a, b);
    if (want <= step && step > 0) return { x: a.x + ((b.x - a.x) * want) / step, y: a.y + ((b.y - a.y) * want) / step };
    want -= step;
  }
  return points[points.length - 1] as Point;
}

/** The offset of `distance` px along the normal of the line's own chord (start to end); the reverse line's normal points the other way. */
export function sideOffset(points: readonly Point[], distance: number): Point {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return { x: 0, y: 0 };
  const run = length(first, last);
  if (run === 0) return { x: 0, y: 0 };
  return { x: (-(last.y - first.y) / run) * distance, y: ((last.x - first.x) / run) * distance };
}

export const shifted = (points: readonly Point[], by: Point): Point[] => points.map((p) => ({ x: p.x + by.x, y: p.y + by.y }));

export const distance = length;

export const reactionsWord = (n: number): string => `${n} ${n === 1 ? 'reaction' : 'reactions'}`;

/** The smallest rectangle holding every box (the boxes Fit fills the area with); undefined when there is none. */
export function boxesRect(boxes: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[]): { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number } | undefined {
  if (boxes.length === 0) return undefined;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const box of boxes) {
    x0 = Math.min(x0, box.x);
    y0 = Math.min(y0, box.y);
    x1 = Math.max(x1, box.x + box.width);
    y1 = Math.max(y1, box.y + box.height);
  }
  return { x0, y0, x1, y1 };
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where the line through `from` along `dir` meets the border of `box` nearest to `from` (undefined when it meets none). */
function borderNear(from: Point, dir: Point, box: Box): Point | undefined {
  const hits: Point[] = [];
  const within = (v: number, low: number, high: number): boolean => v >= low - 1e-6 && v <= high + 1e-6;
  if (dir.x !== 0) {
    for (const x of [box.x, box.x + box.width]) {
      const y = from.y + ((x - from.x) / dir.x) * dir.y;
      if (within(y, box.y, box.y + box.height)) hits.push({ x, y });
    }
  }
  if (dir.y !== 0) {
    for (const y of [box.y, box.y + box.height]) {
      const x = from.x + ((y - from.y) / dir.y) * dir.x;
      if (within(x, box.x, box.x + box.width)) hits.push({ x, y });
    }
  }
  return hits.sort((a, b) => length(a, from) - length(b, from))[0];
}

/**
 * A line that was moved sideways ends beside its box's border, not on it (step 8.4c, C): each end slides along its own first or last segment to the
 * border of its box. An end that meets no border keeps where it is. The inner points stay.
 */
export function snapEnds(points: readonly Point[], from: Box, to: Box): Point[] {
  if (points.length < 2) return [...points];
  const out = [...points];
  const first = points[0] as Point;
  const second = points[1] as Point;
  const last = points[points.length - 1] as Point;
  const before = points[points.length - 2] as Point;
  const start = borderNear(first, { x: second.x - first.x, y: second.y - first.y }, from);
  const end = borderNear(last, { x: last.x - before.x, y: last.y - before.y }, to);
  if (start !== undefined) out[0] = start;
  if (end !== undefined) out[out.length - 1] = end;
  return out;
}
