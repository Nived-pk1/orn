/**
 * The path of a curved arrow that keeps off the drawing (step 8.5h A4, ADR-038 addendum 2), pure and deterministic. Given the places the
 * arrow may start and end at, it tries each with every bulge side, height and lean, and takes the FIRST curve that crosses no bond line and
 * no label box outside the zone of `ARROW_ZONE` units at its own tail and head and whose head lies in no label. When none is clean, the one
 * that crosses least is taken and says how often (nothing silent). Bounded: at most `MAX_TRIES` curves per arrow.
 */
import { add, length, sub, unit, type Point } from './vector';

/** Inside this distance of its own start or end an arrow may touch what it starts or ends on (drawing units; a bond is 54). */
export const ARROW_ZONE = 11;
/** How close to a bond line the rest of an arrow may not come. */
const NEAR = 2;
const SAMPLES = 128;
const HEAD_IN_LABEL = 1000;
/** The air the tip of a head keeps to a label: its stroke is 2 units wide, so less than this reads as touching. */
const TIP_AIR = 1.8;
/** A head that points at an atom should not rest on one of its bonds: the tip this near a stroke is not clean. */
const TIP_ON_BOND = 3;
const ON_BOND_COST = 2;
const NEAR_AN_EARLIER_ARROW = 3;
export const MAX_TRIES = 3000;
/** The highest bulge of a curve that has to go round something. */
const ROUND_BULGE = 44;
const LEANS = [0, 0.3, -0.3];
/** The second pass, run only when the first finds nothing clean: heads pulled back past a wide label, and flatter curves too (a narrow way in between two bonds). */
const FLAT_BULGES = [6, 10, 3];
/** A charge sign (a stroke at most this thick) may not be cut even next to the arrow's own tail, beyond this distance of it. */
const SIGN = 3;
const SIGN_FROM = 4;
const SIGN_HIT = 5;

/** One straight stroke of a drawn bond. */
export interface Line {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}
export interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}
/** A place an arrow may start or end at, with the dots drawn there. */
export interface Anchored {
  readonly anchor: Point;
  readonly dots: readonly Point[];
  /** A head that points at an atom (not at the middle of a bond). */
  readonly atom?: boolean;
  /** A head pulled back to clear a label wider than its atom: tried only in the second pass. */
  readonly back?: boolean;
}
export interface RouteInput {
  readonly tails: readonly Anchored[];
  /** The places the head may go when the arrow starts at this tail. */
  readonly heads: (tail: Point) => readonly Anchored[];
  readonly lines: readonly Line[];
  readonly glyphs: readonly Box[];
  /** The bulge a free arrow of this chord has. */
  readonly bulge: (chord: number) => number;
  /** The ends of the head's strokes. */
  readonly wings: (tip: Point, angle: number, side: number) => readonly Point[];
  /** Control points of the arrows already placed, and how near is too near. */
  readonly earlier: readonly Point[];
  readonly overlap: number;
}
export interface Route {
  readonly from: Anchored;
  readonly to: Anchored;
  readonly control: Point;
  readonly side: number;
  readonly crossings: number;
}

const inside = (p: Point, g: Box, pad: number): boolean => p.x > g.x0 - pad && p.x < g.x1 + pad && p.y > g.y0 - pad && p.y < g.y1 + pad;
function toLine(p: Point, l: Line): number {
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - l.x1) * dx + (p.y - l.y1) * dy) / len));
  return Math.hypot(p.x - l.x1 - t * dx, p.y - l.y1 - t * dy);
}

/** How many samples of the quadratic, outside its end zones, lie on a bond line or in a label. */
export function overrun(a: Point, control: Point, b: Point, lines: readonly Line[], glyphs: readonly Box[], limit = Infinity): number {
  const x0 = Math.min(a.x, b.x, control.x) - NEAR;
  const x1 = Math.max(a.x, b.x, control.x) + NEAR;
  const y0 = Math.min(a.y, b.y, control.y) - NEAR;
  const y1 = Math.max(a.y, b.y, control.y) + NEAR;
  const near = lines.filter((l) => Math.max(l.x1, l.x2) >= x0 && Math.min(l.x1, l.x2) <= x1 && Math.max(l.y1, l.y2) >= y0 && Math.min(l.y1, l.y2) <= y1);
  const labels = glyphs.filter((g) => g.x1 >= x0 && g.x0 <= x1 && g.y1 >= y0 && g.y0 <= y1);
  let count = 0;
  for (let k = 0; k <= SAMPLES && count <= limit; k += 1) { // past `limit` the curve has already lost: counting stops
    const t = k / SAMPLES;
    const u = 1 - t;
    const p = { x: u * u * a.x + 2 * u * t * control.x + t * t * b.x, y: u * u * a.y + 2 * u * t * control.y + t * t * b.y };
    if (Math.hypot(p.x - a.x, p.y - a.y) <= ARROW_ZONE || Math.hypot(p.x - b.x, p.y - b.y) <= ARROW_ZONE) continue;
    if (near.some((l) => toLine(p, l) < NEAR) || labels.some((g) => inside(p, g, 1.2))) count += 1;
  }
  return count;
}

/** Whether the stroke cuts a charge sign once it has left its own lone pair. */
function cutsSign(a: Point, control: Point, b: Point, signs: readonly Box[]): boolean {
  for (let k = 0; signs.length > 0 && k <= SAMPLES; k += 1) {
    const t = k / SAMPLES;
    const u = 1 - t;
    const p = { x: u * u * a.x + 2 * u * t * control.x + t * t * b.x, y: u * u * a.y + 2 * u * t * control.y + t * t * b.y };
    if (Math.hypot(p.x - a.x, p.y - a.y) > SIGN_FROM && signs.some((g) => inside(p, g, 1.2))) return true;
  }
  return false;
}

/** The side of the chord (+1 or -1 along its normal) that points away from the drawing near it. */
function awayFromDrawing(mid: Point, normal: Point, lines: readonly Line[]): number {
  let sum = 0;
  for (const l of lines) {
    const p = { x: (l.x1 + l.x2) / 2 - mid.x, y: (l.y1 + l.y2) / 2 - mid.y };
    if (length(p) < 90) sum += p.x * normal.x + p.y * normal.y;
  }
  return sum > 0 ? -1 : 1;
}

export function routeArrow(input: RouteInput): Route | undefined {
  let best: (Route & { readonly cost: number }) | undefined;
  let tries = 0;
  const signs = input.glyphs.filter((g) => g.y1 - g.y0 <= SIGN);
  for (const flat of [false, true]) for (const from of input.tails) {
    for (const to of input.heads(from.anchor)) {
      const chord = sub(to.anchor, from.anchor);
      const span = length(chord);
      if (span < 1 || (to.back === true && !flat)) continue;
      const along = unit(chord, { x: 1, y: 0 });
      const normal = { x: -along.y, y: along.x };
      const mid = { x: (from.anchor.x + to.anchor.x) / 2, y: (from.anchor.y + to.anchor.y) / 2 };
      const preferred = awayFromDrawing(mid, normal, input.lines);
      const free = input.bulge(span);
      const usual = [free, (free + ROUND_BULGE) / 2, ROUND_BULGE];
      for (const height of flat ? [...usual, ...FLAT_BULGES] : usual) {
        for (const lean of LEANS) {
          for (const side of [preferred, -preferred]) {
            if (tries >= MAX_TRIES) return best;
            tries += 1;
            const control = add(add(mid, normal, 2 * height * side), along, lean * span);
            const crossings = overrun(from.anchor, control, to.anchor, input.lines, input.glyphs, best?.cost);
            const angle = Math.atan2(to.anchor.y - control.y, to.anchor.x - control.x);
            const headHit = input.glyphs.some((g) => inside(to.anchor, g, TIP_AIR)) || input.wings(to.anchor, angle, side).some((p) => input.glyphs.some((g) => inside(p, g, 0.3)));
            const crowded = input.earlier.some((c) => length(sub(c, control)) < input.overlap);
            const cost = crossings + (headHit ? HEAD_IN_LABEL : 0) + (crowded ? NEAR_AN_EARLIER_ARROW : 0) + (cutsSign(from.anchor, control, to.anchor, signs) ? SIGN_HIT : 0) + (to.atom === true && input.lines.some((l) => toLine(to.anchor, l) < TIP_ON_BOND) ? ON_BOND_COST : 0);
            if (best === undefined || cost < best.cost) best = { from, to, control, side, crossings, cost };
            if (cost === 0) return best;
          }
        }
      }
    }
  }
  return best;
}
