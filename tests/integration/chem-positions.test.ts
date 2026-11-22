/**
 * Step 8.5 M1 (ADR-038, reviewer's D1 option 1): the chem worker answers, with a drawing made with `atomPositions: true`, the
 * position of every mapped atom in the SVG's own frame and the bonds between mapped atoms, by map number. Checked here against
 * the drawing itself (real RDKit): neutral, charged, a ring, a lone ion and an explicit mapped hydrogen. The positions are read
 * from an SVG the worker made itself (RDKit's `atom-N` and `bond-N` classes); a missing class is a refusal, never a guess.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, loadRdkit, type RdkitModule, type StructureToolkit } from '@/chem';
import type { StructureRep } from '@/core/schema';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const OPTIONS = { width: 200, height: 200, showAtomMaps: false, fixedScale: true, atomPositions: true } as const;

let shared: RdkitModule;
let toolkit: StructureToolkit;
beforeAll(async () => {
  shared = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => shared });
  await toolkit.ready();
}, 60_000);

interface Drawn {
  readonly cls: string;
  readonly points: readonly (readonly [number, number])[];
}
/** Every path of the (sanitised) drawing with its class and its coordinate pairs: the test's own reader, independent of the product's. */
function pathsOf(svg: string): Drawn[] {
  return [...svg.matchAll(/<path\s[^>]*?class=['"]([^'"]+)['"][^>]*?\sd=['"]([^'"]+)['"]/g)].map((m) => {
    const numbers = (m[2] ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const points: [number, number][] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i] as number, numbers[i + 1] as number]);
    return { cls: m[1] as string, points };
  });
}
const box = (paths: readonly Drawn[]) => {
  const xs = paths.flatMap((p) => p.points.map((q) => q[0]));
  const ys = paths.flatMap((p) => p.points.map((q) => q[1]));
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};
function distToSegment(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function labelsOf(paths: readonly Drawn[]): Map<string, Drawn[]> {
  const labels = new Map<string, Drawn[]>();
  for (const p of paths.filter((q) => /^atom-\d+$/.test(q.cls))) labels.set(p.cls, [...(labels.get(p.cls) ?? []), p]);
  return labels;
}

async function depictOk(value: string) {
  const out = await toolkit.depict(smiles(value), OPTIONS);
  if (!out.ok) throw new Error(`${value}: ${out.reason} ${out.error}`);
  return out.depiction;
}

describe('positions by map number, against the drawing', () => {
  const FIXTURES: readonly { name: string; value: string; labelled: readonly number[]; bonds: readonly (readonly [number, number])[] }[] = [
    { name: 'neutral', value: '[CH3:1][CH2:2][OH:3]', labelled: [3], bonds: [[1, 2], [2, 3]] },
    { name: 'charged', value: '[CH3:1][C:2](=[O:3])[O-:4]', labelled: [3, 4], bonds: [[1, 2], [2, 3], [2, 4]] },
    { name: 'a ring', value: '[cH:1]1[cH:2][cH:3][cH:4][cH:5][cH:6]1', labelled: [], bonds: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [1, 6]] },
    { name: 'a wedge and a charged amine', value: '[CH3:1][C@@H:2]([Br:3])[NH3+:4]', labelled: [3, 4], bonds: [[1, 2], [2, 3], [2, 4]] },
    { name: 'a lone ion', value: '[Br-:1]', labelled: [1], bonds: [] },
    { name: 'an explicit mapped hydrogen', value: '[H:1][O:2][CH3:3]', labelled: [1, 2], bonds: [[1, 2], [2, 3]] },
  ];

  for (const fixture of FIXTURES) {
    describe(fixture.name, () => {
      it('has one position per mapped atom, inside the drawing, and exactly the bonds between mapped atoms', async () => {
        const d = await depictOk(fixture.value);
        const maps = (d.atoms ?? []).map((a) => a.map).sort((x, y) => x - y);
        expect(maps).toEqual([...new Set(fixture.value.match(/:(\d+)\]/g)?.map((m) => Number(m.slice(1, -1))))].sort((x, y) => x - y));
        for (const atom of d.atoms ?? []) {
          expect(atom.x).toBeGreaterThanOrEqual(0);
          expect(atom.x).toBeLessThanOrEqual(d.width);
          expect(atom.y).toBeGreaterThanOrEqual(0);
          expect(atom.y).toBeLessThanOrEqual(d.height);
          expect(atom.rx).toBeGreaterThan(0);
          expect(atom.ry).toBeGreaterThan(0);
        }
        const bonds = (d.bonds ?? []).map((b) => `${b.a}-${b.b}`).sort();
        expect(bonds).toEqual(fixture.bonds.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`).sort());
      });

      it('every labelled atom sits inside the glyphs of its own label; every bond lies along the line between its two positions', async () => {
        const d = await depictOk(fixture.value);
        const paths = pathsOf(d.svg);
        const at = (map: number) => (d.atoms ?? []).find((a) => a.map === map) as NonNullable<typeof d.atoms>[number];
        const boxes = [...labelsOf(paths).values()].map(box);
        expect(boxes.length).toBe(fixture.labelled.length);
        for (const map of fixture.labelled) {
          const a = at(map);
          const own = boxes.filter((b) => a.x >= b.x0 - 12 && a.x <= b.x1 + 12 && a.y >= b.y0 - 12 && a.y <= b.y1 + 12);
          expect(own.length, `map ${map} is within reach of a label`).toBeGreaterThanOrEqual(1);
        }
        for (const bond of d.bonds ?? []) {
          const a = at(bond.a);
          const b = at(bond.b);
          const near = paths.filter((p) => p.cls.startsWith('bond-') && p.points.every((q) => distToSegment(q, [a.x, a.y], [b.x, b.y]) <= 9));
          expect(near.length, `a drawn bond lies along ${bond.a}-${bond.b}`).toBeGreaterThanOrEqual(1);
        }
      });
    });
  }

  it('the drawn atom order is the order of the indexes: a heteroatom label is found at the map of THAT atom, not a neighbour', async () => {
    const d = await depictOk('[Cl:2][CH2:5][CH2:4][OH:7]');
    const centres = [...labelsOf(pathsOf(d.svg)).values()].map((l) => {
      const b = box(l);
      return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    });
    const distance = (map: number) => {
      const a = (d.atoms ?? []).find((q) => q.map === map) as NonNullable<typeof d.atoms>[number];
      return centres.map((c) => Math.hypot(c.x - a.x, c.y - a.y)).sort((p, q) => p - q)[0] as number;
    };
    expect(distance(2)).toBeLessThan(20);
    expect(distance(7)).toBeLessThan(20);
    expect(distance(5)).toBeGreaterThan(20);
    expect(distance(4)).toBeGreaterThan(20);
  });

  it('a map that is written twice is refused (never guessed); a structure with no maps has an empty table', async () => {
    const twice = await toolkit.depict(smiles('[CH3:1][CH2:1]'), OPTIONS);
    expect(twice.ok).toBe(false);
    const none = await toolkit.depict(smiles('CCO'), OPTIONS);
    expect(none.ok).toBe(true);
    expect(none.ok && none.depiction.atoms).toEqual([]);
  });

  it('atomPositions needs a fixed scale and no shown maps (a programmer error otherwise)', async () => {
    await expect(toolkit.depict(smiles('[CH3:1]'), { ...OPTIONS, fixedScale: false })).rejects.toThrow(RangeError);
    await expect(toolkit.depict(smiles('[CH3:1]'), { ...OPTIONS, showAtomMaps: true })).rejects.toThrow(RangeError);
  });

  it('without atomPositions the answer has no table (the plain drawing is unchanged)', async () => {
    const out = await toolkit.depict(smiles('[CH3:1][CH2:2][OH:3]'), { width: 200, height: 200, showAtomMaps: false, fixedScale: true });
    expect(out.ok && out.depiction.atoms).toBeUndefined();
  });
});

describe('RDKit class names (loud when an RDKit update changes them)', () => {
  const DETAILS = { width: -1, height: -1, scalingFactor: 37, clearBackground: false };

  it('a highlighted drawing has `atom-N` ellipses and a plain one has `bond-N` paths; if this fails, RDKit changed and positions must be re-proved', () => {
    const mol = shared.get_mol('[CH3:1][CH2:2][OH:3]');
    expect(mol).not.toBeNull();
    const plain = mol?.get_svg_with_highlights(JSON.stringify(DETAILS)) ?? '';
    const lit = mol?.get_svg_with_highlights(JSON.stringify({ ...DETAILS, atoms: [0, 1, 2] })) ?? '';
    mol?.delete();
    expect(plain).toMatch(/<path[^>]*class=['"]bond-\d+ atom-\d+ atom-\d+['"]/);
    expect([...lit.matchAll(/<ellipse[^>]*class=['"]atom-(\d+)['"]/g)].map((m) => m[1]).sort()).toEqual(['0', '1', '2']);
  });

  it('when the ellipse classes are missing the depiction is refused with the reason, and nothing partial is answered', async () => {
    const broken: RdkitModule = {
      ...shared,
      get_mol: (input, details) => {
        const mol = details === undefined ? shared.get_mol(input) : shared.get_mol(input, details);
        if (mol === null) return null;
        return new Proxy(mol, {
          get: (target, key) => {
            const value: unknown = Reflect.get(target, key);
            if (key === 'get_svg_with_highlights') return (d: string) => target.get_svg_with_highlights(d).replace(/class=['"]atom-\d+['"]/g, '');
            return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
          },
        });
      },
    };
    const t = createRdkitToolkit({ load: async () => broken });
    const out = await t.depict(smiles('[CH3:1][CH2:2][OH:3]'), OPTIONS);
    expect(out.ok).toBe(false);
    expect(!out.ok && out.reason).toBe('refused');
    expect(!out.ok && out.error).toMatch(/atom positions/);
  });
});
