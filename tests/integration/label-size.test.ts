/**
 * Step 8.5e E1: the label size is set apart from the bond length. Real RDKit (the same adapter the chem worker uses): a drawing asked with `bondPx`
 * has capital-letter glyphs 13 px high AS SHOWN (the SVG is shown at bondPx / FIXED_SCALE_BOND_UNITS) whatever the bond length it is shown at.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, loadRdkit, type StructureToolkit } from '@/chem';
import { FIXED_SCALE_BOND_UNITS, LABEL_GLYPH_PX } from '@/chem/contracts';

let toolkit: StructureToolkit;
beforeAll(async () => {
  const shared = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => shared });
  await toolkit.ready();
}, 60_000);

/** The tallest glyph of a drawing (an `atom-N` path), in SVG units, by the test's own reader. */
function glyphHeight(svg: string): number {
  const heights = [...svg.matchAll(/<path\s[^>]*?class=['"]atom-\d+['"][^>]*?\sd=['"]([^'"]+)['"]/g)].map((m) => {
    const ys = (m[1] ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter((_, i) => i % 2 === 1) ?? [0];
    return Math.max(...ys) - Math.min(...ys);
  });
  return Math.max(...heights);
}
const bondUnits = (svg: string): number => {
  const m = /class=['"]bond-0[^>]*\sd=['"]M ([\d.]+),([\d.]+) L ([\d.]+),([\d.]+)/.exec(svg);
  return Math.hypot(Number(m?.[3]) - Number(m?.[1]), Number(m?.[4]) - Number(m?.[2]));
};
const draw = async (smiles: string, bondPx?: number) => {
  const out = await toolkit.depict({ format: 'smiles', value: smiles }, { width: 220, height: 220, showAtomMaps: false, fixedScale: true, ...(bondPx === undefined ? {} : { bondPx }) });
  if (!out.ok) throw new Error(out.error);
  return out.depiction.svg;
};

describe('labels are set apart from the bond length (step 8.5e E1)', () => {
  it.each([28, 34, 36, 40, 54])('at %i px per bond the glyphs are 13 px high as shown', async (px) => {
    const svg = await draw('CC(=O)O', px);
    const shown = glyphHeight(svg) * (px / FIXED_SCALE_BOND_UNITS);
    expect(shown).toBeGreaterThan(LABEL_GLYPH_PX - 0.8);
    expect(shown).toBeLessThan(LABEL_GLYPH_PX + 0.8);
    expect(bondUnits(svg)).toBeGreaterThan(52); // the geometry is still the fixed scale: only the label moved
    expect(bondUnits(svg)).toBeLessThan(56);
  }, 30_000);

  it('without bondPx a drawing is as before (glyph follows the bond: about 16 units)', async () => {
    expect(glyphHeight(await draw('CC(=O)O'))).toBeGreaterThan(15);
  });

  it('a bad bondPx is a programmer error', async () => {
    await expect(draw('CC', 3)).rejects.toThrow();
  });
});

describe('nothing of a drawing is outside its canvas (step 8.5e: a label drawn larger than the canvas was planned for is cut)', () => {
  const extent = (svg: string): { w: number; h: number; x1: number; y1: number; x0: number; y0: number } => {
    const vb = /viewBox=["']0 0 ([\d.]+) ([\d.]+)["']/.exec(svg);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const m of svg.matchAll(/<path\s[^>]*?\sd=['"]([^'"]+)['"]/g)) {
      const n = (m[1] ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      n.forEach((v, i) => (i % 2 === 0 ? xs : ys).push(v));
    }
    return { w: Number(vb?.[1]), h: Number(vb?.[2]), x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  it.each([
    ['cholesterol', 'CC(C)CCCC(C)C1CCC2C1(CCC3C2CC=C4C3(CCC(C4)O)C)C'],
    ['glucose', 'OCC(O)C(O)C(O)C(O)C=O'],
    ['ion pair', '[Na+].CC(C)[O-]'],
    ['ethanoic acid', 'CC(=O)O'],
  ])('%s at every context bond length stays inside its viewBox', async (_name, smiles) => {
    for (const px of [28, 34, 36, 40]) {
      const e = extent(await draw(smiles, px));
      expect(e.x0, `${smiles} at ${px}: left`).toBeGreaterThanOrEqual(-0.5);
      expect(e.y0, `${smiles} at ${px}: top`).toBeGreaterThanOrEqual(-0.5);
      expect(e.x1, `${smiles} at ${px}: right (canvas ${e.w})`).toBeLessThanOrEqual(e.w + 0.5);
      expect(e.y1, `${smiles} at ${px}: bottom (canvas ${e.h})`).toBeLessThanOrEqual(e.h + 0.5);
    }
  }, 30_000);
});
