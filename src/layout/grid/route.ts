/**
 * Edges of the grid layout (step 5.5c, ends changed in 5.5d). A straight line between the two end points `ports.ts` chose (on the
 * sides of the boxes that face each other). A line that would pass through another box is drawn as a gentle arc: a quadratic curve
 * sampled into `ARC_SAMPLES` segments, bowed by the smallest offset of `ARC_OFFSETS` (px, the distance of the curve's middle from its
 * chord), on either side, that clears every box; an arrow and its reverse try opposite sides first. When none does, the line stays
 * straight and is counted.
 */
import type { LayoutEdgeInput, Point } from '../contracts';
import { grow, polylineHits, sampleQuadratic, type Rect } from './geometry';
import type { EdgeEnds } from './ports';

export const ARC_OFFSETS: readonly number[] = [40, 80, 120, 160];
export const ARC_SAMPLES = 24;
/** A line closer than this to a box that is not one of its ends counts as passing through it. */
export const CLEARANCE = 4;

export interface Routed {
  readonly route: readonly Point[];
  readonly kind: 'straight' | 'arc' | 'blocked';
}

export function routeEdge(edge: LayoutEdgeInput, boxes: ReadonlyMap<string, Rect>, at: EdgeEnds | undefined): Routed | undefined {
  const from = boxes.get(edge.from);
  const to = boxes.get(edge.to);
  if (from === undefined || to === undefined || at === undefined) return undefined;
  const { start, end } = at;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length === 0) return undefined;
  const others: Rect[] = [];
  for (const [id, rect] of boxes) if (id !== edge.from && id !== edge.to) others.push(grow(rect, CLEARANCE));
  const ends = [grow(from, -1), grow(to, -1)];
  const clear = (points: readonly Point[]): boolean => !others.some((rect) => polylineHits(points, rect)) && !ends.some((rect) => polylineHits(points, rect));
  const straight = [start, end];
  if (clear(straight)) return { route: straight, kind: 'straight' };
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const nx = -(end.y - start.y) / length;
  const ny = (end.x - start.x) / length;
  for (const offset of ARC_OFFSETS) {
    for (const side of [at.pull, -at.pull]) {
      // the middle of a quadratic curve is half way to its control point
      const control = { x: middle.x + nx * 2 * offset * side, y: middle.y + ny * 2 * offset * side };
      const arc = sampleQuadratic(start, control, end, ARC_SAMPLES);
      if (clear(arc)) return { route: arc, kind: 'arc' };
    }
  }
  return { route: straight, kind: 'blocked' };
}
