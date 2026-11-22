/**
 * The placement of a mechanism step's species in "before -> after" (step 8.5, ADR-038 decisions D2, D3 and D5), pure. The species of each
 * side are laid in a row with a plus sign between them; the sides are a row (desktop: before, the reaction arrow, after) or a column
 * (phone: before, a down arrow, after). The curved arrows are computed (arrows.ts) in the frame of the before side, then everything is
 * shifted so that nothing, not an arrow's bulge, a head or a transition state's bracket, lies outside the picture. A movement that names
 * an atom no species of the before side has, or one that two of them have (a map number is unique per STRUCTURE, not per side), is
 * `missing_atoms`: nothing is drawn partially.
 */
import { layoutArrows, type AtomBox, type CurvedArrow, type MovementInput, type Point } from './arrows';

export interface DrawnSpecies {
  readonly kind: 'structure' | 'label';
  /** Text of a species that has no structure. */
  readonly label?: string;
  readonly transitionState: boolean;
  readonly width: number;
  readonly height: number;
  readonly atoms: readonly (AtomBox & { readonly map: number })[];
  readonly bonds: readonly { readonly a: number; readonly b: number }[];
}

export interface StepComposeInput {
  readonly before: readonly DrawnSpecies[];
  readonly after: readonly DrawnSpecies[];
  readonly orientation: 'row' | 'column';
  readonly reversible: boolean;
  readonly movements: readonly MovementInput[];
}

export interface Placed {
  /** Index in `before` then `after` laid end to end. */
  readonly index: number;
  readonly side: 'before' | 'after';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** A transition state: square brackets and the double dagger. */
  readonly bracket: boolean;
}

export type Composition =
  | {
      readonly ok: true;
      readonly width: number;
      readonly height: number;
      readonly items: readonly Placed[];
      readonly pluses: readonly Point[];
      readonly arrow: { readonly from: Point; readonly to: Point; readonly equilibrium: boolean };
      readonly arrows: readonly CurvedArrow[];
    }
  | { readonly ok: false; readonly reason: 'missing_atoms'; readonly missing: readonly number[] };

export const SPECIES_GAP = 52;
export const ARROW_LENGTH = 64;
const ARROW_MARGIN = 22;
const BRACKET_PAD = 12;
const MARGIN = 8;

interface Row {
  readonly width: number;
  readonly height: number;
}

const padOf = (s: DrawnSpecies): number => (s.transitionState ? BRACKET_PAD : 0);
function rowOf(species: readonly DrawnSpecies[]): Row {
  if (species.length === 0) return { width: 0, height: 0 };
  return {
    width: species.reduce((sum, s) => sum + s.width + 2 * padOf(s), 0) + SPECIES_GAP * (species.length - 1),
    height: Math.max(...species.map((s) => s.height + 2 * padOf(s))),
  };
}

export function composeStep(input: StepComposeInput): Composition {
  const { before, after } = input;
  const rowB = rowOf(before);
  const rowA = rowOf(after);
  const items: Placed[] = [];
  const pluses: Point[] = [];

  /** Lays one side in a row starting at (x0, centre line y); returns nothing, appends to items and pluses. */
  const lay = (species: readonly DrawnSpecies[], side: 'before' | 'after', x0: number, centreY: number, offset: number): void => {
    let x = x0;
    species.forEach((s, k) => {
      if (k > 0) pluses.push({ x: x - SPECIES_GAP / 2, y: centreY });
      x += padOf(s);
      items.push({ index: offset + k, side, x, y: centreY - s.height / 2, width: s.width, height: s.height, bracket: s.transitionState });
      x += s.width + padOf(s) + (k < species.length - 1 ? SPECIES_GAP : 0);
    });
  };

  let from: Point;
  let to: Point;
  if (input.orientation === 'row') {
    const centreY = Math.max(rowB.height, rowA.height, 40) / 2;
    lay(before, 'before', 0, centreY, 0);
    const arrowX = rowB.width + (before.length === 0 ? 0 : ARROW_MARGIN);
    from = { x: arrowX, y: centreY };
    to = { x: arrowX + ARROW_LENGTH, y: centreY };
    lay(after, 'after', to.x + (after.length === 0 ? 0 : ARROW_MARGIN), centreY, before.length);
  } else {
    const wide = Math.max(rowB.width, rowA.width, 40);
    const topCentre = Math.max(rowB.height, 40) / 2;
    lay(before, 'before', (wide - rowB.width) / 2, topCentre, 0);
    const arrowY = Math.max(rowB.height, 40) + ARROW_MARGIN;
    from = { x: wide / 2, y: arrowY };
    to = { x: wide / 2, y: arrowY + ARROW_LENGTH };
    lay(after, 'after', (wide - rowA.width) / 2, to.y + ARROW_MARGIN + Math.max(rowA.height, 40) / 2, before.length);
  }

  // the curved arrows, in the frame of the before side (the translation of each species is its placed position)
  const holders = new Map<number, number>();
  const atoms = new Map<number, AtomBox>();
  const bonds: [number, number][] = [];
  before.forEach((s, k) => {
    const at = items[k] as Placed;
    for (const atom of s.atoms) {
      holders.set(atom.map, (holders.get(atom.map) ?? 0) + 1);
      atoms.set(atom.map, { x: atom.x + at.x, y: atom.y + at.y, rx: atom.rx, ry: atom.ry });
    }
    for (const bond of s.bonds) bonds.push([bond.a, bond.b]);
  });
  for (const [map, count] of holders) if (count > 1) atoms.delete(map);
  const drawn = layoutArrows(input.movements, { atoms, bonds });
  if (!drawn.ok) return { ok: false, reason: 'missing_atoms', missing: drawn.missing };

  // the box of everything, then the shift that puts it at MARGIN
  const points: Point[] = [from, to];
  for (const item of items) points.push({ x: item.x - (item.bracket ? BRACKET_PAD : 0), y: item.y - (item.bracket ? BRACKET_PAD : 0) }, { x: item.x + item.width + (item.bracket ? BRACKET_PAD : 0), y: item.y + item.height + (item.bracket ? BRACKET_PAD : 0) });
  for (const arrow of drawn.arrows) points.push(arrow.start, arrow.end, arrow.control, ...arrow.head.wings, ...arrow.dots);
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxX = Math.max(...points.map((p) => p.x));
  const maxY = Math.max(...points.map((p) => p.y));
  const dx = MARGIN - minX;
  const dy = MARGIN - minY;
  const move = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  const arrows = drawn.arrows.map(
    (a): CurvedArrow => ({ ...a, start: move(a.start), end: move(a.end), control: move(a.control), path: shiftPath(a.path, dx, dy), head: { ...a.head, tip: move(a.head.tip), wings: a.head.wings.map(move) }, dots: a.dots.map(move) }),
  );
  return {
    ok: true,
    width: maxX - minX + 2 * MARGIN,
    height: maxY - minY + 2 * MARGIN,
    items: items.map((i) => ({ ...i, x: i.x + dx, y: i.y + dy })),
    pluses: pluses.map(move),
    arrow: { from: move(from), to: move(to), equilibrium: input.reversible },
    arrows,
  };
}

/** The SVG path data of an arrow, every coordinate pair moved by (dx, dy): it is only "M x y" / "Q x y x y" / "C ..." with pairs. */
function shiftPath(path: string, dx: number, dy: number): string {
  const round = (v: number): number => Math.round(v * 100) / 100;
  return path.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => `${round(Number(x) + dx)} ${round(Number(y) + dy)}`);
}
