/**
 * Facts from a molecule (step 4.3a): what is read from RDKit's JSON, stereo tags and SMILES, the Hill formula, the atom map
 * reader, and the rule that a fact RDKit does not give is LEFT UNDEFINED with a warning, never guessed. Real RDKit values are
 * checked in tests/integration/chem-rdkit.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { createFakeRdkit, ETHANOL_SPEC, trap, type FakeMolSpec } from '@/test-support/fake-rdkit';
import { MAX_ATOMIC_NUMBER, symbolOf } from './elements';
import { factsOf } from './facts';
import { atomMapsOf, indexesOfMaps, outputOrder, smilesAtoms } from './smiles-atoms';

const DEFAULTS = { atom: { z: 6, impHs: 0, chg: 0, nRad: 0, isotope: 0, stereo: 'unspecified' } };
const json = (atoms: unknown[], extensions: unknown[] = [{ name: 'rdkitRepresentation' }], defaults: unknown = DEFAULTS): string =>
  JSON.stringify({ rdkitjson: { version: 12 }, defaults, molecules: [{ atoms, bonds: [], extensions }] });

function factsFor(spec: FakeMolSpec) {
  const fake = createFakeRdkit({ x: spec });
  const mol = fake.module.get_mol('x');
  if (mol === null) throw new Error('no molecule');
  return factsOf(mol);
}

describe('elements', () => {
  it('has 118 symbols in atomic-number order', () => {
    expect(MAX_ATOMIC_NUMBER).toBe(118);
    expect([1, 2, 6, 8, 11, 17, 26, 47, 79, 92, 118].map((z) => symbolOf(z))).toEqual(['H', 'He', 'C', 'O', 'Na', 'Cl', 'Fe', 'Ag', 'Au', 'U', 'Og']);
  });

  it('answers undefined for a dummy atom or a number outside the table', () => {
    for (const z of [0, -1, 119, 1.5, Number.NaN]) expect(symbolOf(z)).toBeUndefined();
  });
});

describe('ring count (equation step, part 5)', () => {
  const withBonds = (atoms: unknown[], bonds: [number, number][]): string =>
    JSON.stringify({ rdkitjson: { version: 12 }, defaults: DEFAULTS, molecules: [{ atoms, bonds: bonds.map((atomsOf) => ({ atoms: atomsOf })), extensions: [{ name: 'rdkitRepresentation' }] }] });
  const ringsOf = (atoms: unknown[], bonds: [number, number][]) => factsFor({ ...ETHANOL_SPEC, json: withBonds(atoms, bonds) }).ringCount;

  it('is bonds - atoms + connected pieces: a chain 0, a ring 1, two fused rings 2, two separate rings 2', () => {
    expect(ringsOf([{}, {}, {}], [[0, 1], [1, 2]])).toBe(0);
    expect(ringsOf([{}, {}, {}], [[0, 1], [1, 2], [2, 0]])).toBe(1);
    expect(ringsOf([{}, {}, {}, {}], [[0, 1], [1, 2], [2, 0], [2, 3], [3, 0]])).toBe(2); // two triangles sharing an edge
    expect(ringsOf([{}, {}, {}, {}, {}, {}], [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3]])).toBe(2);
  });

  it('a lone atom, and a molecule whose JSON has no bonds at all, have no rings (and no warning for it)', () => {
    expect(ringsOf([{}], [])).toBe(0);
    const none = factsFor({ ...ETHANOL_SPEC, json: JSON.stringify({ rdkitjson: { version: 12 }, defaults: DEFAULTS, molecules: [{ atoms: [{}], extensions: [{ name: 'rdkitRepresentation' }] }] }) });
    expect(none.ringCount).toBe(0);
    expect(none.warnings.join(' ')).not.toContain('ringCount');
  });

  it('a bond that names an atom the molecule does not have leaves the count undefined, with a warning, never a guess', () => {
    const out = factsFor({ ...ETHANOL_SPEC, json: withBonds([{}, {}], [[0, 7]]) });
    expect(out.ringCount).toBeUndefined();
    expect(out.warnings.join(' ')).toContain('ringCount');
  });
});

describe('carbon count (equation step, part 5)', () => {
  const carbonsOf = (atoms: unknown[], defaults: unknown = DEFAULTS) => factsFor({ ...ETHANOL_SPEC, json: json(atoms, undefined, defaults) });

  it('counts the atoms of atomic number 6, the default element included (isotopes and charges are still carbon)', () => {
    expect(carbonsOf([{}, {}, { z: 8 }]).carbonCount).toBe(2);
    expect(carbonsOf([{ z: 8 }, { z: 1 }]).carbonCount).toBe(0);
    expect(carbonsOf([{ z: 6, chg: 1 }, { z: 6, isotope: 13 }, { z: 0 }]).carbonCount).toBe(2);
  });

  it('is undefined, with a warning, when RDKit gave no default atom values and an atom has no z (never a guess)', () => {
    const out = carbonsOf([{}, { z: 8 }], {});
    expect(out.carbonCount).toBeUndefined();
    expect(out.warnings.join(' ')).toContain('carbonCount');
  });
});

describe('Hill formula, charge, aromatic', () => {
  it('carbon first, hydrogen second, the rest alphabetical; counts of 1 are omitted; implicit hydrogens included', () => {
    const acid = factsFor({ ...ETHANOL_SPEC, json: json([{ impHs: 3 }, {}, { z: 8 }, { z: 8, impHs: 1 }]) });
    expect(acid.formula).toBe('C2H4O2');
    const salt = factsFor({ ...ETHANOL_SPEC, json: json([{ impHs: 3 }, { z: 8 }, { z: 11, chg: 1 }, { z: 17, chg: -1 }, { z: 7, impHs: 2 }]) });
    expect(salt.formula).toBe('CH5ClNNaO'); // C, H, then Cl, N, Na, O
    expect(salt.charge).toBe(0);
  });

  it('with no carbon every symbol is alphabetical, hydrogen included; explicit hydrogen atoms count', () => {
    expect(factsFor({ ...ETHANOL_SPEC, json: json([{ z: 1 }, { z: 1 }]) }).formula).toBe('H2');
    expect(factsFor({ ...ETHANOL_SPEC, json: json([{ z: 8, impHs: 2 }]) }).formula).toBe('H2O');
    expect(factsFor({ ...ETHANOL_SPEC, json: json([{ z: 7, impHs: 3 }, { z: 17, impHs: 1 }]) }).formula).toBe('ClH4N');
  });

  it('charge is the sum of formal charges, from the defaults or the atom', () => {
    expect(factsFor({ ...ETHANOL_SPEC, json: json([{ z: 8, chg: -1 }, { z: 11, chg: 1 }, { z: 20, chg: 2 }]) }).charge).toBe(2);
  });

  it('a dummy atom or an element outside the table leaves the formula undefined, with a warning; the other facts stay', () => {
    const out = factsFor({ ...ETHANOL_SPEC, json: json([{ z: 0 }, {}]) });
    expect(out.formula).toBeUndefined();
    expect(out.charge).toBe(0);
    expect(out.warnings.join(' ')).toContain('formula');
  });

  it('aromatic is read from the representation extension: any aromatic atom is true, none is false, no extension is undefined', () => {
    const ext = (aromaticAtoms?: number[]) => [{ name: 'rdkitRepresentation', ...(aromaticAtoms === undefined ? {} : { aromaticAtoms }) }];
    expect(factsFor({ ...ETHANOL_SPEC, json: json([{}], ext([0, 1])) }).aromatic).toBe(true);
    expect(factsFor({ ...ETHANOL_SPEC, json: json([{}], ext()) }).aromatic).toBe(false);
    const unknown = factsFor({ ...ETHANOL_SPEC, json: json([{}], []) });
    expect(unknown.aromatic).toBeUndefined();
    expect(unknown.warnings.join(' ')).toContain('aromatic');
  });

  it('JSON without the default atom values gives no formula and no charge, and says so', () => {
    const out = factsFor({ ...ETHANOL_SPEC, json: json([{}], undefined, {}) });
    expect(out.formula).toBeUndefined();
    expect(out.charge).toBeUndefined();
    expect(out.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe('stereo', () => {
  const stereo = (atoms: unknown[], bonds: unknown[]) => JSON.stringify({ CIP_atoms: atoms, CIP_bonds: bonds });

  it('counts configured and unconfigured centres apart, and reports a specified double bond', () => {
    const out = factsFor({ ...ETHANOL_SPEC, stereo: stereo([[1, '(S)'], [3, '(?)'], [5, '(r)'], [7, '(?)']], [[1, 2, '(E)']]) });
    expect([out.specifiedStereocentres, out.unspecifiedStereocentres, out.hasDoubleBondStereo]).toEqual([2, 2, true]);
  });

  it('counts the CIP labels by letter (R, S, lower-case r, s, E, Z); unspecified ones are not counted; undefined when no tags', () => {
    const out = factsFor({ ...ETHANOL_SPEC, stereo: stereo([[1, '(S)'], [3, '(R)'], [4, '(R)'], [5, '(r)'], [7, '(?)'], [8, '(s)']], [[1, 2, '(E)'], [3, 4, '(Z)'], [5, 6, '(?)']]) });
    expect(out.cipCounts).toEqual({ R: 2, S: 1, r: 1, s: 1, E: 1, Z: 1 });
    expect(factsFor({ ...ETHANOL_SPEC, stereo: '{"x":1}' }).cipCounts).toBeUndefined();
  });

  it('an unconfigured double bond is not specified stereo', () => {
    expect(factsFor({ ...ETHANOL_SPEC, stereo: stereo([], [[1, 2, '(?)']]) }).hasDoubleBondStereo).toBe(false);
  });

  it('tags RDKit refuses to give (an exception, or a shape it does not recognise) leave the three facts undefined, with a warning', () => {
    for (const spec of [{ ...ETHANOL_SPEC, throws: { get_stereo_tags: new Error('stereo failed') } }, { ...ETHANOL_SPEC, stereo: '{"x":1}' }, { ...ETHANOL_SPEC, stereo: 'not json' }]) {
      const out = factsFor(spec);
      expect(out.specifiedStereocentres).toBeUndefined();
      expect(out.unspecifiedStereocentres).toBeUndefined();
      expect(out.hasDoubleBondStereo).toBeUndefined();
      expect(out.warnings.join(' ')).toContain('stereo');
      expect(out.formula).toBe('C2H6O'); // the other facts are unaffected
    }
  });
});

describe('never guessed, never swallowed', () => {
  it('a fact that fails is undefined and named in a warning; each of the others is still given', () => {
    const out = factsFor({ ...ETHANOL_SPEC, throws: { get_num_atoms: new Error('count failed') } });
    expect(out.heavyAtomCount).toBeUndefined();
    expect(out.warnings).toEqual([expect.stringContaining('heavyAtomCount')]);
    expect(out.canonicalSmiles).toBe('CCO');
  });

  it('a WASM trap is NOT caught here: it propagates so the adapter can drop the module', () => {
    expect(() => factsFor({ ...ETHANOL_SPEC, throws: { get_json: trap() } })).toThrow(WebAssembly.RuntimeError);
    expect(() => factsFor({ ...ETHANOL_SPEC, throws: { get_smiles: new RangeError('stack') } })).toThrow(RangeError);
  });

  it('an empty canonical SMILES is undefined (not an empty string), and the map numbers are then empty with a warning', () => {
    const out = factsFor({ ...ETHANOL_SPEC, smiles: '' });
    expect(out.canonicalSmiles).toBeUndefined();
    expect(out.atomMaps).toEqual([]);
    expect(out.warnings.join(' ')).toContain('canonicalSmiles');
  });

  it('at most ten warnings are kept', () => {
    const out = factsFor({ smiles: '', json: '', stereo: '', heavy: Number.NaN });
    expect(out.warnings.length).toBeLessThanOrEqual(10);
    expect(out.warnings.length).toBeGreaterThan(0);
  });
});

describe('atom map numbers in RDKit SMILES', () => {
  it('reads the :n of bracket atoms, in output order, and ignores organic-subset atoms, rings, branches and bonds', () => {
    const atoms = smilesAtoms('[CH3:1][C@H:2](N)C(=O)[O-:12].Cl[Na+:7]');
    expect(atoms?.map((a) => a.map)).toEqual([1, 2, undefined, undefined, undefined, 12, undefined, 7]);
    expect(atomMapsOf(atoms ?? [])).toEqual([1, 2, 7, 12]);
  });

  it('keeps repeated numbers (a repeat is something a check may report) and sorts ascending', () => {
    expect(atomMapsOf(smilesAtoms('[CH3:3][CH2:1][CH3:3]') ?? [])).toEqual([1, 3, 3]);
  });

  it('a SMILES with no bracket atom, a ring closure number and a %nn closure have none', () => {
    expect(atomMapsOf(smilesAtoms('C1CC1%12CCBrCl') ?? [])).toEqual([]);
    expect(smilesAtoms('C1CC1%12CCBrCl')).toHaveLength(7); // C C C C C Br Cl
  });

  it('an unclosed bracket is not readable: undefined, not a guess', () => {
    expect(smilesAtoms('C[CH3:1')).toBeUndefined();
  });

  it('a colon-number that is not the last thing in the bracket is not a map number', () => {
    expect(smilesAtoms('[13CH3:1]')?.map((a) => a.map)).toEqual([1]);
    expect(smilesAtoms('[Cl-]')?.map((a) => a.map)).toEqual([undefined]);
  });

  it('the output order gives the atom index of each token; a highlight by map number finds it', () => {
    const atoms = smilesAtoms('OC[CH2:2][CH3:1]') ?? [];
    expect(outputOrder('[3,2,1,0]')).toEqual([3, 2, 1, 0]);
    expect(indexesOfMaps(atoms, [1], [3, 2, 1, 0])).toEqual([0]);
    expect(indexesOfMaps(atoms, [1, 2], undefined)).toEqual([2, 3]);
    expect(indexesOfMaps(atoms, [9], undefined)).toEqual([]);
    expect(indexesOfMaps(atoms, [1], [0, 1])).toBeUndefined(); // the order does not line up with the SMILES
    expect(outputOrder('')).toBeUndefined();
  });
});
