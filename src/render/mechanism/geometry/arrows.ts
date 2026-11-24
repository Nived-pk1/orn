/**
 * Curved arrows of a mechanism step as PURE geometry (step 8.5, ADR-038 decision D3): no DOM, no chemistry beyond "what a site is".
 * Input: the electron movements of a step and, per atom-map number, the box of that atom in the drawing (centre and half sizes: a
 * plain carbon a small circle, a labelled atom its label's box) plus the bonded pairs, all in ONE frame (the before row's).
 * Output: per movement a quadratic curve (or, when its two ends are closer than `MIN_CHORD`, a fixed loop), its arrowhead and the
 * dots a lone pair or radical is drawn with. Deterministic: the same input gives the same numbers.
 *   start   atom: just outside it, towards the target. lone pair: at the two dots beside the atom, on the side away from its bonds
 *           (no bond to turn away from: facing the target). radical: at the single dot. bond: its midpoint.
 *   end     atom: just short of it. bond that exists: its midpoint. bond the movement FORMS (not bonded yet): the atom of it the movement
 *           does not start from, just short of it (a lone pair on O1 into the new bond O1-C2 ends ON C2, as a textbook draws it, not in
 *           the gap between them); when both atoms or neither are the source's, the midpoint between the two atoms.
 *           lone pair, radical: the dots, as at a start.
 *   curve   bulges AWAY from the centre of the sites involved by `BULGE_RATIO` of the chord, kept between `MIN_BULGE` and `MAX_BULGE`;
 *           an arrow whose control point is within `OVERLAP` of an earlier one is bent to the other side.
 *   head    two electrons a full head, one a fishhook (the outer wing only), along the curve's end tangent.
 * Labels (step 8.5c C1): with `ctx.glyphs` (the box of every label glyph of the before side, in the same frame) NO dot, anchor or curve sample sits over a
 * glyph: dots and ends turn to the nearest free direction, a bond anchor is the middle of its VISIBLE part, and a curve is bent to the side that crosses no
 * glyph (then a higher bulge, within `MAX_BULGE`); when every try crosses, the one that crosses least is kept and the arrow says how often (`crossings`).
 * A movement naming an atom the drawing does not have makes the whole answer `{ ok: false, missing }`: nothing partial is drawn.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface AtomBox extends Point {
  readonly rx: number;
  readonly ry: number;
}
export type SiteInput =
  | { readonly kind: 'atom' | 'lone_pair' | 'radical'; readonly atom: number }
  | { readonly kind: 'bond'; readonly atoms: readonly [number, number] };
export interface MovementInput {
  readonly from: SiteInput;
  readonly to: SiteInput;
  readonly electrons: 1 | 2;
}
/** The box of one label glyph (a letter, a hydrogen count, a charge sign), in the frame of the atoms. */
export interface GlyphBox {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}
export interface ArrowContext {
  readonly atoms: ReadonlyMap<number, AtomBox>;
  readonly bonds: readonly (readonly [number, number])[];
  /** Every label glyph of the before side; absent: no label is avoided. */
  readonly glyphs?: readonly GlyphBox[];
}
export interface ArrowHead {
  readonly tip: Point;
  /** Radians, the direction the curve is travelling at its end. */
  readonly angle: number;
  readonly full: boolean;
  /** The ends of the head's strokes (two for a full head, the outer one for a fishhook). */
  readonly wings: readonly Point[];
}
export interface CurvedArrow {
  readonly kind: 'curve' | 'loop';
  readonly start: Point;
  readonly end: Point;
  /** The quadratic's control point; for a loop, the second control point of its cubic. */
  readonly control: Point;
  /** The SVG path data. */
  readonly path: string;
  readonly head: ArrowHead;
  /** The lone-pair dots (two) or radical dot (one) the arrow starts from or ends at, drawn with it. */
  readonly dots: readonly Point[];
  /** Samples of the path that still lie over a label glyph after every try; present only when above 0 (the arrow says so, nothing silent). */
  readonly crossings?: number;
}
export type ArrowsOutcome =
  | { readonly ok: true; readonly arrows: readonly CurvedArrow[] }
  | { readonly ok: false; readonly missing: readonly number[]; readonly tooMany?: true };

/** More movements than the schema allows are refused, never cut. */
export const MAX_ARROWS = 64;
export const MIN_BULGE = 10;
export const MAX_BULGE = 30;
export const MIN_CHORD = 6;
const BULGE_RATIO = 0.3;
const GAP = 3;
const DOT_OFFSET = 7;
const DOT_SPACING = 4;
const OVERLAP = 16;
const LOOP = 14;
const HEAD_LENGTH = 8;
const HEAD_SPREAD = 0.45;

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point, k = 1): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const length = (a: Point): number => Math.hypot(a.x, a.y);
const unit = (a: Point, fallback: Point): Point => {
  const n = length(a);
  return n < 1e-9 ? fallback : { x: a.x / n, y: a.y / n };
};
const r2 = (value: number): number => Math.round(value * 100) / 100;
const fmt = (p: Point): string => `${r2(p.x)} ${r2(p.y)}`;

/** The radius of a dot as drawn, and the air kept between a dot, an end or a curve and a glyph. */
const DOT_RADIUS = 1.9;
const AIR = 0.6;
const SAMPLES = 40;
/** The turns tried, in order, when the preferred direction is over a glyph (radians: nearest to the preferred first, one way then the other). */
const TURNS = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8, 2.25, -2.25, 2.7, -2.7, Math.PI];
/** A dot or end must stay this far (radians) from the direction of a bond of its atom. */
const BOND_CLEAR = 0.6;

const over = (glyphs: readonly GlyphBox[] | undefined, p: Point, pad: number): boolean => glyphs !== undefined && glyphs.some((g) => p.x > g.x0 - pad && p.x < g.x1 + pad && p.y > g.y0 - pad && p.y < g.y1 + pad);
const turn = (d: Point, angle: number): Point => ({ x: d.x * Math.cos(angle) - d.y * Math.sin(angle), y: d.x * Math.sin(angle) + d.y * Math.cos(angle) });

/** How far the edge of the atom's box is from its centre in the direction `dir` (an ellipse). */
function radius(box: AtomBox, dir: Point): number {
  const rx = Math.max(box.rx, 1);
  const ry = Math.max(box.ry, 1);
  return 1 / Math.sqrt((dir.x / rx) ** 2 + (dir.y / ry) ** 2);
}

const atomsOf = (site: SiteInput): readonly number[] => (site.kind === 'bond' ? site.atoms : [site.atom]);

/** The middle of the part of the line a-b that no label glyph covers (a bond is drawn shortened at a label); undefined when nothing of it is free. */
function visibleMiddle(a: AtomBox, b: AtomBox, glyphs: readonly GlyphBox[]): Point | undefined {
  const run = length(sub(b, a));
  if (run < 1) return undefined;
  const at = (d: number): Point => ({ x: a.x + ((b.x - a.x) * d) / run, y: a.y + ((b.y - a.y) * d) / run });
  let start = 0;
  while (start < run && over(glyphs, at(start), 1.5)) start += 1;
  let end = run;
  while (end > start && over(glyphs, at(end), 1.5)) end -= 1;
  return end - start < 2 ? undefined : at((start + end) / 2);
}

/** The place a site is at before any anchoring: the atom's centre, a bond's midpoint. */
function coarse(site: SiteInput, ctx: ArrowContext): Point {
  if (site.kind === 'bond' && ctx.glyphs !== undefined && site.atoms[0] !== site.atoms[1]) {
    const visible = visibleMiddle(ctx.atoms.get(site.atoms[0]) as AtomBox, ctx.atoms.get(site.atoms[1]) as AtomBox, ctx.glyphs);
    if (visible !== undefined) return visible;
  }
  const boxes = atomsOf(site).map((id) => ctx.atoms.get(id) as AtomBox);
  return { x: boxes.reduce((s, b) => s + b.x, 0) / boxes.length, y: boxes.reduce((s, b) => s + b.y, 0) / boxes.length };
}

/** The direction from an atom that its bonds do not occupy; `fallback` when it has none (or they cancel). */
function awayFromBonds(id: number, ctx: ArrowContext, fallback: Point): Point {
  const here = ctx.atoms.get(id) as AtomBox;
  let sum: Point = { x: 0, y: 0 };
  for (const [a, b] of ctx.bonds) {
    const other = a === id ? b : b === id ? a : undefined;
    const box = other === undefined || other === id ? undefined : ctx.atoms.get(other);
    if (box !== undefined) sum = add(sum, unit(sub(box, here), { x: 0, y: 0 }));
  }
  return length(sum) < 0.15 ? fallback : unit({ x: -sum.x, y: -sum.y }, fallback);
}

interface Anchored {
  readonly anchor: Point;
  readonly dots: readonly Point[];
}

/** The directions of the bonds of an atom (unit vectors); a turned dot or end keeps away from them. */
function bondDirections(id: number, ctx: ArrowContext): Point[] {
  const here = ctx.atoms.get(id) as AtomBox;
  const out: Point[] = [];
  for (const [p, q] of ctx.bonds) {
    const other = p === id ? q : q === id ? p : undefined;
    const box = other === undefined || other === id ? undefined : ctx.atoms.get(other);
    if (box !== undefined) out.push(unit(sub(box, here), { x: 0, y: 0 }));
  }
  return out;
}

/** The first direction of `TURNS` from `preferred` at which `clear` holds and no bond is near; `preferred` itself when no glyph list is given or none is free. */
function freeDirection(preferred: Point, id: number, ctx: ArrowContext, clear: (dir: Point) => boolean): Point {
  if (ctx.glyphs === undefined || ctx.glyphs.length === 0) return preferred;
  const bonds = bondDirections(id, ctx);
  for (const angle of TURNS) {
    const dir = turn(preferred, angle);
    if (bonds.some((d) => length(d) > 0 && Math.acos(Math.max(-1, Math.min(1, d.x * dir.x + d.y * dir.y))) < BOND_CLEAR)) continue;
    if (clear(dir)) return dir;
  }
  return preferred;
}

function anchor(site: SiteInput, toward: Point, ctx: ArrowContext): Anchored {
  if (site.kind === 'bond') return { anchor: coarse(site, ctx), dots: [] };
  const box = ctx.atoms.get(site.atom) as AtomBox;
  const toTarget = unit(sub(toward, box), { x: 1, y: 0 });
  if (site.kind === 'atom') {
    const dir = freeDirection(toTarget, site.atom, ctx, (d) => !over(ctx.glyphs, add(box, d, radius(box, d) + GAP), AIR));
    return { anchor: add(box, dir, radius(box, dir) + GAP), dots: [] };
  }
  const place = (dir: Point): { readonly base: Point; readonly dots: readonly Point[] } => {
    const base = add(box, dir, radius(box, dir) + DOT_OFFSET);
    const across = { x: -dir.y, y: dir.x };
    return { base, dots: site.kind === 'lone_pair' ? [add(base, across, -DOT_SPACING / 2), add(base, across, DOT_SPACING / 2)] : [base] };
  };
  const free = (dir: Point): boolean => {
    const { base, dots } = place(dir);
    return !over(ctx.glyphs, add(base, dir, GAP), AIR) && !dots.some((d) => over(ctx.glyphs, d, DOT_RADIUS + AIR));
  };
  const dir = freeDirection(awayFromBonds(site.atom, ctx, toTarget), site.atom, ctx, free);
  const { base, dots } = place(dir);
  return { anchor: add(base, dir, GAP), dots };
}

function head(tip: Point, angle: number, electrons: 1 | 2, side: number): ArrowHead {
  const wing = (spread: number): Point => ({ x: tip.x - HEAD_LENGTH * Math.cos(angle + spread), y: tip.y - HEAD_LENGTH * Math.sin(angle + spread) });
  return { tip, angle, full: electrons === 2, wings: electrons === 2 ? [wing(HEAD_SPREAD), wing(-HEAD_SPREAD)] : [wing(-side * HEAD_SPREAD)] };
}

/** The site an arrow ENDS at: a target bond that is not bonded yet ends on the one atom of it the source does not start from. */
function endSite(movement: MovementInput, ctx: ArrowContext): SiteInput {
  const to = movement.to;
  if (to.kind !== 'bond') return to;
  const [p, q] = to.atoms;
  if (ctx.bonds.some(([a, b]) => (a === p && b === q) || (a === q && b === p))) return to;
  const source = atomsOf(movement.from);
  const others = [p, q].filter((id) => !source.includes(id));
  return others.length === 1 ? { kind: 'atom', atom: others[0] as number } : to;
}

/** How many of `SAMPLES + 1` points along the quadratic lie over a label glyph. */
function crossingsOf(a: Point, control: Point, b: Point, glyphs: readonly GlyphBox[] | undefined): number {
  if (glyphs === undefined || glyphs.length === 0) return 0;
  let count = 0;
  for (let k = 0; k <= SAMPLES; k += 1) {
    const t = k / SAMPLES;
    const u = 1 - t;
    if (over(glyphs, { x: u * u * a.x + 2 * u * t * control.x + t * t * b.x, y: u * u * a.y + 2 * u * t * control.y + t * t * b.y }, AIR)) count += 1;
  }
  return count;
}

export function layoutArrows(movements: readonly MovementInput[], ctx: ArrowContext): ArrowsOutcome {
  if (movements.length > MAX_ARROWS) return { ok: false, missing: [], tooMany: true };
  const missing = [...new Set(movements.flatMap((m) => [...atomsOf(m.from), ...atomsOf(m.to)]).filter((id) => !ctx.atoms.has(id)))].sort((a, b) => a - b);
  if (missing.length > 0) return { ok: false, missing };
  const ends = movements.map((m) => endSite(m, ctx));
  const sites = movements.flatMap((m, k) => [coarse(m.from, ctx), coarse(ends[k] as SiteInput, ctx)]);
  const centre: Point = sites.length === 0 ? { x: 0, y: 0 } : { x: sites.reduce((s, p) => s + p.x, 0) / sites.length, y: sites.reduce((s, p) => s + p.y, 0) / sites.length };
  const arrows: CurvedArrow[] = [];
  for (const [k, movement] of movements.entries()) {
    const target = ends[k] as SiteInput;
    const from = anchor(movement.from, coarse(target, ctx), ctx);
    const to = anchor(target, coarse(movement.from, ctx), ctx);
    const dots = [...from.dots, ...to.dots];
    const chord = sub(to.anchor, from.anchor);
    if (length(chord) < MIN_CHORD) {
      const p0 = from.anchor;
      const p3 = to.anchor;
      const c1: Point = { x: p0.x - LOOP, y: p0.y - 2 * LOOP };
      const c2: Point = { x: p3.x + LOOP, y: p3.y - 2 * LOOP };
      const angle = Math.atan2(p3.y - c2.y, p3.x - c2.x);
      arrows.push({ kind: 'loop', start: p0, end: p3, control: c2, path: `M ${fmt(p0)} C ${fmt(c1)} ${fmt(c2)} ${fmt(p3)}`, head: head(p3, angle, movement.electrons, 1), dots });
      continue;
    }
    const mid: Point = { x: (from.anchor.x + to.anchor.x) / 2, y: (from.anchor.y + to.anchor.y) / 2 };
    const along = unit(chord, { x: 1, y: 0 });
    const normal: Point = { x: -along.y, y: along.x };
    const outward = (mid.x - centre.x) * normal.x + (mid.y - centre.y) * normal.y;
    let side = outward < 0 ? -1 : 1;
    const bulge = Math.min(MAX_BULGE, Math.max(MIN_BULGE, length(chord) * BULGE_RATIO));
    const controlAt = (s: number, k: number): Point => add(mid, normal, 2 * k * s);
    if (arrows.some((earlier) => earlier.kind === 'curve' && length(sub(earlier.control, controlAt(side, bulge))) < OVERLAP)) side = -side;
    // the side and bulge that cross no label glyph: the preferred side, the other side, then higher bulges on each, within MAX_BULGE
    let chosen = { side, bulge, crossings: crossingsOf(from.anchor, controlAt(side, bulge), to.anchor, ctx.glyphs) };
    if (chosen.crossings > 0) {
      const raised = [bulge, ...[1, 2, 3].map((k) => bulge + ((MAX_BULGE - bulge) * k) / 3)];
      search: for (const k of raised) {
        for (const s of [side, -side]) {
          const found = crossingsOf(from.anchor, controlAt(s, k), to.anchor, ctx.glyphs);
          if (found < chosen.crossings) chosen = { side: s, bulge: k, crossings: found };
          if (chosen.crossings === 0) break search;
        }
      }
    }
    const control = controlAt(chosen.side, chosen.bulge);
    const angle = Math.atan2(to.anchor.y - control.y, to.anchor.x - control.x);
    arrows.push({ kind: 'curve', start: from.anchor, end: to.anchor, control, path: `M ${fmt(from.anchor)} Q ${fmt(control)} ${fmt(to.anchor)}`, head: head(to.anchor, angle, movement.electrons, chosen.side), dots, ...(chosen.crossings > 0 ? { crossings: chosen.crossings } : {}) });
  }
  return { ok: true, arrows };
}
