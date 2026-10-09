/**
 * Edges of the grid layout (step 5.5c). A straight line between the borders of the two boxes. An arrow and its reverse (or any set of
 * edges between the same two boxes) are parallel lines `PARALLEL_GAP` apart, spread evenly about the centre line, in edge id order.
 * A line that would pass through another box is drawn as a gentle arc: a quadratic curve sampled into `ARC_SAMPLES` segments, bowed by
 * the smallest offset of `ARC_OFFSETS` (px, the distance of the curve's middle from its chord), on either side, that clears every
 * box. When none does, the line stays straight and is counted.
 */
import type { LayoutEdgeInput, Point } from '../contracts';
import { centreOf, clipBetween, grow, polylineHits, sampleQuadratic, type Rect } from './geometry';

export const PARALLEL_GAP = 10;
export const ARC_OFFSETS: readonly number[] = [40, 80, 120, 160];
export const ARC_SAMPLES = 24;
/** A line closer than this to a box that is not one of its ends counts as passing through it. */
export const CLEARANCE = 4;

export interface Routed {
  readonly route: readonly Point[];
  readonly kind: 'straight' | 'arc' | 'blocked';
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** Each edge's parallel offset (px, along the normal of the lower-id to higher-id direction); 0 for a lone edge. */
export function parallelOffsets(edges: readonly LayoutEdgeInput[]): ReadonlyMap<string, number> {
  const groups = new Map<string, LayoutEdgeInput[]>();
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    const key = pairKey(edge.from, edge.to);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [edge]);
    else group.push(edge);
  }
  const offsets = new Map<string, number>();
  for (const group of groups.values()) {
    group.forEach((edge, index) => offsets.set(edge.id, (index - (group.length - 1) / 2) * PARALLEL_GAP));
  }
  return offsets;
}

/** The line between two boxes, `shift` px along the normal of the direction lower-id -> higher-id; undefined: the boxes do not allow a line. */
function chord(edge: LayoutEdgeInput, from: Rect, to: Rect, shift: number): readonly [Point, Point] | undefined {
  const a = centreOf(from);
  const b = centreOf(to);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length === 0) return undefined;
  // the normal of the canonical direction (lower id -> higher id), so that two opposite edges are shifted to opposite sides
  const sign = edge.from < edge.to ? 1 : -1;
  const nx = (-(b.y - a.y) / length) * sign;
  const ny = ((b.x - a.x) / length) * sign;
  const moved = (p: Point): Point => ({ x: p.x + nx * shift, y: p.y + ny * shift });
  return clipBetween(moved(a), moved(b), from, to) ?? clipBetween(a, b, from, to);
}

export function routeEdge(
  edge: LayoutEdgeInput,
  boxes: ReadonlyMap<string, Rect>,
  shift: number,
): Routed | undefined {
  const from = boxes.get(edge.from);
  const to = boxes.get(edge.to);
  if (from === undefined || to === undefined) return undefined;
  const line = chord(edge, from, to, shift);
  if (line === undefined) return undefined;
  const [start, end] = line;
  const others: Rect[] = [];
  for (const [id, rect] of boxes) if (id !== edge.from && id !== edge.to) others.push(grow(rect, CLEARANCE));
  const ends = [grow(from, -1), grow(to, -1)];
  const clear = (points: readonly Point[]): boolean => !others.some((rect) => polylineHits(points, rect)) && !ends.some((rect) => polylineHits(points, rect));
  const straight = [start, end];
  if (clear(straight)) return { route: straight, kind: 'straight' };
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const sign = edge.from < edge.to ? 1 : -1;
  const nx = (-(end.y - start.y) / length) * sign;
  const ny = ((end.x - start.x) / length) * sign;
  // the side a parallel edge was shifted to is tried first, so that an arrow and its reverse bow apart
  const first = shift < 0 ? -1 : 1;
  for (const offset of ARC_OFFSETS) {
    for (const side of [first, -first]) {
      // the middle of a quadratic curve is half way to its control point
      const control = { x: middle.x + nx * 2 * offset * side, y: middle.y + ny * 2 * offset * side };
      const arc = sampleQuadratic(start, control, end, ARC_SAMPLES);
      if (clear(arc)) return { route: arc, kind: 'arc' };
    }
  }
  return { route: straight, kind: 'blocked' };
}
