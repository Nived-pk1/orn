/**
 * Where an arrow meets a box (step 5.5d, item a). An arrow leaves and enters a box on the side that faces the other box. Arrows that
 * use one side of a box are spread evenly along it, ordered by where their other end lies (so they do not cross near the box), at
 * least `PORT_GAP` apart and `CORNER_CLEAR` from the ends of the side (clear of the rounded corner). The arrows between the same two
 * boxes (an arrow and its reverse) form a cluster: they run `PORT_GAP` apart, in edge id order, at both ends. A side that holds more
 * arrows than fit `PORT_GAP` apart does NOT let their ends run past the box (step 8.2b-fix, B1): the slots are spread evenly along the
 * usable length and the arrows share the nearest slot (they end at the same point, in order), and the result counts that side (never
 * silent). Pure and deterministic.
 */
import type { LayoutEdgeInput, Point } from '../contracts';
import { centreOf, type Rect } from './geometry';

/** The least distance between two end points on one side, and between an arrow and its reverse (step 8.4c, C: 20 map units, so the stroke edges are 8 px or more apart at the sizes Fit gives). */
export const PORT_GAP = 20;
/** An end point is at least this far from a corner of the box: the corner radius (8 px) and a little air. */
export const CORNER_CLEAR = 10;

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface EdgeEnds {
  readonly start: Point;
  readonly end: Point;
  /** -1 or +1: the side of its own normal an arc bows to first (so that an arrow and its reverse bow apart); 1 for a lone arrow. */
  readonly pull: number;
}

export interface PortAssignment {
  readonly ends: ReadonlyMap<string, EdgeEnds>;
  /** Sides whose arrows cannot keep both `PORT_GAP` and `CORNER_CLEAR`. */
  readonly crowded: number;
}

/**
 * The offsets (px from the start of a side of `length`) at which `count` arrows meet it, in the arrows' order. Always inside the usable
 * length (`CORNER_CLEAR` from each end). Arrows that fit get a slot each, at least `PORT_GAP` apart and centred; when more arrows come
 * than slots fit `PORT_GAP` apart, the slots are spread evenly over the usable length and each arrow takes the nearest slot, so arrows
 * share slots and keep their order. A side with no usable length puts every arrow in its middle.
 */
export function shareSlots(length: number, count: number): number[] {
  if (count <= 0) return [];
  const usable = length - 2 * CORNER_CLEAR;
  if (count === 1 || usable <= 0) return new Array<number>(count).fill(length / 2);
  const most = Math.floor(usable / PORT_GAP) + 1;
  if (count <= most) {
    const step = Math.max(PORT_GAP, usable / (count + 1));
    const start = (length - (count - 1) * step) / 2;
    return Array.from({ length: count }, (_, i) => start + i * step);
  }
  const step = usable / (most - 1);
  return Array.from({ length: count }, (_, i) => CORNER_CLEAR + Math.round((i * (most - 1)) / (count - 1)) * step);
}

const OPPOSITE: Readonly<Record<Side, Side>> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

const horizontal = (side: Side): boolean => side === 'left' || side === 'right';

/** The side of `a` that faces `b`: sideways when the centres are further apart sideways than the boxes' sizes call for. */
export function sideFacing(a: Rect, b: Rect): Side {
  const ca = centreOf(a);
  const cb = centreOf(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  if (Math.abs(dx) * (a.height + b.height) > Math.abs(dy) * (a.width + b.width)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/** The point at `along` (px from the start of the side) on a side. */
function pointOn(rect: Rect, side: Side, along: number): Point {
  switch (side) {
    case 'left':
      return { x: rect.x, y: rect.y + along };
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + along };
    case 'top':
      return { x: rect.x + along, y: rect.y };
    case 'bottom':
      return { x: rect.x + along, y: rect.y + rect.height };
  }
}

interface End {
  readonly edgeId: string;
  readonly other: string;
  readonly side: Side;
  readonly key: string;
}

/** Where along one side each end goes: clusters by the other box, ordered by where that box lies, spread evenly. */
function spreadSide(ends: readonly End[], rect: Rect, boxes: ReadonlyMap<string, Rect>, along: Map<string, number>): boolean {
  const side = (ends[0] as End).side;
  const length = horizontal(side) ? rect.height : rect.width;
  const clusters = new Map<string, End[]>();
  for (const end of ends) {
    const cluster = clusters.get(end.other);
    if (cluster === undefined) clusters.set(end.other, [end]);
    else cluster.push(end);
  }
  const lie = (id: string): number => {
    const c = centreOf(boxes.get(id) as Rect);
    return horizontal(side) ? c.y : c.x;
  };
  const ordered = [...clusters.entries()].sort((a, b) => lie(a[0]) - lie(b[0]) || (a[0] < b[0] ? -1 : 1));
  const extents = ordered.map(([, members]) => (members.length - 1) * PORT_GAP);
  const total = extents.reduce((sum, e) => sum + e, 0);
  const usable = length - 2 * CORNER_CLEAR;
  const gap = (usable - total) / (ordered.length + 1);
  let cursor = CORNER_CLEAR + gap;
  if (gap < PORT_GAP) {
    // too many for PORT_GAP apart: the arrows share evenly spread slots, in their order, and stay on the side (B1)
    const flat = ordered.flatMap(([, members]) => [...members].sort((a, b) => (a.edgeId < b.edgeId ? -1 : 1)));
    const slots = shareSlots(length, flat.length);
    flat.forEach((end, i) => along.set(end.key, slots[i] as number));
    return flat.length > Math.floor(usable / PORT_GAP) + 1;
  }
  ordered.forEach(([, members], i) => {
    const sorted = [...members].sort((a, b) => (a.edgeId < b.edgeId ? -1 : 1));
    sorted.forEach((end, j) => along.set(end.key, cursor + j * PORT_GAP));
    cursor += (extents[i] as number) + gap;
  });
  return false;
}

export function assignPorts(edges: readonly LayoutEdgeInput[], boxes: ReadonlyMap<string, Rect>): PortAssignment {
  const sides = new Map<string, readonly [Side, Side]>();
  const groups = new Map<string, { readonly node: string; readonly ends: End[] }>();
  const add = (node: string, end: End): void => {
    const key = `${node}\u0000${end.side}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { node, ends: [end] });
    else group.ends.push(end);
  };
  for (const edge of edges) {
    const from = boxes.get(edge.from);
    const to = boxes.get(edge.to);
    if (edge.from === edge.to || from === undefined || to === undefined) continue;
    const out = sideFacing(from, to);
    sides.set(edge.id, [out, OPPOSITE[out]]);
    add(edge.from, { edgeId: edge.id, other: edge.to, side: out, key: `${edge.id}:start` });
    add(edge.to, { edgeId: edge.id, other: edge.from, side: OPPOSITE[out], key: `${edge.id}:end` });
  }
  const along = new Map<string, number>();
  let crowded = 0;
  for (const [, group] of [...groups].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (spreadSide(group.ends, boxes.get(group.node) as Rect, boxes, along)) crowded += 1;
  }
  const result = new Map<string, EdgeEnds>();
  for (const edge of edges) {
    const pair = sides.get(edge.id);
    if (pair === undefined) continue;
    const start = pointOn(boxes.get(edge.from) as Rect, pair[0], along.get(`${edge.id}:start`) as number);
    const end = pointOn(boxes.get(edge.to) as Rect, pair[1], along.get(`${edge.id}:end`) as number);
    result.set(edge.id, { start, end, pull: 1 });
  }
  // arrows between the same two boxes bow apart: each to the side where the middle of its own line lies from the middle of them all
  const byPair = new Map<string, LayoutEdgeInput[]>();
  for (const edge of edges) {
    if (!result.has(edge.id)) continue;
    const key = edge.from < edge.to ? `${edge.from}\u0000${edge.to}` : `${edge.to}\u0000${edge.from}`;
    const list = byPair.get(key);
    if (list === undefined) byPair.set(key, [edge]);
    else list.push(edge);
  }
  for (const list of byPair.values()) {
    if (list.length < 2) continue;
    const mids = list.map((edge) => {
      const e = result.get(edge.id) as EdgeEnds;
      return { x: (e.start.x + e.end.x) / 2, y: (e.start.y + e.end.y) / 2 };
    });
    const mean = { x: mids.reduce((s, p) => s + p.x, 0) / mids.length, y: mids.reduce((s, p) => s + p.y, 0) / mids.length };
    list.forEach((edge, i) => {
      const e = result.get(edge.id) as EdgeEnds;
      const length = Math.hypot(e.end.x - e.start.x, e.end.y - e.start.y);
      if (length === 0) return;
      const m = mids[i] as Point;
      const dot = ((m.x - mean.x) * -(e.end.y - e.start.y) + (m.y - mean.y) * (e.end.x - e.start.x)) / length;
      result.set(edge.id, { ...e, pull: dot > 1e-9 ? 1 : dot < -1e-9 ? -1 : i % 2 === 0 ? 1 : -1 });
    });
  }
  return { ends: result, crowded };
}
