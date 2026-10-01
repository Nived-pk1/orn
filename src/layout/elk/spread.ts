/**
 * Radial and stress layouts place node CENTRES by distance and ignore node sizes (measured on elkjs 0.12.0: boxes overlap as soon
 * as the nodes are wide compared with the ring radius or edge length). Step 4.4: when boxes overlap, the centres are scaled away
 * from the origin by the smallest factor that separates every pair by at least the node gap. Scaling keeps the arrangement (angles,
 * relative distances) and is a pure function of the positions. Every edge is then routed straight, since ELK's own routes belong
 * to the old positions; the caller says so in `notes`. A pair of centres that coincide cannot be separated by scaling, and a
 * factor over `MAX_SPREAD` is not a drawing: both throw, and the worker answers with the fallback layout.
 */
import type { Box } from '../geometry';

/** The largest scale factor accepted (a result needing more is an ELK failure, not a layout). */
export const MAX_SPREAD = 20;
/** Centres closer than this on both axes are the same spot (floating-point noise from ELK's angles); scaling cannot separate them. */
const COINCIDENT = 1e-3;

/** The factor (>= 1) that removes every overlap between `boxes` (keyed by id) when centres are scaled about the origin; 1 if none overlap. */
export function spreadFactor(boxes: ReadonlyMap<string, Box>, gap: number): number {
  const list = [...boxes.values()].map((box) => ({ cx: box.x + box.width / 2, cy: box.y + box.height / 2, hw: box.width / 2, hh: box.height / 2 }));
  let factor = 1;
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i] as (typeof list)[number];
    for (let j = i + 1; j < list.length; j += 1) {
      const b = list[j] as (typeof list)[number];
      const dx = Math.abs(a.cx - b.cx);
      const dy = Math.abs(a.cy - b.cy);
      const needX = a.hw + b.hw + gap;
      const needY = a.hh + b.hh + gap;
      if (dx >= needX || dy >= needY) continue; // already apart on one axis
      if (dx < COINCIDENT && dy < COINCIDENT) throw new Error('ELK placed two nodes on the same spot');
      factor = Math.max(factor, Math.min(dx === 0 ? Infinity : needX / dx, dy === 0 ? Infinity : needY / dy));
    }
  }
  if (!Number.isFinite(factor) || factor > MAX_SPREAD) throw new Error(`ELK's positions would need spreading by ${factor.toFixed(1)} times to separate the nodes`);
  return factor;
}

/** The boxes with their centres scaled about the origin by `factor`, shifted so the top-left of the drawing is back at (0, 0). */
export function spread(boxes: ReadonlyMap<string, Box>, factor: number): Map<string, Box> {
  const scaled = new Map<string, Box>();
  for (const [id, box] of boxes) scaled.set(id, { ...box, x: (box.x + box.width / 2) * factor - box.width / 2, y: (box.y + box.height / 2) * factor - box.height / 2 });
  let left = Infinity;
  let top = Infinity;
  for (const box of scaled.values()) {
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
  }
  if (scaled.size === 0) return scaled;
  const moved = new Map<string, Box>();
  for (const [id, box] of scaled) moved.set(id, { ...box, x: box.x - left + 0, y: box.y - top + 0 });
  return moved;
}
