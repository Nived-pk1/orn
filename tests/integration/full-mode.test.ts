/**
 * Step 8.5g B1 on REAL RDKit: the owner's five structures in Full (all atoms) at the Full bond standard are drawn with all their atoms and
 * pass the crowding check (CoordGen coordinates where RDKit's own pile atoms up); a molecule too crowded for any layout is drawn condensed
 * and says so; the same input gives the same picture; other modes are unchanged.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, loadRdkit, type StructureToolkit } from '@/chem';
import { FULL_BOND_FACTOR } from '@/chem/contracts';

let toolkit: StructureToolkit;
beforeAll(async () => {
  const shared = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => shared });
  await toolkit.ready();
}, 60_000);

const FULL_PX = Math.round(28 * FULL_BOND_FACTOR);
async function draw(value: string, mode: 'full' | 'condensed' | 'skeletal', bondPx = FULL_PX) {
  const out = await toolkit.depict({ format: 'smiles', value }, { width: 120, height: 80, showAtomMaps: false, mode, fixedScale: true, bondPx });
  if (!out.ok) throw new Error(`${value}: ${out.reason} ${out.error}`);
  return out.depiction;
}
/** The test's own reader: the boxes of the labels (all glyphs of one atom) and how many pairs of them overlap. */
function clashes(svg: string): number {
  const boxes = new Map<string, [number, number, number, number]>();
  for (const m of svg.matchAll(/<path\s[^>]*?class=['"]atom-(\d+)['"][^>]*?\sd=['"]([^'"]+)['"]/g)) {
    const n = (m[2] ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const box = boxes.get(m[1] as string) ?? [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i + 1 < n.length; i += 2) {
      box[0] = Math.min(box[0], n[i] as number);
      box[1] = Math.min(box[1], n[i + 1] as number);
      box[2] = Math.max(box[2], n[i] as number);
      box[3] = Math.max(box[3], n[i + 1] as number);
    }
    boxes.set(m[1] as string, box);
  }
  const all = [...boxes.values()];
  return all.reduce((sum, a, i) => sum + all.slice(i + 1).filter((b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]).length, 0);
}
const labelled = (svg: string): number => new Set([...svg.matchAll(/class=['"]atom-(\d+)['"]/g)].map((m) => m[1])).size;

const OWNER = [
  { name: 'D-glucose (open chain)', smiles: 'C([C@H]([C@H]([C@@H]([C@H](C=O)O)O)O)O)O', atomsWithLabels: 18 },
  { name: 'hexane', smiles: 'CCCCCC', atomsWithLabels: 14 },
  { name: 'propanone cyanohydrin', smiles: 'CC(C)(O)C#N', atomsWithLabels: 9 },
  { name: '2-methylpropan-2-ol', smiles: 'CC(C)(C)O', atomsWithLabels: 11 },
  { name: 'pinacol', smiles: 'CC(C)(O)C(C)(C)O', atomsWithLabels: 16 },
];
/** Tetra-tert-butylmethane: no flat drawing has room for its 36 hydrogens. */
const TOO_CROWDED = 'CC(C)(C)C(C(C)(C)C)(C(C)(C)C)C(C)(C)C';

describe('the owner’s structures in Full', () => {
  for (const one of OWNER) {
    it(`${one.name}: all atoms, no two labels on each other, the same picture twice`, async () => {
      const d = await draw(one.smiles, 'full');
      expect(d.allAtoms).toBe(true);
      expect(clashes(d.svg)).toBe(0);
      expect(labelled(d.svg)).toBe(one.atomsWithLabels); // every H and every heteroatom has its label
      expect((await draw(one.smiles, 'full')).svg).toBe(d.svg);
    });
  }
});

describe('too crowded for all atoms', () => {
  it('is drawn condensed, exactly as a condensed request at the standard without the Full factor, and says so', async () => {
    const d = await draw(TOO_CROWDED, 'full');
    expect(d.allAtoms).toBe(false);
    expect(d.svg).toBe((await draw(TOO_CROWDED, 'condensed', 28)).svg);
  });
  it('a drawing in another mode says nothing about all atoms', async () => {
    expect((await draw('CCO', 'condensed', 28)).allAtoms).toBeUndefined();
    expect((await draw('CCO', 'skeletal', 28)).allAtoms).toBeUndefined();
  });
  it('without a bond standard (a map or compound drawing scaled to its area) there is no fallback to say, and none is made', async () => {
    const out = await toolkit.depict({ format: 'smiles', value: TOO_CROWDED }, { width: 128, height: 80, showAtomMaps: false, mode: 'full' });
    expect(out.ok && out.depiction.allAtoms).toBeUndefined();
  });
});
