/**
 * How each species of a step is shown (step 8.5g, ADR-038 addendum "Placement"), pure and deterministic: turned, mirrored (never one
 * with stereo) and, on the before side, reordered, so that the curved arrows are short, cross no other species and, into an atom that
 * also loses a bond, come from the far side of that bond. Products are then turned so their mapped atoms lie as they did before.
 * Display only: atoms, bonds and the arrows' start and end atoms never change.
 *   turn code  0..23: (code % 12) x 30 degrees clockwise on screen; 12 and up mirrored left to right first.
 *   search     greedy, one species at a time, the widest first: every turn x every order of the side (orders only up to `MAX_ORDERED`
 *              species), so at most 24 x 24 tries per species; an equal score keeps the earlier choice.
 * The tries are scored on a PREDICTED turn of each drawing (centres turned about the picture); the picture shown is drawn again by the
 * structure tool and the arrows are computed from that.
 */
import type { CurvedArrow, MovementInput, Point } from './arrows';
import { composeStep, type DrawnSpecies } from './compose';

export const TURN_CODES = 24;
export const MAX_ORDERED = 4;

/** Score units are drawing units of arrow length. */
const CROSSING = 1000;
const PER_DEGREE_OFF_BACKSIDE = 2;
const PER_TURN_STEP = 2;
const MIRRORED = 4;
const PER_SWAPPED_PAIR = 40;
const SAMPLES = 16;

export interface PlanSpecies {
  readonly drawn: DrawnSpecies;
  readonly canTurn: boolean;
  readonly canMirror: boolean;
}
export interface Choice {
  /** Index in the side as given. */
  readonly index: number;
  readonly turn: number;
}
export interface StepPlan {
  readonly before: readonly Choice[];
  readonly after: readonly Choice[];
  readonly tries: number;
}

export function turnDrawn(drawn: DrawnSpecies, code: number): DrawnSpecies {
  if (code === 0) return drawn;
  const angle = ((code % 12) * Math.PI) / 6;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const width = Math.abs(drawn.width * cos) + Math.abs(drawn.height * sin);
  const height = Math.abs(drawn.width * sin) + Math.abs(drawn.height * cos);
  const move = (x: number, y: number): Point => {
    const dx = (code >= 12 ? drawn.width - x : x) - drawn.width / 2;
    const dy = y - drawn.height / 2;
    return { x: dx * cos - dy * sin + width / 2, y: dx * sin + dy * cos + height / 2 };
  };
  const glyphs = drawn.glyphs?.map((g) => {
    const c = move((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2);
    const [rx, ry] = [(g.x1 - g.x0) / 2, (g.y1 - g.y0) / 2];
    return { x0: c.x - rx, x1: c.x + rx, y0: c.y - ry, y1: c.y + ry };
  });
  return { ...drawn, width, height, atoms: drawn.atoms.map((a) => ({ ...a, ...move(a.x, a.y) })), ...(glyphs === undefined ? {} : { glyphs }) };
}

const codesOf = (s: PlanSpecies): number[] => Array.from({ length: !s.canTurn ? 1 : s.canMirror ? TURN_CODES : 12 }, (_, k) => k);
const turnCost = (code: number): number => PER_TURN_STEP * Math.min(code % 12, 12 - (code % 12)) + (code >= 12 ? MIRRORED : 0);
const atomsOf = (site: MovementInput['from']): readonly number[] => (site.kind === 'bond' ? site.atoms : [site.atom]);

/** Every order of 0..n-1, the given one first. */
function ordersOf(n: number): number[][] {
  const all = (rest: number[]): number[][] => (rest.length === 0 ? [[]] : rest.flatMap((head) => all(rest.filter((k) => k !== head)).map((tail) => [head, ...tail])));
  const given = Array.from({ length: n }, (_, k) => k);
  return n > MAX_ORDERED ? [given] : all(given);
}
const swappedPairs = (order: readonly number[]): number => order.reduce((sum, a, k) => sum + order.slice(k + 1).filter((b) => b < a).length, 0);

function pointAt(arrow: CurvedArrow, t: number): Point {
  const u = 1 - t;
  return { x: u * u * arrow.start.x + 2 * u * t * arrow.control.x + t * t * arrow.end.x, y: u * u * arrow.start.y + 2 * u * t * arrow.control.y + t * t * arrow.end.y };
}

/** The atom an arrow comes INTO: an atom or lone pair target, or the one atom of a new bond the electrons do not come from. */
function targetAtom(m: MovementInput, bonded: ReadonlySet<string>): number | undefined {
  if (m.to.kind !== 'bond') return m.to.atom;
  const [p, q] = m.to.atoms;
  if (bonded.has(`${p}-${q}`) || bonded.has(`${q}-${p}`)) return undefined;
  const from = atomsOf(m.from);
  const others = [p, q].filter((id) => !from.includes(id));
  return others.length === 1 ? others[0] : undefined;
}

/** The score of a before side laid out in this order with these turns; lower is better, Infinity when an arrow has no place. */
function score(side: readonly DrawnSpecies[], movements: readonly MovementInput[]): number {
  const out = composeStep({ before: side, after: [], orientation: 'row', reversible: false, movements });
  if (!out.ok) return Number.POSITIVE_INFINITY;
  const holder = new Map<number, number>();
  const at = new Map<number, Point>();
  const bonded = new Set<string>();
  side.forEach((s, k) => {
    const item = out.items[k] as Point;
    for (const a of s.atoms) {
      holder.set(a.map, k);
      at.set(a.map, { x: a.x + item.x, y: a.y + item.y });
    }
    for (const b of s.bonds) bonded.add(`${b.a}-${b.b}`);
  });
  let total = 0;
  movements.forEach((m, k) => {
    const arrow = out.arrows[k] as CurvedArrow;
    const own = new Set([...atomsOf(m.from), ...atomsOf(m.to)].map((id) => holder.get(id)));
    const points = Array.from({ length: SAMPLES + 1 }, (_, i) => pointAt(arrow, i / SAMPLES));
    points.forEach((p, i) => {
      const was = points[i - 1];
      if (was !== undefined) total += Math.hypot(p.x - was.x, p.y - was.y);
    });
    out.items.forEach((item, i) => {
      if (!own.has(i) && points.some((p) => p.x > item.x && p.x < item.x + item.width && p.y > item.y && p.y < item.y + item.height)) total += CROSSING;
    });
    const target = targetAtom(m, bonded);
    if (target === undefined) return;
    const losing = movements.find((other) => other !== m && other.from.kind === 'bond' && other.from.atoms.includes(target));
    const partner = losing?.from.kind === 'bond' ? losing.from.atoms.find((id) => id !== target) : undefined;
    const centre = at.get(target);
    const leaving = partner === undefined ? undefined : at.get(partner);
    if (centre === undefined || leaving === undefined) return;
    const u = Math.atan2(arrow.start.y - centre.y, arrow.start.x - centre.x);
    const v = Math.atan2(leaving.y - centre.y, leaving.x - centre.x);
    const degrees = (Math.abs(Math.atan2(Math.sin(u - v), Math.cos(u - v))) * 180) / Math.PI;
    total += (180 - degrees) * PER_DEGREE_OFF_BACKSIDE;
  });
  return total;
}

function planBefore(species: readonly PlanSpecies[], movements: readonly MovementInput[]): { readonly choices: readonly Choice[]; readonly tries: number } {
  let order = species.map((_, k) => k);
  const turns = species.map(() => 0);
  let tries = 0;
  if (movements.length > 0) {
    const orders = ordersOf(species.length);
    const total = (o: readonly number[], t: readonly number[]): number =>
      score(o.map((k) => turnDrawn((species[k] as PlanSpecies).drawn, t[k] as number)), movements) + PER_SWAPPED_PAIR * swappedPairs(o) + t.reduce((sum, code) => sum + turnCost(code), 0);
    let best = total(order, turns);
    // the widest first: a large molecule turns to face a small one before the small one is moved to the other side of it
    const sequence = species.map((_, k) => k).sort((a, b) => (species[b] as PlanSpecies).drawn.width - (species[a] as PlanSpecies).drawn.width || a - b);
    for (const k of sequence) {
      for (const candidate of orders) {
        for (const code of codesOf(species[k] as PlanSpecies)) {
          const next = turns.map((was, i) => (i === k ? code : was));
          const value = total(candidate, next);
          tries += 1;
          if (value < best - 1e-6) {
            best = value;
            order = candidate;
            turns[k] = code;
          }
        }
      }
    }
  }
  return { choices: order.map((index) => ({ index, turn: turns[index] as number })), tries };
}

/** The turn that brings the product's mapped atoms closest to where they were, both taken about their own centres. */
function align(species: PlanSpecies, was: ReadonlyMap<number, Point>): { readonly turn: number; readonly tries: number } {
  const maps = species.drawn.atoms.map((a) => a.map).filter((map) => was.has(map));
  if (maps.length < 2) return { turn: 0, tries: 0 };
  const centred = (points: readonly Point[]): Point[] => {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    return points.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  };
  const target = centred(maps.map((map) => was.get(map) as Point));
  let turn = 0;
  let best = Number.POSITIVE_INFINITY;
  const codes = codesOf(species);
  for (const code of codes) {
    const atoms = turnDrawn(species.drawn, code).atoms;
    const now = centred(maps.map((map) => atoms.find((a) => a.map === map) as Point));
    const value = now.reduce((sum, p, i) => sum + (p.x - (target[i] as Point).x) ** 2 + (p.y - (target[i] as Point).y) ** 2, 0) + turnCost(code);
    if (value < best - 1e-6) {
      best = value;
      turn = code;
    }
  }
  return { turn, tries: codes.length };
}

export function planStep(input: { readonly before: readonly PlanSpecies[]; readonly after: readonly PlanSpecies[]; readonly movements: readonly MovementInput[] }): StepPlan {
  const planned = planBefore(input.before, input.movements);
  const shown = planned.choices.map((c) => turnDrawn((input.before[c.index] as PlanSpecies).drawn, c.turn));
  const out = composeStep({ before: shown, after: [], orientation: 'row', reversible: false, movements: [] });
  const was = new Map<number, Point>();
  if (out.ok) {
    shown.forEach((s, k) => {
      const item = out.items[k] as Point;
      for (const a of s.atoms) was.set(a.map, { x: a.x + item.x, y: a.y + item.y });
    });
  }
  let tries = planned.tries;
  const after = input.after.map((s, index): Choice => {
    const found = align(s, was);
    tries += found.tries;
    return { index, turn: found.turn };
  });
  return { before: planned.choices, after, tries };
}
