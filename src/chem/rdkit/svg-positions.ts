/**
 * Atom positions read from an SVG the chem worker made ITSELF (ADR-038 "As built 8.5", D1 option 1): the SVG text never leaves the
 * worker through this module, and only RDKit's own class names are read. Two drawings of one molecule at one fixed scale:
 *   plain        the drawing that is shown;
 *   highlighted  the same molecule with its mapped atoms highlighted: one `<ellipse class='atom-N'>` per atom, centred on the atom
 *                (on its label's box for a labelled atom: O, N, Br, a charge), `rx` and `ry` the box.
 * Highlighting widens the canvas, and RDKit rounds the canvas to whole units, so the two drawings differ by a translation and a
 * scale a little off 1 (measured: up to about 1 %). Both are fitted (least squares) from points the drawings share, found by
 * CLASS: the glyph paths of an atom label (`atom-N`: every point) and each bond (`bond-N ...`: where its first line starts and
 * ends; RDKit draws a bond between two colours as two paths, the highlighted drawing as one). The fit is CHECKED: a drawing that
 * is not the same shape moved and scaled, or has too few shared points, is a refusal. Pure; bounded; never a guess: an atom
 * without exactly one ellipse is an error.
 */

export interface PositionedAtom {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}

export type PositionsOutcome = { readonly ok: true; readonly atoms: readonly PositionedAtom[] } | { readonly ok: false; readonly error: string };

/** More points than this in a drawing is not read (a drawing of a step species is a few hundred). */
export const MAX_POINTS = 3_000;
/** The most the fitted drawing may differ from the shown one at a shared point, in SVG units (RDKit writes one decimal). */
export const FIT_TOLERANCE = 0.35;

type Point = readonly [number, number];
interface Path {
  readonly cls: string;
  readonly points: readonly Point[];
}

const NUMBER = /-?\d+(?:\.\d+)?/g;
const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}=(?:'([^']*)'|"([^"]*)")`).exec(tag)?.slice(1).find((v) => v !== undefined);

function pathsOf(svg: string): readonly Path[] | undefined {
  const paths: Path[] = [];
  let count = 0;
  for (const tag of svg.match(/<path\s[^>]*>/g) ?? []) {
    const numbers = (attr(tag, 'd') ?? '').match(NUMBER)?.map(Number) ?? [];
    const points: Point[] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i] as number, numbers[i + 1] as number]);
    count += points.length;
    if (count > MAX_POINTS) return undefined;
    const cls = attr(tag, 'class');
    if (cls !== undefined && points.length > 0) paths.push({ cls, points });
  }
  return paths;
}

const near = (a: Point, b: Point): boolean => Math.abs(a[0] - b[0]) < 0.06 && Math.abs(a[1] - b[1]) < 0.06;

/** The first path of a class, with the paths that continue it end to start (a bond split at a colour change): its first and last point. */
function firstLine(paths: readonly Path[], at: number): readonly [Point, Point] {
  const start = (paths[at] as Path).points[0] as Point;
  let end = (paths[at] as Path).points.at(-1) as Point;
  for (let k = at + 1; k < paths.length; k += 1) {
    const next = paths[k] as Path;
    if (next.cls !== (paths[at] as Path).cls || !near(next.points[0] as Point, end)) break;
    end = next.points.at(-1) as Point;
  }
  return [start, end];
}

/** Point pairs (plain, highlighted) that name the same place in both drawings. */
function sharedPoints(plain: readonly Path[], lit: readonly Path[]): readonly (readonly [Point, Point])[] {
  const pairs: (readonly [Point, Point])[] = [];
  const seen = new Set<string>();
  plain.forEach((path, at) => {
    if (seen.has(path.cls)) return;
    seen.add(path.cls);
    const other = lit.findIndex((q) => q.cls === path.cls);
    if (other < 0) return;
    const theirs = lit[other] as Path;
    if (/^atom-\d+$/.test(path.cls)) {
      if (theirs.points.length === path.points.length) path.points.forEach((p, i) => pairs.push([p, theirs.points[i] as Point]));
      return;
    }
    const [a, b] = firstLine(plain, at);
    const [c, d] = firstLine(lit, other);
    pairs.push([a, c], [b, d]);
  });
  return pairs;
}

/** x' = s x + tx, y' = s y + ty by least squares; `undefined` when the points do not fix a scale or do not fit within `FIT_TOLERANCE`. */
function fit(pairs: readonly (readonly [Point, Point])[]): { readonly s: number; readonly tx: number; readonly ty: number } | undefined {
  const n = pairs.length;
  if (n < 2) return undefined;
  const mean = (pick: (p: readonly [Point, Point]) => number): number => pairs.reduce((sum, p) => sum + pick(p), 0) / n;
  const px = mean((p) => p[0][0]);
  const py = mean((p) => p[0][1]);
  const qx = mean((p) => p[1][0]);
  const qy = mean((p) => p[1][1]);
  let spread = 0;
  let cross = 0;
  for (const [p, q] of pairs) {
    spread += (p[0] - px) ** 2 + (p[1] - py) ** 2;
    cross += (p[0] - px) * (q[0] - qx) + (p[1] - py) * (q[1] - qy);
  }
  if (spread < 1) return undefined;
  const s = cross / spread;
  if (!(s > 0.5 && s < 2)) return undefined;
  const tx = qx - s * px;
  const ty = qy - s * py;
  return pairs.every(([p, q]) => Math.abs(s * p[0] + tx - q[0]) <= FIT_TOLERANCE && Math.abs(s * p[1] + ty - q[1]) <= FIT_TOLERANCE) ? { s, tx, ty } : undefined;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}
const boxOf = (points: readonly Point[]): Box => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 };
};

/**
 * The box of the ELEMENT LETTER of a labelled atom (step 8.5b A3), in the shown drawing's frame; `undefined` when the atom has no label
 * glyphs. RDKit draws a label ("HO-", "NH3+", "H3N+", "OH", "Br-") as one `atom-N` path per glyph, left to right. The letter is found by:
 *   size     the letters are the tall, wide glyphs (a subscript count, a charge, a radical dot, the "r" of Br and the "l" of Cl are not);
 *   a bonded atom: the letter nearest the end of its bond (RDKit puts the atom's own letter against the bond: "NH3+", "H3N+");
 *   no bond  two letters: a subscript count between them means the hydrogen comes first ("H2O"), one after them means it comes last
 *            ("NH2-"); with no count, RDKit draws the hydrogen first ("HO-", "HS-": measured for O and S, RDKit 2026.03).
 */
export function elementLetterOf(plainSvg: string, index: number): { readonly x: number; readonly y: number; readonly rx: number; readonly ry: number } | undefined {
  const paths = pathsOf(plainSvg);
  return paths === undefined ? undefined : elementLetter(paths, index);
}

function elementLetter(plain: readonly Path[], index: number): Box | undefined {
  const glyphs = plain.filter((p) => p.cls === `atom-${index}`).map((p) => boxOf(p.points)).sort((a, b) => a.x - b.x);
  if (glyphs.length === 0) return undefined;
  const tall = Math.max(...glyphs.map((g) => g.ry));
  const wide = Math.max(...glyphs.map((g) => g.rx));
  const letters = glyphs.filter((g) => g.ry >= 0.8 * tall && g.rx >= 0.45 * wide);
  if (letters.length <= 1) return letters[0] ?? glyphs[0];
  const ends: Point[] = [];
  for (const path of plain) {
    if (path.cls.startsWith('bond-') && path.cls.split(' ').includes(`atom-${index}`)) {
      const first = path.points[0] as Point;
      const last = path.points.at(-1) as Point;
      const centre = boxOf(glyphs.map((g): Point => [g.x, g.y]));
      ends.push(Math.hypot(first[0] - centre.x, first[1] - centre.y) < Math.hypot(last[0] - centre.x, last[1] - centre.y) ? first : last);
    }
  }
  if (ends.length > 0) {
    const mx = ends.reduce((s, p) => s + p[0], 0) / ends.length;
    const my = ends.reduce((s, p) => s + p[1], 0) / ends.length;
    return [...letters].sort((a, b) => Math.hypot(a.x - mx, a.y - my) - Math.hypot(b.x - mx, b.y - my))[0];
  }
  const [first, second] = letters as [Box, Box];
  const counts = glyphs.filter((g) => !letters.includes(g) && g.y > first.y + 0.3 * tall); // subscript counts hang below the letters' middle
  if (counts.length === 0) return second;
  return counts.some((g) => g.x > first.x && g.x < second.x) ? second : first;
}

const round = (value: number): number => Math.round(value * 100) / 100;

export function readPositions(plainSvg: string, highlightedSvg: string, indexes: readonly number[]): PositionsOutcome {
  const fail = (why: string): PositionsOutcome => ({ ok: false, error: `the atom positions could not be read (${why})` });
  const plain = pathsOf(plainSvg);
  const lit = pathsOf(highlightedSvg);
  if (plain === undefined || lit === undefined) return fail('the drawing has too many points');
  if (plain.length === 0) return fail('the drawing has no bond or label paths; RDKit may have changed its drawing');
  const ellipses = new Map<number, { x: number; y: number; rx: number; ry: number }[]>();
  for (const tag of highlightedSvg.match(/<ellipse\s[^>]*>/g) ?? []) {
    const index = /^atom-(\d+)$/.exec(attr(tag, 'class') ?? '')?.[1];
    const [x, y, rx, ry] = ['cx', 'cy', 'rx', 'ry'].map((name) => Number(attr(tag, name)));
    if (index === undefined || [x, y, rx, ry].some((v) => v === undefined || !Number.isFinite(v))) continue;
    ellipses.set(Number(index), [...(ellipses.get(Number(index)) ?? []), { x: x as number, y: y as number, rx: rx as number, ry: ry as number }]);
  }
  const moved = fit(sharedPoints(plain, lit));
  if (moved === undefined) return fail('the highlighted drawing is not the plain drawing moved and scaled; RDKit may have changed its drawing');
  const atoms: PositionedAtom[] = [];
  for (const index of indexes) {
    const found = ellipses.get(index);
    if (found?.length !== 1) return fail(`atom ${index} has ${found?.length ?? 0} highlight shapes; the atom-N classes may have changed`);
    const e = found[0] as { x: number; y: number; rx: number; ry: number };
    const letter = elementLetter(plain, index);
    atoms.push(letter === undefined
      ? { index, x: round((e.x - moved.tx) / moved.s), y: round((e.y - moved.ty) / moved.s), rx: round(e.rx / moved.s), ry: round(e.ry / moved.s) }
      : { index, x: round(letter.x), y: round(letter.y), rx: round(letter.rx), ry: round(letter.ry) });
  }
  return { ok: true, atoms };
}
