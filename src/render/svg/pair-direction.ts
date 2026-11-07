/** A two-way pair is one line (ADR-044); each direction owns the half of it that ends at its head (step 8.4b, B). Pure geometry, no DOM. */
import type { Point } from '@/layout/contracts';

const length = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);
const total = (points: readonly Point[]): number => points.reduce((sum, p, i) => (i === 0 ? 0 : sum + length(points[i - 1] as Point, p)), 0);

/** The point at distance `at` along the line, and the index of the segment it lies on. */
function walk(points: readonly Point[], at: number): { readonly point: Point; readonly next: number } {
  let left = at;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    const step = length(a, b);
    if (left <= step && step > 0) return { point: { x: a.x + ((b.x - a.x) * left) / step, y: a.y + ((b.y - a.y) * left) / step }, next: i };
    left -= step;
  }
  return { point: points[points.length - 1] as Point, next: points.length };
}

/** The second half of a direction's own route: from the middle of the line to its head. */
export function halfOf(points: readonly Point[]): Point[] {
  if (points.length < 2) return [...points];
  const { point, next } = walk(points, total(points) / 2);
  return [point, ...points.slice(next)];
}

/** The distance from `p` to the segment `a`-`b`. */
function toSegment(p: Point, a: Point, b: Point): number {
  const run = length(a, b);
  if (run === 0) return length(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (run * run)));
  return length(p, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
}

/**
 * The direction a click at `point` chooses on the forward route: the one whose head is nearer, measured as the distance to the half of the
 * line that ends at that head. A tie (the exact middle) goes forward, always.
 */
export function nearerHead(forward: readonly Point[], point: Point): 'forward' | 'back' {
  const distanceTo = (points: readonly Point[]): number => {
    let best = Infinity;
    for (let i = 1; i < points.length; i += 1) best = Math.min(best, toSegment(point, points[i - 1] as Point, points[i] as Point));
    return best;
  };
  const ahead = distanceTo(halfOf(forward));
  const behind = distanceTo(halfOf([...forward].reverse()));
  return behind < ahead ? 'back' : 'forward';
}
