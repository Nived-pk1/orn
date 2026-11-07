/**
 * Chips placed in SCREEN pixels (step 8.4b, A). A chip is `width` x 20 on the screen at any zoom, so in map units it is that over the zoom.
 * It starts at a fraction of its line and slides along it to the first place that touches no box and no chip placed before it (and keeps
 * CHIP_GAP_PX from them). No free place: no chip (its words stay in the arrow's name). Pure and deterministic.
 */
import type { Point } from '@/layout/contracts';

/** Chip height on the screen (px): a circle of at least this across. */
export const CHIP_SCREEN_HEIGHT = 20;
/** Air kept between two chips (px on the screen). */
export const CHIP_GAP_PX = 8;
/** Air kept between a chip and a box (px on the screen). */
export const BOX_GAP_PX = 2;
/** Offsets from the starting fraction, tried in this order. */
const SLIDES: readonly number[] = [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3, -0.4, 0.4];
const EDGE_FRACTION = 0.06;

export interface ChipRequest {
  readonly key: string;
  readonly route: readonly Point[];
  /** Screen width in px. */
  readonly width: number;
  /** Where on the line the chip would like to be (0 to 1). */
  readonly start: number;
}

export interface BoxRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

const hits = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function pointOnRoute(route: readonly Point[], fraction: number): Point {
  const first = route[0];
  if (first === undefined) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 1; i < route.length; i += 1) total += Math.hypot((route[i] as Point).x - (route[i - 1] as Point).x, (route[i] as Point).y - (route[i - 1] as Point).y);
  if (total === 0) return first;
  let want = Math.min(1, Math.max(0, fraction)) * total;
  for (let i = 1; i < route.length; i += 1) {
    const a = route[i - 1] as Point;
    const b = route[i] as Point;
    const step = Math.hypot(b.x - a.x, b.y - a.y);
    if (want <= step && step > 0) return { x: a.x + ((b.x - a.x) * want) / step, y: a.y + ((b.y - a.y) * want) / step };
    want -= step;
  }
  return route[route.length - 1] as Point;
}

/** The places chosen, by key, as chip CENTRES in map units. A key that is missing is not drawn. */
export function placeChipsAtZoom(requests: readonly ChipRequest[], boxes: readonly BoxRect[], zoom: number): Map<string, Point> {
  const k = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  const solid: Rect[] = boxes.map((b) => ({ x0: b.x - BOX_GAP_PX / k, y0: b.y - BOX_GAP_PX / k, x1: b.x + b.width + BOX_GAP_PX / k, y1: b.y + b.height + BOX_GAP_PX / k }));
  const placed: Rect[] = [];
  const out = new Map<string, Point>();
  for (const request of requests) {
    const halfW = request.width / 2 / k;
    const halfH = CHIP_SCREEN_HEIGHT / 2 / k;
    const gap = CHIP_GAP_PX / 2 / k; // each of two chips keeps half the gap
    for (const slide of SLIDES) {
      const fraction = Math.min(1 - EDGE_FRACTION, Math.max(EDGE_FRACTION, request.start + slide));
      const at = pointOnRoute(request.route, fraction);
      const own: Rect = { x0: at.x - halfW, y0: at.y - halfH, x1: at.x + halfW, y1: at.y + halfH };
      const padded: Rect = { x0: own.x0 - gap, y0: own.y0 - gap, x1: own.x1 + gap, y1: own.y1 + gap };
      if (solid.some((rect) => hits(own, rect)) || placed.some((rect) => hits(padded, rect))) continue;
      placed.push(padded);
      out.set(request.key, at);
      break;
    }
  }
  return out;
}
