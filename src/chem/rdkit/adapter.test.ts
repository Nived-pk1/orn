/**
 * The RDKit adapter over a FAKE module (step 4.3a): lazy loading, the input caps BEFORE RDKit, the failure reasons (only
 * `invalid` means the structure is bad), a trap dropping the module, every object freed on every path, and depiction that always
 * goes through the sanitiser. Real RDKit is tests/integration/chem-rdkit.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { LIMITS, type StructureRep } from '@/core/schema';
import { createFakeRdkit, ETHANOL_SPEC, trap, type FakeRdkit } from '@/test-support/fake-rdkit';
import { MAX_SVG_INPUT_CHARS } from '../svg/sanitize';
import { createRdkitToolkit, inputProblem } from './adapter';
import type { RdkitModule } from './types';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const DRAW = { width: 200, height: 150, showAtomMaps: true } as const;

function toolkitOver(fake: FakeRdkit) {
  const loads = { count: 0 };
  const toolkit = createRdkitToolkit({
    load: async () => {
      loads.count += 1;
      return fake.module;
    },
  });
  return { toolkit, loads };
}

describe('loading', () => {
  it('nothing is loaded until the first call, concurrent first calls share one load, and ready() never rejects', async () => {
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC });
    const { toolkit, loads } = toolkitOver(fake);
    expect(loads.count).toBe(0);
    expect(toolkit.version).toBe('not loaded');
    await Promise.all([toolkit.parse(smiles('CCO')), toolkit.parse(smiles('CCO')), toolkit.ready()]);
    expect(loads.count).toBe(1);
    expect(toolkit.version).toBe('fake-2026.03');
    expect(toolkit.name).toBe('rdkit-minimallib');
  });

  it('a load that fails answers `unavailable` (not `invalid`), is not remembered, and the next call tries again', async () => {
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC });
    let attempts = 0;
    const toolkit = createRdkitToolkit({
      load: async (): Promise<RdkitModule> => {
        attempts += 1;
        if (attempts <= 2) throw new Error('wasm fetch failed');
        return fake.module;
      },
    });
    await expect(toolkit.ready()).resolves.toBeUndefined(); // the first attempt failed; ready() still resolves
    const first = await toolkit.parse(smiles('CCO')); // the second attempt fails too
    expect(first).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(first.ok ? '' : first.error).toContain('wasm fetch failed');
    expect((await toolkit.parse(smiles('CCO'))).ok).toBe(true); // the third succeeds: a failure is not remembered
    expect(attempts).toBe(3);
  });

  it('every operation answers `unavailable` when there is no module', async () => {
    const toolkit = createRdkitToolkit({ load: async () => Promise.reject(new Error('no wasm')) });
    expect(await toolkit.parse(smiles('CCO'))).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await toolkit.depict(smiles('CCO'), DRAW)).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await toolkit.matchesSmarts(smiles('CCO'), '[OX2H]')).toMatchObject({ ok: false, reason: 'unavailable' });
  });
});

describe('input caps and formats are checked BEFORE RDKit (SECURITY §3)', () => {
  it('a SMILES over 20,000 characters is invalid and RDKit is never loaded or called', async () => {
    const fake = createFakeRdkit({});
    const { toolkit, loads } = toolkitOver(fake);
    const over = await toolkit.parse(smiles('C'.repeat(LIMITS.inlineStructure + 1)));
    expect(over).toMatchObject({ ok: false, reason: 'invalid' });
    expect(over.ok ? '' : over.error).toContain('20000');
    expect(loads.count).toBe(0);
    expect(fake.calls.getMol).toEqual([]);
  });

  it('a value at the cap goes to RDKit; a CXSMILES and a molfile have their own limits', async () => {
    const atCap = 'C'.repeat(LIMITS.inlineStructure);
    const fake = createFakeRdkit({ [atCap]: ETHANOL_SPEC });
    const { toolkit } = toolkitOver(fake);
    expect((await toolkit.parse(smiles(atCap))).ok).toBe(true);
    expect(await toolkit.parse({ format: 'cxsmiles', value: `${atCap}C` })).toMatchObject({ ok: false, reason: 'invalid' });
    const molfile = (n: number): StructureRep => ({ format: 'molfile', value: `${'x'.repeat(n - 8)}\nM  END\n` });
    expect(inputProblem(molfile(LIMITS.molfile))).toBeUndefined();
    expect(inputProblem(molfile(LIMITS.molfile + 1))).toContain('1000000');
  });

  it('an empty structure, an unknown format and a value that is not a string are invalid without RDKit', async () => {
    const fake = createFakeRdkit({});
    const { toolkit, loads } = toolkitOver(fake);
    for (const structure of [smiles(''), { format: 'inchi', value: 'x' }, { format: 'smiles', value: 5 }, { format: 'smiles' }] as unknown as StructureRep[]) {
      expect(await toolkit.parse(structure)).toMatchObject({ ok: false, reason: 'invalid' });
    }
    expect(loads.count).toBe(0);
  });

  it('the declared format is honoured: RDKit sniffs its input, so a molblock or JSON given as SMILES is refused, and SMILES given as a molfile', () => {
    expect(inputProblem(smiles('CCO\nM  END'))).toContain('not a smiles');
    expect(inputProblem(smiles('{"commonchem":{"version":10}}'))).toContain('not a smiles');
    expect(inputProblem({ format: 'cxsmiles', value: 'CC |&1:1|' })).toBeUndefined();
    expect(inputProblem({ format: 'molfile', value: 'CCO' })).toContain('not a molfile');
    expect(inputProblem({ format: 'molfile', value: '{"molecules":[]}\nM  END' })).toContain('not a molfile');
    expect(inputProblem({ format: 'molfile', value: '\n  RDKit  2D\n\n  0  0  0  0  0  0  0  0  0  0999 V2000\nM  END\n' })).toBeUndefined();
  });
});

describe('parse', () => {
  it('answers facts read from the molecule and frees the molecule', async () => {
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC });
    const { toolkit } = toolkitOver(fake);
    const out = await toolkit.parse(smiles('CCO'));
    expect(out).toMatchObject({ ok: true, facts: { canonicalSmiles: 'CCO', formula: 'C2H6O', charge: 0, heavyAtomCount: 3, atomMaps: [], warnings: [] } });
    expect(fake.leaked()).toEqual([]);
    expect(fake.handles).toHaveLength(1);
  });

  it('a structure RDKit cannot read is `invalid`, and only that is', async () => {
    const fake = createFakeRdkit({});
    const { toolkit } = toolkitOver(fake);
    expect(await toolkit.parse(smiles('C1CC'))).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('a C++ exception from RDKit is `invalid` for THIS structure and the module stays loaded', async () => {
    const fake = createFakeRdkit({ bad: new Error('RDKit refused'), CCO: ETHANOL_SPEC });
    const { toolkit, loads } = toolkitOver(fake);
    expect(await toolkit.parse(smiles('bad'))).toMatchObject({ ok: false, reason: 'invalid' });
    expect((await toolkit.parse(smiles('CCO'))).ok).toBe(true);
    expect(loads.count).toBe(1);
  });

  it('a WASM trap while reading the molecule is `unavailable`, frees the molecule, drops the module and the next call loads a fresh one', async () => {
    const fake = createFakeRdkit({ trapped: { ...ETHANOL_SPEC, throws: { get_smiles: trap() } }, CCO: ETHANOL_SPEC });
    const { toolkit, loads } = toolkitOver(fake);
    const out = await toolkit.parse(smiles('trapped'));
    expect(out).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(out.ok ? '' : out.error).toContain('crashed');
    expect(fake.leaked()).toEqual([]);
    expect(loads.count).toBe(1);
    expect((await toolkit.parse(smiles('CCO'))).ok).toBe(true);
    expect(loads.count).toBe(2);
  });

  it('a trap thrown by get_mol itself is `unavailable` too (a hostile SMILES that crashes the parser)', async () => {
    const fake = createFakeRdkit({ crash: trap(), CCO: ETHANOL_SPEC });
    const { toolkit, loads } = toolkitOver(fake);
    expect(await toolkit.parse(smiles('crash'))).toMatchObject({ ok: false, reason: 'unavailable' });
    expect((await toolkit.parse(smiles('CCO'))).ok).toBe(true);
    expect(loads.count).toBe(2);
  });

  it('a JS stack or memory overflow (RangeError) is treated as a trap', async () => {
    const fake = createFakeRdkit({ deep: new RangeError('Maximum call stack size exceeded') });
    const { toolkit } = toolkitOver(fake);
    expect(await toolkit.parse(smiles('deep'))).toMatchObject({ ok: false, reason: 'unavailable' });
  });
});

describe('depict', () => {
  it('answers the SANITISED drawing: the declaration is gone, the root carries the namespace, the size is what was asked', async () => {
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC });
    const { toolkit } = toolkitOver(fake);
    const out = await toolkit.depict(smiles('CCO'), DRAW);
    if (!out.ok) throw new Error(out.error);
    expect(out.depiction.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ')).toBe(true);
    expect(out.depiction.svg).not.toContain('<?xml');
    expect([out.depiction.width, out.depiction.height]).toEqual([200, 150]);
    expect(fake.leaked()).toEqual([]);
  });

  it('a drawing that carries a script or a handler comes out inert (ADV-033, depiction part)', async () => {
    const evil = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)"><rect width="9" style="fill:url(#x)"/></a></svg>`;
    const fake = createFakeRdkit({ CCO: { ...ETHANOL_SPEC, svg: evil } });
    const { toolkit } = toolkitOver(fake);
    const out = await toolkit.depict(smiles('CCO'), DRAW);
    expect(out.ok && out.depiction.svg).toBe('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  });

  it('a drawing the sanitiser refuses (over the cap, no svg, a DOCTYPE) is `refused` and nothing of it is returned', async () => {
    for (const svg of ['<svg>' + ' '.repeat(MAX_SVG_INPUT_CHARS) + '</svg>', 'not svg', '<!DOCTYPE svg><svg/>']) {
      const fake = createFakeRdkit({ CCO: { ...ETHANOL_SPEC, svg } });
      const { toolkit } = toolkitOver(fake);
      const out = await toolkit.depict(smiles('CCO'), DRAW);
      expect(out).toMatchObject({ ok: false, reason: 'refused' });
      expect(out).not.toHaveProperty('depiction');
      expect(fake.leaked()).toEqual([]);
    }
  });

  it('the key is a hash of format, value, options, toolkit and version: it changes with each and not otherwise', async () => {
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC, CCN: ETHANOL_SPEC });
    const { toolkit } = toolkitOver(fake);
    const key = async (structure: StructureRep, options = DRAW as Parameters<typeof toolkit.depict>[1]) => {
      const out = await toolkit.depict(structure, options);
      if (!out.ok) throw new Error(out.error);
      return out.depiction.key;
    };
    const base = await key(smiles('CCO'));
    expect(await key(smiles('CCO'))).toBe(base);
    expect(await key(smiles('CCN'))).not.toBe(base);
    expect(await key({ format: 'cxsmiles', value: 'CCO' })).not.toBe(base);
    expect(await key(smiles('CCO'), { ...DRAW, width: 201 })).not.toBe(base);
    expect(await key(smiles('CCO'), { ...DRAW, showAtomMaps: false })).not.toBe(base);
    expect(await key(smiles('CCO'), { ...DRAW, highlightAtomMaps: [2, 1] })).toBe(await key(smiles('CCO'), { ...DRAW, highlightAtomMaps: [1, 2, 2] }));
    const other = createRdkitToolkit({ load: async () => createFakeRdkit({ CCO: ETHANOL_SPEC }, {}, 'fake-2027.01').module });
    const out = await other.depict(smiles('CCO'), DRAW);
    expect(out.ok && out.depiction.key).not.toBe(base);
  });

  it('bad options are a programmer error: they throw, before anything is loaded', async () => {
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC });
    const { toolkit, loads } = toolkitOver(fake);
    await expect(toolkit.depict(smiles('CCO'), { ...DRAW, width: 0 })).rejects.toBeInstanceOf(RangeError);
    await expect(toolkit.depict(smiles('CCO'), { ...DRAW, height: 100_000 })).rejects.toBeInstanceOf(RangeError);
    await expect(toolkit.depict(smiles('CCO'), { ...DRAW, highlightAtomMaps: [-1] })).rejects.toBeInstanceOf(RangeError);
    expect(loads.count).toBe(0);
  });

  it('an invalid structure is `invalid`; a trap while drawing is `unavailable`, frees the molecule and drops the module', async () => {
    const fake = createFakeRdkit({ trapped: { ...ETHANOL_SPEC, throws: { get_svg_with_highlights: trap() } } });
    const { toolkit } = toolkitOver(fake);
    expect(await toolkit.depict(smiles('nothing'), DRAW)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await toolkit.depict(smiles('trapped'), DRAW)).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(fake.leaked()).toEqual([]);
  });
});

describe('an exception that is not a trap: the stage decides the reason', () => {
  const boom = new Error('RDKit raised something');

  it('while READING the structure it is `invalid` (RDKit refused it); while DRAWING one it read it is `unavailable`, never `invalid`', async () => {
    const fake = createFakeRdkit({ unreadable: boom, drawn: { ...ETHANOL_SPEC, throws: { get_svg_with_highlights: boom } } });
    const { toolkit, loads } = toolkitOver(fake);
    expect(await toolkit.depict(smiles('unreadable'), DRAW)).toMatchObject({ ok: false, reason: 'invalid' });
    const drawing = await toolkit.depict(smiles('drawn'), DRAW);
    expect(drawing).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(drawing.ok ? '' : drawing.error).toContain('could not process');
    expect(fake.leaked()).toEqual([]);
    expect(loads.count).toBe(1); // not a trap: the module stays loaded
  });

  it('while matching: an unreadable SMARTS is `invalid_smarts`, an unreadable structure is `invalid`, a failure of the match itself is `unavailable`', async () => {
    const fake = createFakeRdkit(
      { CCO: { ...ETHANOL_SPEC, throws: { get_substruct_match: boom } }, unreadable: boom, plain: ETHANOL_SPEC },
      { '[OX2H]': { ok: true }, '[bad': boom },
    );
    const { toolkit, loads } = toolkitOver(fake);
    expect(await toolkit.matchesSmarts(smiles('plain'), '[bad')).toMatchObject({ ok: false, reason: 'invalid_smarts' });
    expect(await toolkit.matchesSmarts(smiles('unreadable'), '[OX2H]')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await toolkit.matchesSmarts(smiles('CCO'), '[OX2H]')).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(fake.leaked()).toEqual([]);
    expect(loads.count).toBe(1);
  });
});

describe('depiction with atom maps', () => {
  const mapped = 'OC[CH2:2][CH3:1]';
  const spec = { ...ETHANOL_SPEC, smiles: mapped, order: '[0,1,2,3]' };
  const drawnWith = (label: string) => `<svg xmlns='http://www.w3.org/2000/svg'><text>${label}</text></svg>`;

  it('shown maps are drawn as they are; a highlight by map number becomes atom indexes through the SMILES output order', async () => {
    const seen: string[] = [];
    const fake = createFakeRdkit({ [mapped]: { ...spec, order: '[3,2,1,0]', svg: (d) => (seen.push(d), drawnWith('x')) } });
    const { toolkit } = toolkitOver(fake);
    await toolkit.depict(smiles(mapped), { ...DRAW, highlightAtomMaps: [1] });
    // The SMILES token for [CH3:1] is the 4th atom (position 3), which is atom index 0 by the output order [3,2,1,0].
    expect(JSON.parse(seen[0] ?? '{}')).toEqual({ width: 200, height: 150, atoms: [0] });
  });

  it('hidden maps: the molecule is drawn again from the SMILES without the `:n`, and the highlight uses the token positions', async () => {
    const seen: string[] = [];
    const fake = createFakeRdkit({
      [mapped]: { ...spec, svg: (d) => (seen.push(`original ${d}`), drawnWith('original')) },
      'OC[CH2][CH3]': { ...ETHANOL_SPEC, svg: (d) => (seen.push(`plain ${d}`), drawnWith('plain')) },
    });
    const { toolkit } = toolkitOver(fake);
    const out = await toolkit.depict(smiles(mapped), { ...DRAW, showAtomMaps: false, highlightAtomMaps: [2] });
    expect(out.ok && out.depiction.svg).toContain('plain');
    expect(seen).toEqual([`plain ${JSON.stringify({ width: 200, height: 150, atoms: [2] })}`]);
    expect(fake.calls.getMol).toEqual([mapped, 'OC[CH2][CH3]']);
    expect(fake.leaked()).toEqual([]);
  });

  it('a structure with no map numbers is drawn as it is, whatever was asked about maps', async () => {
    const seen: string[] = [];
    const fake = createFakeRdkit({ CCO: { ...ETHANOL_SPEC, svg: (d) => (seen.push(d), drawnWith('x')) } });
    const { toolkit } = toolkitOver(fake);
    await toolkit.depict(smiles('CCO'), { ...DRAW, showAtomMaps: false, highlightAtomMaps: [1] });
    expect(seen).toEqual([JSON.stringify({ width: 200, height: 150 })]);
  });

  it('when the map numbers cannot be located the depiction is `unavailable`, not drawn wrongly', async () => {
    const fake = createFakeRdkit({ [mapped]: { ...spec, order: '[0,1]' } });
    const { toolkit } = toolkitOver(fake);
    expect(await toolkit.depict(smiles(mapped), { ...DRAW, highlightAtomMaps: [1] })).toMatchObject({ ok: false, reason: 'unavailable' });
  });
});

describe('matchesSmarts', () => {
  const queries = { '[OX2H]': { ok: true } as const, '[Cl]': { ok: true } as const };
  const molecules = { CCO: { ...ETHANOL_SPEC, matches: { '[OX2H]': '{"atoms":[1,2],"bonds":[1]}' } } };

  it('is true for a match and false for none, and frees the molecule AND the query', async () => {
    const fake = createFakeRdkit(molecules, queries);
    const { toolkit } = toolkitOver(fake);
    expect(await toolkit.matchesSmarts(smiles('CCO'), '[OX2H]')).toEqual({ ok: true, matches: true });
    expect(await toolkit.matchesSmarts(smiles('CCO'), '[Cl]')).toEqual({ ok: true, matches: false });
    expect(fake.handles.map((h) => h.kind)).toEqual(['mol', 'qmol', 'mol', 'qmol']);
    expect(fake.leaked()).toEqual([]);
  });

  it('a pattern RDKit cannot read is `invalid_smarts`; a bad structure is `invalid`; both free what was opened', async () => {
    const fake = createFakeRdkit(molecules, queries);
    const { toolkit } = toolkitOver(fake);
    expect(await toolkit.matchesSmarts(smiles('CCO'), '[[[')).toMatchObject({ ok: false, reason: 'invalid_smarts' });
    expect(await toolkit.matchesSmarts(smiles('nothing'), '[OX2H]')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await toolkit.matchesSmarts(smiles('CCO'), '')).toMatchObject({ ok: false, reason: 'invalid_smarts' });
    expect(await toolkit.matchesSmarts(smiles('CCO'), 'C'.repeat(LIMITS.inlineStructure + 1))).toMatchObject({ ok: false, reason: 'invalid_smarts' });
    expect(fake.leaked()).toEqual([]);
  });

  it('a trap while matching is `unavailable` and frees both objects; an unreadable answer is `unavailable`', async () => {
    const trapped = createFakeRdkit({ CCO: { ...ETHANOL_SPEC, throws: { get_substruct_match: trap() } } }, queries);
    expect(await toolkitOver(trapped).toolkit.matchesSmarts(smiles('CCO'), '[OX2H]')).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(trapped.leaked()).toEqual([]);
    const garbled = createFakeRdkit({ CCO: { ...ETHANOL_SPEC, matches: { '[OX2H]': 'not json' } } }, queries);
    expect(await toolkitOver(garbled).toolkit.matchesSmarts(smiles('CCO'), '[OX2H]')).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(garbled.leaked()).toEqual([]);
  });
});
