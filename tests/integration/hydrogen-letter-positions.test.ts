/**
 * Step 8.5c C2 (8.5b review answer 1): the position of a labelled atom is its ELEMENT LETTER for every hydrogen-carrying label, on real
 * RDKit, bonded and unbonded: HO-, HS-, H2O, NH3, NH4+, H3O+, NH2- ("H2N-" when RDKit writes the hydrogens first) and the bonded forms.
 * The expected glyph is written per fixture from the measured left-to-right glyph order of the drawing (not from the code under test):
 * `letter` is the index of the element letter among the label's glyphs sorted by x.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, loadRdkit, type StructureToolkit } from '@/chem';

let toolkit: StructureToolkit;
beforeAll(async () => {
  const shared = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => shared });
  await toolkit.ready();
}, 60_000);

interface Glyph {
  readonly cls: string;
  readonly x0: number;
  readonly x1: number;
}
function glyphsOf(svg: string): Glyph[] {
  return [...svg.matchAll(/<path\s[^>]*?class=['"](atom-\d+)['"][^>]*?\sd=['"]([^'"]+)['"]/g)].map((m) => {
    const n = (m[2] ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const xs = n.filter((_, i) => i % 2 === 0);
    return { cls: m[1] as string, x0: Math.min(...xs), x1: Math.max(...xs) };
  });
}

/** [SMILES, atom label as drawn, index of the element letter among the label's glyphs (left to right)] for the atom with map 1. */
const CASES: readonly (readonly [string, string, number])[] = [
  ['[OH-:1]', 'HO-', 1],
  ['[SH-:1]', 'HS-', 1],
  ['[OH2:1]', 'H2O', 2],
  ['[NH3:1]', 'NH3', 0],
  ['[NH4+:1]', 'NH4+', 0],
  ['[OH3+:1]', 'H3O+', 2],
  ['[NH2-:1]', 'NH2- (written H2N- by some drawings)', 0],
  ['[OH:1][CH3:2]', 'OH bonded', 0],
  ['[SH:1][CH3:2]', 'SH bonded', 0],
  ['[NH3+:1][CH3:2]', 'NH3+ bonded', 0],
  ['[OH2+:1][CH3:2]', 'OH2+ bonded', 0],
  ['[NH-:1][CH3:2]', 'NH- bonded', 0],
  ['[CH3:3][CH2:2][NH3+:1]', 'NH3+ at the end of a chain', 0],
  ['[H:2][OH:1]', 'HO bonded on its right (a mapped hydrogen)', 1],
  ['[H:2][NH2:1]', 'H2N bonded on its right', 2],
];

describe('the element letter is the position of every hydrogen-carrying label (real RDKit)', () => {
  for (const [value, words, letter] of CASES) {
    it(`${value} (${words})`, async () => {
      const out = await toolkit.depict({ format: 'smiles', value }, { width: 120, height: 80, showAtomMaps: false, fixedScale: true, atomPositions: true });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const atom = out.depiction.atoms?.find((a) => a.map === 1);
      expect(atom).toBeDefined();
      if (atom === undefined) return;
      const all = glyphsOf(out.depiction.svg);
      // the glyphs of the label the position sits in: the class of the glyph nearest the position, then that class's glyphs left to right
      const near = [...all].sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - atom.x) - Math.abs((b.x0 + b.x1) / 2 - atom.x))[0] as Glyph;
      const label = all.filter((g) => g.cls === near.cls).sort((a, b) => a.x0 - b.x0);
      const expected = label[letter] as Glyph;
      expect(atom.x, `${value}: x ${atom.x} is in glyph ${letter} (${expected.x0}..${expected.x1})`).toBeGreaterThanOrEqual(expected.x0 - 0.5);
      expect(atom.x).toBeLessThanOrEqual(expected.x1 + 0.5);
    });
  }
});
