/**
 * How crowded a drawing the worker made itself is (step 8.5g B1), pure: pairs of atom labels whose boxes overlap, labels lying on a bond
 * that is not their own (both from the SVG's `atom-N` and `bond-N atom-i atom-j` classes) and pairs of atoms closer than half a bond (from
 * the molblock the drawing was made from; the bond is the median one) and, since 8.5h, pairs of bonds that cross without sharing an atom.
 * All zeros: every atom has its own room.
 */
export interface Crowding {
  readonly labels: number;
  readonly bonds: number;
  readonly atoms: number;
  readonly crossings: number;
}

/** Samples along each segment of a bond path. */
const SAMPLES = 20;
/** More atoms than this are not compared pair by pair: the drawing counts as crowded. */
const MAX_ATOMS = 600;

type Box = { x0: number; y0: number; x1: number; y1: number };

const numbersOf = (d: string): number[] => d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];

function pathsOf(svg: string): readonly { readonly cls: string; readonly points: number[] }[] {
  return [...svg.matchAll(/<path\s[^>]*>/g)].map((tag) => ({
    cls: /\sclass=['"]([^'"]*)['"]/.exec(tag[0])?.[1] ?? '',
    points: numbersOf(/\sd=['"]([^'"]*)['"]/.exec(tag[0])?.[1] ?? ''),
  }));
}

function labelsOf(paths: ReturnType<typeof pathsOf>): ReadonlyMap<string, Box> {
  const boxes = new Map<string, Box>();
  for (const { cls, points } of paths) {
    const atom = /^atom-(\d+)$/.exec(cls)?.[1];
    if (atom === undefined) continue;
    const box = boxes.get(atom) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (let i = 0; i + 1 < points.length; i += 2) {
      box.x0 = Math.min(box.x0, points[i] as number);
      box.x1 = Math.max(box.x1, points[i] as number);
      box.y0 = Math.min(box.y0, points[i + 1] as number);
      box.y1 = Math.max(box.y1, points[i + 1] as number);
    }
    boxes.set(atom, box);
  }
  return boxes;
}

function bondHits(paths: ReturnType<typeof pathsOf>, labels: ReadonlyMap<string, Box>): number {
  const hits = new Set<string>();
  for (const { cls, points } of paths) {
    if (!cls.startsWith('bond-')) continue;
    const own = new Set(cls.split(' ').flatMap((word) => /^atom-(\d+)$/.exec(word)?.[1] ?? []));
    for (let i = 0; i + 3 < points.length; i += 2) {
      for (let k = 0; k <= SAMPLES; k += 1) {
        const x = (points[i] as number) + (((points[i + 2] as number) - (points[i] as number)) * k) / SAMPLES;
        const y = (points[i + 1] as number) + (((points[i + 3] as number) - (points[i + 1] as number)) * k) / SAMPLES;
        for (const [atom, box] of labels) if (!own.has(atom) && x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1) hits.add(`${cls}:${atom}`);
      }
    }
  }
  return hits.size;
}

type At = readonly [number, number];
const side = (a: At, b: At, p: At): number => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

/** Pairs of bonds that cross each other although they share no atom (step 8.5h). */
function bondCrossings(paths: ReturnType<typeof pathsOf>): number {
  const bonds = paths
    .filter(({ cls }) => cls.startsWith('bond-'))
    .map(({ cls, points }) => ({
      atoms: cls.split(' ').slice(1),
      lines: Array.from({ length: Math.max(0, points.length / 2 - 1) }, (_, i): readonly [At, At] => [
        [points[2 * i] as number, points[2 * i + 1] as number],
        [points[2 * i + 2] as number, points[2 * i + 3] as number],
      ]),
    }));
  const hits = new Set<string>();
  bonds.forEach((one, i) => {
    for (const other of bonds.slice(i + 1)) {
      if (one.atoms.some((atom) => other.atoms.includes(atom))) continue; // neighbours, and the lines of one bond
      const crosses = one.lines.some(([a, b]) => other.lines.some(([p, q]) => side(a, b, p) * side(a, b, q) < 0 && side(p, q, a) * side(p, q, b) < 0));
      if (crosses) hits.add(`${one.atoms.join()}:${other.atoms.join()}`);
    }
  });
  return hits.size;
}

/** The atoms and the bond lengths of a V2000 molblock; `undefined` for another shape. */
export function blockGeometry(block: string): { readonly atoms: readonly (readonly [number, number])[]; readonly bond: number } | undefined {
  const lines = block.split('\n');
  const counts = lines[3];
  if (counts === undefined || !counts.includes('V2000')) return undefined;
  const n = Number(counts.slice(0, 3));
  const m = Number(counts.slice(3, 6));
  const atoms = lines.slice(4, 4 + n).map((line): readonly [number, number] => [Number(line.slice(0, 10)), Number(line.slice(10, 20))]);
  const lengths = lines
    .slice(4 + n, 4 + n + m)
    .flatMap((line) => {
      const a = atoms[Number(line.slice(0, 3)) - 1];
      const b = atoms[Number(line.slice(3, 6)) - 1];
      return a === undefined || b === undefined ? [] : [Math.hypot(a[0] - b[0], a[1] - b[1])];
    })
    .sort((a, b) => a - b);
  return { atoms, bond: lengths[Math.floor(lengths.length / 2)] ?? 0 };
}

export function crowdingOf(svg: string, block: string): Crowding {
  const paths = pathsOf(svg);
  const labels = labelsOf(paths);
  const geometry = blockGeometry(block);
  if (geometry === undefined || geometry.atoms.length > MAX_ATOMS) return { labels: 0, bonds: 0, atoms: 1, crossings: 0 };
  const boxes = [...labels.values()];
  const overlapping = boxes.reduce((sum, a, i) => sum + boxes.slice(i + 1).filter((b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1).length, 0);
  const near = geometry.atoms.reduce((sum, a, i) => sum + geometry.atoms.slice(i + 1).filter((b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < geometry.bond / 2).length, 0);
  return { labels: overlapping, bonds: bondHits(paths, labels), atoms: near, crossings: bondCrossings(paths) };
}

export const crowdingScore = (c: Crowding): number => c.labels + c.bonds + c.atoms + c.crossings;
