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
