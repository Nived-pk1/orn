/**
 * The structures modes through REAL RDKit (equation step, part 4): Skeletal, Condensed (every chain carbon labelled with its hydrogens,
 * ring atoms left alone) and Full (every hydrogen drawn as its own atom with a bond). The three drawings of one structure differ; a ring
 * stays a ring (the same ring bonds are drawn in all three); the stored structure never changes (INV-11); every drawing went through
 * the existing sanitiser (the toolkit sanitises every drawing it answers).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, FIXED_SCALE_BOND_UNITS, loadRdkit, type DepictionOptions, type StructureToolkit } from '@/chem';
import type { StructureRep } from '@/core/schema';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
let toolkit: StructureToolkit;

beforeAll(async () => {
  const module = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => module });
  await toolkit.ready();
}, 60_000);

const draw = async (value: string, mode: DepictionOptions['mode']): Promise<string> => {
  const out = await toolkit.depict(smiles(value), { width: 300, height: 200, showAtomMaps: false, ...(mode === undefined ? {} : { mode }) });
  if (!out.ok) throw new Error(`${value} ${mode}: ${out.reason} ${out.error}`);
  return out.depiction.svg;
};
/** The distinct bonds drawn (a bond may be drawn in two coloured halves). */
const bondsOf = (svg: string): number => new Set([...svg.matchAll(/class=["']bond-(\d+) /g)].map((m) => m[1])).size;
/** The atom labels drawn (RDKit draws a label as glyph paths named `atom-N`). */
const labelsOf = (svg: string): number => new Set([...svg.matchAll(/class=["']atom-(\d+)["']/g)].map((m) => m[1])).size;

describe('the three modes of one structure', () => {
  it.each(['CCO', 'CCBr', 'CC(C)=C', 'c1ccccc1CC'])('%s: three different drawings, and the default is skeletal', async (value) => {
    const [skeletal, condensed, full, plain] = await Promise.all([draw(value, 'skeletal'), draw(value, 'condensed'), draw(value, 'full'), draw(value, undefined)]);
    expect(plain).toBe(skeletal);
    expect(condensed).not.toBe(skeletal);
    expect(full).not.toBe(skeletal);
    expect(full).not.toBe(condensed);
  });

  it('Condensed labels every chain carbon (CH3, CH2, OH: two more labels than skeletal ethanol); Full draws every hydrogen', async () => {
    const [skeletal, condensed, full] = await Promise.all([draw('CCO', 'skeletal'), draw('CCO', 'condensed'), draw('CCO', 'full')]);
    expect(labelsOf(skeletal)).toBe(1); // OH
    expect(labelsOf(condensed)).toBe(3); // CH3, CH2, OH
    expect(labelsOf(full)).toBe(7); // six H and the O
    expect(bondsOf(full)).toBe(8); // C-C, C-O, five C-H and the O-H
  });

  it('a ring stays a ring: the same ring bonds are drawn in all three modes (benzene 6, cyclohexanol 6 + the C-O bond)', async () => {
    for (const [value, bonds] of [['c1ccccc1', 6], ['OC1CCCCC1', 7]] as const) {
      const counts = await Promise.all((['skeletal', 'condensed'] as const).map(async (mode) => bondsOf(await draw(value, mode))));
      expect(counts, value).toEqual([bonds, bonds]);
      expect(bondsOf(await draw(value, 'full')), value).toBeGreaterThan(bonds); // the hydrogens add bonds, the ring is still there
    }
    expect(await draw('c1ccccc1', 'condensed')).toBe(await draw('c1ccccc1', 'skeletal')); // nothing in a ring is relabelled
  });

  it('a side chain on a ring is condensed, the ring is not (toluene: only the methyl is labelled)', async () => {
    expect(labelsOf(await draw('Cc1ccccc1', 'condensed'))).toBe(1);
    expect(labelsOf(await draw('Cc1ccccc1', 'skeletal'))).toBe(0);
  });

  it('a mapped structure is drawn in every mode, with the atom maps hidden or shown as asked', async () => {
    const mapped = smiles('[CH3:1][CH2:2][OH:3]');
    for (const mode of ['skeletal', 'condensed', 'full'] as const) {
      const hidden = await toolkit.depict(mapped, { width: 300, height: 200, showAtomMaps: false, mode });
      const shown = await toolkit.depict(mapped, { width: 300, height: 200, showAtomMaps: true, highlightAtomMaps: [2], mode });
      expect(hidden.ok, mode).toBe(true);
      expect(shown.ok, mode).toBe(true);
    }
  });

  it('the stored structure is never changed by a drawing (INV-11)', async () => {
    const structure = Object.freeze({ format: 'smiles', value: 'CCO' } as const);
    for (const mode of ['skeletal', 'condensed', 'full'] as const) await toolkit.depict(structure, { width: 300, height: 200, showAtomMaps: false, mode });
    expect(structure).toEqual({ format: 'smiles', value: 'CCO' });
    const parsed = await toolkit.parse(structure);
    expect(parsed.ok && parsed.facts.formula).toBe('C2H6O'); // still the same molecule after the Full drawing added hydrogens to a copy
    expect(parsed.ok && parsed.facts.heavyAtomCount).toBe(3);
  });
});

describe('the fixed scale (equation step, part 5): one bond length for every drawing', () => {
  const fixed = async (value: string, mode: DepictionOptions['mode'] = 'skeletal') => {
    const out = await toolkit.depict(smiles(value), { width: 300, height: 200, showAtomMaps: false, fixedScale: true, mode });
    if (!out.ok) throw new Error(`${value}: ${out.reason} ${out.error}`);
    return out.depiction;
  };
  /** The lengths of the bonds drawn between two atoms that carry no label (no end is cut short by a letter). */
  const plainBonds = (svg: string): number[] =>
    [...svg.matchAll(/<path class=["']bond-\d+ atom-\d+ atom-\d+["'] d=["']M ([\d.-]+),([\d.-]+) L ([\d.-]+),([\d.-]+)["']/g)].map((m) => Math.hypot(Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])));

  it('a chain, a ring and a long chain are drawn with the same bond length (within 1%), whatever their size; the nominal bond is FIXED_SCALE_BOND_UNITS', async () => {
    const lengths: number[] = [];
    for (const value of ['CCC', 'C'.repeat(20), 'C1CCCCC1', 'Cc1ccccc1']) {
      const drawing = await fixed(value);
      const bonds = plainBonds(drawing.svg).sort((a, b) => a - b);
      const median = bonds[Math.floor(bonds.length / 2)] as number;
      lengths.push(median);
      expect(Math.abs(median - FIXED_SCALE_BOND_UNITS) / FIXED_SCALE_BOND_UNITS, value).toBeLessThan(0.02);
    }
    expect((Math.max(...lengths) - Math.min(...lengths)) / (lengths[0] as number)).toBeLessThan(0.015);
  });

  it('the answer says the real size of the drawing (its viewBox), not the area that was asked for', async () => {
    const small = await fixed('CCO');
    const long = await fixed('C'.repeat(20));
    expect(long.width).toBeGreaterThan(small.width * 5);
    expect(small.svg).toContain(`viewBox="0 0 ${small.width} ${small.height}"`);
    expect(long.svg).toContain(`viewBox="0 0 ${long.width} ${long.height}"`);
  });

  it('works with the structures modes too: Condensed and Full at the same scale, rings unchanged', async () => {
    const [skeletal, condensed, full] = await Promise.all([fixed('CCBr', 'skeletal'), fixed('CCBr', 'condensed'), fixed('CCBr', 'full')]);
    for (const drawing of [skeletal, condensed, full]) expect(drawing.width).toBeGreaterThan(0);
    expect(condensed.svg).not.toBe(skeletal.svg);
    expect(full.svg).not.toBe(skeletal.svg);
    const benzene = await Promise.all([fixed('c1ccccc1', 'skeletal'), fixed('c1ccccc1', 'condensed')]);
    expect(benzene[1].svg).toBe(benzene[0].svg);
  });

  it('a drawing that is not fixed keeps the size that was asked for', async () => {
    const out = await toolkit.depict(smiles('CCO'), { width: 300, height: 200, showAtomMaps: false });
    expect(out.ok && [out.depiction.width, out.depiction.height]).toEqual([300, 200]);
  });
});
