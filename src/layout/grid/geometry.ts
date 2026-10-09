/**
 * Geometry of the grid layout (step 5.5c; pure): rectangles, where a line leaves and enters a box, whether a polyline touches a box,
 * the points of a quadratic curve and the point at a fraction of a polyline's length. No state, no clock.
 */
import type { Point } from '../contracts';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const centreOf = (rect: Rect): Point => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

/** The rectangle grown by `by` on every side (negative: shrunk). */
export const grow = (rect: Rect, by: number): Rect => ({ x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by });

/** Parameters (0..1) where the segment a->b is inside the rectangle, or undefined when it is not (slab method). */
function inside(a: Point, b: Point, rect: Rect): { readonly enter: number; readonly leave: number } | undefined {
  let enter = 0;
  let leave = 1;
  const axes: readonly [number, number, number, number][] = [
    [a.x, b.x - a.x, rect.x, rect.x + rect.width],
    [a.y, b.y - a.y, rect.y, rect.y + rect.height],
  ];
  for (const [from, delta, low, high] of axes) {
    if (delta === 0) {
      if (from <= low || from >= high) return undefined;
      continue;
    }
    let t0 = (low - from) / delta;
    let t1 = (high - from) / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0);
    leave = Math.min(leave, t1);
    if (enter > leave) return undefined;
  }
  return { enter, leave };
}

/** True when the segment a->b has a point inside the rectangle (a touch of the border does not count: the rectangle is open). */
export function segmentHits(a: Point, b: Point, rect: Rect): boolean {
  const span = inside(a, b, rect);
  return span !== undefined && span.leave - span.enter > 1e-9;
}

export const polylineHits = (points: readonly Point[], rect: Rect): boolean => {
  for (let i = 1; i < points.length; i += 1) if (segmentHits(points[i - 1] as Point, points[i] as Point, rect)) return true;
  return false;
};

/**
 * The part of the segment a->b that lies between the border of `from` (where it leaves) and the border of `to` (where it
 * enters). Undefined when the line misses a box or the boxes overlap along it.
 */
export function clipBetween(a: Point, b: Point, from: Rect, to: Rect): readonly [Point, Point] | undefined {
  const out = inside(a, b, from);
  const into = inside(a, b, to);
  if (out === undefined || into === undefined || out.leave >= into.enter) return undefined;
  const at = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  return [at(out.leave), at(into.enter)];
}

/** `count` + 1 points of the quadratic curve p0, control, p2 (t = 0 .. 1). */
export function sampleQuadratic(p0: Point, control: Point, p2: Point, count: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const u = 1 - t;
    points.push({ x: u * u * p0.x + 2 * u * t * control.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * control.y + t * t * p2.y });
  }
  return points;
}

export function lengthOf(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += Math.hypot((points[i] as Point).x - (points[i - 1] as Point).x, (points[i] as Point).y - (points[i - 1] as Point).y);
  return total;
}

/** The point at `fraction` (0..1) of the polyline's length; the first point for a zero-length line. */
export function pointAt(points: readonly Point[], fraction: number): Point {
  const first = points[0] as Point;
  const total = lengthOf(points);
  if (total === 0) return first;
  let left = total * fraction;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length >= left && length > 0) return { x: a.x + ((b.x - a.x) * left) / length, y: a.y + ((b.y - a.y) * left) / length };
    left -= length;
  }
  return points[points.length - 1] as Point;
}

/** True when two rectangles share area (touching borders do not overlap). */
export const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
