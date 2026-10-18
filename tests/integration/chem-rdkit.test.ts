/**
 * The RDKit adapter over REAL RDKit MinimalLib in Node (step 4.3a, Phase 4 DoD): every species of the demo parses (the one with
 * an invalid SMILES answers `invalid`), depicts, and its sanitised depiction keeps every drawing element RDKit produced; facts
 * match hand-computed values; a WASM trap answers `unavailable` and the toolkit recovers. RDKit is loaded once for this file
 * (the shared module) plus a fresh one for the trap tests, which may leave their module unusable.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, inputProblem, loadRdkit, sanitizeSvg, type RdkitModule, type StructureToolkit } from '@/chem';
import type { StructureRep, Species } from '@/core/schema';
import { buildDemoDocument } from '@/test-support/demo';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const DRAW = { width: 300, height: 200, showAtomMaps: true } as const;

let shared: RdkitModule;
let toolkit: StructureToolkit;
const demo = buildDemoDocument().records.species as readonly Species[];
const withStructure = demo.filter((s) => s.structure !== undefined);

beforeAll(async () => {
  shared = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => shared });
  await toolkit.ready();
}, 60_000);

async function factsOf(value: string) {
  const out = await toolkit.parse(smiles(value));
  if (!out.ok) throw new Error(`${value}: ${out.reason} ${out.error}`);
  return out.facts;
}

describe('the demo dataset through real RDKit', () => {
  it('the demo has species with structures and one with none, so the loop below is not vacuous', () => {
    expect(withStructure.length).toBeGreaterThan(60);
    expect(demo.length).toBeGreaterThan(withStructure.length);
  });

  it('every species parses, except the one with the invalid SMILES, which answers reason "invalid"', async () => {
    const results = await Promise.all(withStructure.map(async (s) => ({ id: s.id, structure: s.structure as StructureRep, out: await toolkit.parse(s.structure as StructureRep) })));
    const bad = results.filter((r) => !r.out.ok);
    expect(bad.map((r) => r.id)).toEqual(['spc_invalid-smiles-demo']);
    expect(bad[0]?.out).toMatchObject({ ok: false, reason: 'invalid' });
    for (const { id, out } of results) {
      if (!out.ok) continue;
      expect(out.facts.canonicalSmiles, id).toBeTruthy();
      expect(out.facts.formula, id).toMatch(/^[A-Z][A-Za-z0-9]*$/);
      expect(out.facts.warnings, id).toEqual([]);
      expect(out.facts.atomMaps, id).toEqual([]);
      // Every fact is given (none is left undefined) for every species of the demo.
      for (const fact of ['charge', 'heavyAtomCount', 'specifiedStereocentres', 'unspecifiedStereocentres', 'hasDoubleBondStereo', 'aromatic'] as const) {
        expect(out.facts[fact], `${id}: ${fact}`).toBeDefined();
      }
    }
  });

  it('canonical SMILES is a fixed point: parsing it again gives the same canonical SMILES', async () => {
    for (const s of withStructure) {
      const first = await toolkit.parse(s.structure as StructureRep);
      if (!first.ok) continue;
      const again = await toolkit.parse(smiles(first.facts.canonicalSmiles ?? ''));
      expect(again.ok && again.facts.canonicalSmiles, s.id).toBe(first.facts.canonicalSmiles);
    }
  });

  it('every species that parses depicts, and the sanitised drawing keeps EVERY drawing element RDKit produced', async () => {
    let checked = 0;
    for (const s of withStructure) {
      const structure = s.structure as StructureRep;
      if (!(await toolkit.parse(structure)).ok) continue;
      const raw = shared.get_mol(structure.value);
      if (raw === null) throw new Error(`${s.id}: shared module cannot read it`);
      const rawSvg = raw.get_svg_with_highlights(JSON.stringify({ width: 300, height: 200 }));
      raw.delete();

      const sanitised = sanitizeSvg(rawSvg);
      if (!sanitised.ok) throw new Error(`${s.id}: ${sanitised.message}`);

      // Counted independently of the sanitiser: the drawing elements outside comments and <metadata>.
      const visible = rawSvg.replace(/<!--[\s\S]*?-->/g, '').replace(/<metadata>[\s\S]*?<\/metadata>/g, '');
      const drawing = (visible.match(/<(?:svg|g|path|rect|circle|ellipse|line|polyline|polygon|text|tspan)[\s>/]/g) ?? []).length;
      const inMetadata = ((rawSvg.match(/<metadata>[\s\S]*?<\/metadata>/g) ?? []).join('').match(/<[A-Za-z][^\s>/]*/g) ?? []).length;
      expect(drawing, `${s.id}: RDKit drew nothing`).toBeGreaterThanOrEqual(3);
      expect(sanitised.report.elementsKept, `${s.id}: every drawing element is kept`).toBe(drawing);
      expect(sanitised.report.elementsDropped, `${s.id}: only the metadata elements are dropped`).toBe(inMetadata);
      expect(sanitised.report.commentsDropped, s.id).toBe((rawSvg.match(/<!--/g) ?? []).length);
      expect(sanitised.report.processingInstructionsDropped, s.id).toBe(rawSvg.startsWith('<?xml') ? 1 : 0);
      expect(sanitised.report.stylesRefused + sanitised.report.styleDeclarationsDropped + sanitised.report.textDropped, `${s.id}: nothing else is dropped`).toBe(0);

      // The adapter's own depiction is exactly the sanitised drawing.
      const out = await toolkit.depict(structure, DRAW);
      if (!out.ok) throw new Error(`${s.id}: ${out.reason} ${out.error}`);
      expect(out.depiction.svg, s.id).toBe(sanitised.svg);
      expect([out.depiction.width, out.depiction.height]).toEqual([300, 200]);
      checked += 1;
    }
    expect(checked).toBe(withStructure.length - 1);
  }, 120_000);

  it('the species with the invalid SMILES depicts as `invalid` too, and one with no structure has nothing to parse', async () => {
    const invalid = demo.find((s) => s.id === 'spc_invalid-smiles-demo');
    expect(invalid?.structure).toBeDefined();
    expect(await toolkit.depict(invalid?.structure as StructureRep, DRAW)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(demo.find((s) => s.id === 'spc_cholesterol')?.structure).toBeUndefined();
  });
});

describe('facts, checked by hand', () => {
  it.each([
    ['CCO', { formula: 'C2H6O', charge: 0, heavyAtomCount: 3, aromatic: false }],
    ['C', { formula: 'CH4', heavyAtomCount: 1 }],
    ['c1ccccc1', { formula: 'C6H6', aromatic: true, heavyAtomCount: 6 }],
    ['Clc1ccccc1', { formula: 'C6H5Cl', aromatic: true }],
    ['O', { formula: 'H2O', heavyAtomCount: 1 }],
    ['[H][H]', { formula: 'H2', heavyAtomCount: 0 }],
    ['N#N', { formula: 'N2' }],
    ['[OH3+]', { formula: 'H3O', charge: 1 }],
    ['[Na+].CC(=O)[O-]', { formula: 'C2H3NaO2', charge: 0, heavyAtomCount: 5 }],
    ['[Na+].[OH-]', { formula: 'HNaO', charge: 0 }],
    ['[Cl-].N#[N+]c1ccccc1', { formula: 'C6H5ClN2', charge: 0, aromatic: true }],
    ['[Pd]', { formula: 'Pd', heavyAtomCount: 1 }],
    ['O=C(OOC(=O)c1ccccc1)c1ccccc1', { formula: 'C14H10O4', heavyAtomCount: 18 }],
  ])('%s', async (value, expected) => {
    expect(await factsOf(value)).toMatchObject(expected);
  });

  it.each([
    ['O', 0],
    ['[H][H]', 0],
    ['OS(=O)(=O)O', 0],
    ['CO', 1],
    ['CCO', 2],
    ['[Na+].[OH-]', 0],
    ['c1ccccc1', 6],
    ['O=C=O', 1],
  ])('carbon count of %s is %i (from the atoms of RDKit)', async (value, carbons) => {
    expect((await factsOf(value)).carbonCount).toBe(carbons);
  });

  it('stereo: centres and double bonds are counted as specified or not', async () => {
    expect(await factsOf('C[C@@H](Br)CC')).toMatchObject({ specifiedStereocentres: 1, unspecifiedStereocentres: 0, hasDoubleBondStereo: false });
    expect(await factsOf('CC(N)C(=O)O')).toMatchObject({ specifiedStereocentres: 0, unspecifiedStereocentres: 1 });
    expect(await factsOf('C/C=C\\C')).toMatchObject({ hasDoubleBondStereo: true, specifiedStereocentres: 0 });
    expect(await factsOf('CC=CC')).toMatchObject({ hasDoubleBondStereo: false });
    expect(await factsOf('CCO')).toMatchObject({ specifiedStereocentres: 0, unspecifiedStereocentres: 0 });
  });

  it('atom map numbers are read, ascending; they stay in the canonical SMILES', async () => {
    const facts = await factsOf('[CH3:3][CH2:1][OH:2]');
    expect(facts.atomMaps).toEqual([1, 2, 3]);
    expect(facts.canonicalSmiles).toContain(':3]');
    expect(facts.formula).toBe('C2H6O');
  });

  it('a CXSMILES with an extension parses; a molfile parses and keeps its formula', async () => {
    expect(await toolkit.parse({ format: 'cxsmiles', value: 'C[C@H](N)C(=O)O |&1:1|' })).toMatchObject({ ok: true, facts: { formula: 'C3H7NO2' } });
    const molfile = ['', '  RDKit          2D', '', '  3  2  0  0  0  0  0  0  0  0999 V2000', '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0', '    1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0', '    2.5981    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0', '  1  2  1  0', '  2  3  1  0', 'M  END', ''].join('\n');
    expect(inputProblem({ format: 'molfile', value: molfile })).toBeUndefined();
    expect(await toolkit.parse({ format: 'molfile', value: molfile })).toMatchObject({ ok: true, facts: { formula: 'C2H6O', heavyAtomCount: 3 } });
  });
});

describe('depiction options', () => {
  it('atom maps are drawn when shown and absent when hidden; a highlight changes the drawing; a map that is not there changes nothing', async () => {
    const mapped = smiles('[CH3:1][CH2:2][OH:3]');
    const shown = await toolkit.depict(mapped, DRAW);
    const hidden = await toolkit.depict(mapped, { ...DRAW, showAtomMaps: false });
    const plain = await toolkit.depict(smiles('CCO'), DRAW);
    const lit = await toolkit.depict(mapped, { ...DRAW, highlightAtomMaps: [2] });
    const litAndHidden = await toolkit.depict(mapped, { ...DRAW, showAtomMaps: false, highlightAtomMaps: [2] });
    const none = await toolkit.depict(mapped, { ...DRAW, highlightAtomMaps: [9] });
    if (!shown.ok || !hidden.ok || !plain.ok || !lit.ok || !litAndHidden.ok || !none.ok) throw new Error('a depiction failed');
    expect(hidden.depiction.svg).not.toBe(shown.depiction.svg);
    expect(hidden.depiction.svg.length).toBeLessThan(shown.depiction.svg.length); // the ":1" labels are gone
    expect(lit.depiction.svg).not.toBe(shown.depiction.svg);
    expect(lit.depiction.svg).toContain('<ellipse'); // RDKit's highlight is an ellipse behind the atom
    expect(litAndHidden.depiction.svg).toContain('<ellipse');
    expect(none.depiction.svg).toBe(shown.depiction.svg);
    expect(new Set([shown, hidden, lit, litAndHidden].map((d) => d.depiction.key)).size).toBe(4);
  });

  it('a structure with no map numbers is drawn the same whatever is asked about maps', async () => {
    const a = await toolkit.depict(smiles('CCO'), DRAW);
    const b = await toolkit.depict(smiles('CCO'), { ...DRAW, showAtomMaps: false, highlightAtomMaps: [1] });
    expect(a.ok && b.ok && a.depiction.svg).toBe(b.ok && b.depiction.svg);
  });

  it('a large canvas and a small one are drawn at their sizes', async () => {
    for (const [width, height] of [[16, 16], [1200, 900]] as const) {
      const out = await toolkit.depict(smiles('c1ccccc1O'), { width, height, showAtomMaps: true });
      if (!out.ok) throw new Error(out.error);
      expect(out.depiction.svg).toContain(`width="${width}px"`);
      expect(out.depiction.svg).toContain(`viewBox="0 0 ${width} ${height}"`);
    }
  });
});

describe('SMARTS', () => {
  it('matches by substructure and answers invalid_smarts for a pattern RDKit cannot read', async () => {
    expect(await toolkit.matchesSmarts(smiles('CCO'), '[CX4][OX2H]')).toEqual({ ok: true, matches: true });
    expect(await toolkit.matchesSmarts(smiles('CC(=O)O'), '[CX4][OX2H]')).toEqual({ ok: true, matches: false });
    expect(await toolkit.matchesSmarts(smiles('CC(=O)O'), 'C(=O)[OX2H1]')).toEqual({ ok: true, matches: true });
    expect(await toolkit.matchesSmarts(smiles('CCO'), '[[[')).toMatchObject({ ok: false, reason: 'invalid_smarts' });
    expect(await toolkit.matchesSmarts(smiles('C1CC('), '[C]')).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

describe('limits and hostile input (SECURITY §3)', () => {
  it('a 20,000-character SMILES is accepted and parses; one character more is invalid before RDKit sees it', async () => {
    const atCap = `${'C.'.repeat(9_999)}CC`;
    expect(atCap).toHaveLength(20_000);
    expect(await toolkit.parse(smiles(atCap))).toMatchObject({ ok: true, facts: { heavyAtomCount: 10_001 } });
    expect(await toolkit.parse(smiles(`${atCap}C`))).toMatchObject({ ok: false, reason: 'invalid' });
  }, 60_000);

  it('malformed SMILES are `invalid`, not a crash: unclosed ring, unclosed branch, bad valence, junk, empty brackets', async () => {
    for (const value of ['C1CC', 'C1CC(', 'C(C)(C)(C)(C)C', 'not a smiles ((((', '[]', '[[[[', 'C=', '%%%', 'C[C@', '[Xx]']) {
      expect(await toolkit.parse(smiles(value)), value).toMatchObject({ ok: false, reason: 'invalid' });
    }
  });

  it('an input that crashes the WASM answers `unavailable` (never `invalid`), and the toolkit loads a fresh module and goes on', async () => {
    const fresh = createRdkitToolkit({ load: () => loadRdkit() });
    const crashing = smiles('C'.repeat(700)); // RDKit's stack overflows writing the SMILES of a 700-atom chain
    const out = await fresh.parse(crashing);
    expect(out).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(out.ok ? '' : out.error).toContain('crashed');
    expect((await fresh.parse(smiles('CCO'))).ok).toBe(true); // a new module was loaded
    expect((await fresh.depict(smiles('CCO'), DRAW)).ok).toBe(true);
  }, 60_000);
});
