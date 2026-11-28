/**
 * Step 8.5h A3 on REAL RDKit: the two lines of every double bond are parallel (within 5 degrees), at least 1.5 stroke widths apart along
 * their length, and neither crosses another bond. The owner's two molecules (the DNP hydrazone and phorone) were drawn in Full with the
 * second line converging or running past its carbon: a double bond with no cis/trans given was written "either" in the hydrogen-added copy.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, loadRdkit, type StructureToolkit } from '@/chem';
import { FULL_BOND_FACTOR } from '@/chem/contracts';
import { AWKWARD } from '../e2e/awkward-set';

let toolkit: StructureToolkit;
beforeAll(async () => {
  const shared = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => shared });
  await toolkit.ready();
}, 60_000);

type Point = readonly [number, number];
type Segment = readonly [Point, Point];
const STROKE = 2;

/** The straight strokes of every bond, by bond number (the test's own reader; filled wedges are left out). */
function bondsOf(svg: string): ReadonlyMap<string, Segment[]> {
  const found = new Map<string, Segment[]>();
  for (const tag of svg.match(/<path\s[^>]*>/g) ?? []) {
    const index = /class=['"]bond-(\d+) /.exec(tag)?.[1];
    const d = /\sd=['"]([^'"]+)['"]/.exec(tag)?.[1] ?? '';
    if (index === undefined || /z/i.test(d)) continue;
    const n = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const list = found.get(index) ?? [];
    for (let i = 0; i + 3 < n.length; i += 2) list.push([[n[i] as number, n[i + 1] as number], [n[i + 2] as number, n[i + 3] as number]]);
    found.set(index, list);
  }
  return found;
}
const angleOf = ([a, b]: Segment): number => ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 360) % 180;
const apart = (p: number, q: number): number => Math.min(Math.abs(p - q), 180 - Math.abs(p - q));
/** Distance of a point from the infinite line of a segment. */
const offset = ([a, b]: Segment, p: Point): number => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
const cross = (o: Point, a: Point, b: Point): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
/** The two segments cross in their insides (meeting at an end is not a crossing). */
function crosses([a, b]: Segment, [c, d]: Segment): boolean {
  if (cross(a, b, c) * cross(a, b, d) >= 0 || cross(c, d, a) * cross(c, d, b) >= 0) return false;
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  const at: Point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return [a, b, c, d].every((end) => Math.hypot(end[0] - at[0], end[1] - at[1]) > 1);
}

/** What is wrong with the multiple bonds of a drawing, and how many it has (a bond whose strokes lie on more than one line). */
function check(svg: string): { readonly doubles: number; readonly problems: string[] } {
  const bonds = bondsOf(svg);
  const problems: string[] = [];
  let doubles = 0;
  for (const [index, strokes] of bonds) {
    const first = strokes[0] as Segment;
    const others = strokes.filter((s) => apart(angleOf(s), angleOf(first)) > 5 || offset(first, s[0]) > 0.5 || offset(first, s[1]) > 0.5);
    if (others.length === 0) continue; // one line: a single bond (one between two colours is two halves of it)
    doubles += 1;
    for (const s of others) {
      if (apart(angleOf(s), angleOf(first)) > 5) problems.push(`bond ${index}: lines ${apart(angleOf(s), angleOf(first)).toFixed(1)} degrees from parallel`);
      const gap = Math.min(offset(first, s[0]), offset(first, s[1]));
      if (gap < 1.5 * STROKE) problems.push(`bond ${index}: lines only ${gap.toFixed(1)} apart`);
    }
    for (const [other, theirs] of bonds) {
      if (other !== index && strokes.some((s) => theirs.some((t) => crosses(s, t)))) problems.push(`bond ${index} crosses bond ${other}`);
    }
  }
  return { doubles, problems };
}

/** Name, SMILES and the number of double or triple bonds the drawing must show (the ring ones in a Kekule form). */
const MOLECULES: readonly (readonly [string, string, number])[] = [
  ['propanone 2,4-DNP hydrazone', 'CC(C)=NNc1ccc([N+](=O)[O-])cc1[N+](=O)[O-]', 6],
  ['phorone', 'CC(C)=CC(=O)C=C(C)C', 3],
  ['but-2-ene, geometry not given', 'CC=CC', 1],
  ['propanone oxime', 'CC(C)=NO', 1],
  ['2,3-dimethylbut-2-ene', 'CC(C)=C(C)C', 1],
  ...AWKWARD.flatMap((one): (readonly [string, string, number])[] => (one.smiles === undefined ? [] : [[one.label, one.smiles, (one.smiles.match(/=/g) ?? []).length]])),
];

describe('the lines of a double bond (real RDKit)', () => {
  for (const [name, smiles, expected] of MOLECULES) {
    for (const mode of ['full', 'condensed', 'skeletal'] as const) {
      it(`${name}, ${mode}`, async () => {
        const out = await toolkit.depict({ format: 'smiles', value: smiles }, { width: 120, height: 80, showAtomMaps: false, mode, fixedScale: true, bondPx: Math.round(28 * FULL_BOND_FACTOR) });
        if (!out.ok) throw new Error(out.error);
        const result = check(out.depiction.svg);
        expect(result.problems).toEqual([]);
        expect(result.doubles).toBe(expected);
      });
    }
  }
  it('mechanism drawings (atom positions): C=O and C=C', async () => {
    for (const value of ['[CH3:1][CH:2]=[O:3]', '[CH2:1]=[CH:2][O-:3]', 'C[CH:1]=[CH:2]C']) {
      const out = await toolkit.depict({ format: 'smiles', value }, { width: 120, height: 80, showAtomMaps: false, fixedScale: true, atomPositions: true });
      if (!out.ok) throw new Error(out.error);
      expect(check(out.depiction.svg), value).toEqual({ doubles: 1, problems: [] });
    }
  });
  it('a crossed bond the author drew on purpose stays crossed in Full', async () => {
    const crossed = ['', '     RDKit          2D', '', '  4  3  0  0  0  0  0  0  0  0999 V2000', '    0.0000    0.0000    0.0000 C   0  0', '    1.2990    0.7500    0.0000 C   0  0', '    2.5981    0.0000    0.0000 C   0  0', '    3.8971    0.7500    0.0000 C   0  0', '  1  2  1  0', '  2  3  2  3', '  3  4  1  0', 'M  END'].join('\n');
    const out = await toolkit.depict({ format: 'molfile', value: crossed }, { width: 120, height: 80, showAtomMaps: false, mode: 'full', fixedScale: true, bondPx: 39 });
    if (!out.ok) throw new Error(out.error);
    expect(check(out.depiction.svg).problems.some((p) => p.includes('parallel'))).toBe(true);
  });
});
