/**
 * CHEM-001 to CHEM-009 (step 4.3b) over REAL RDKit in Node, one RDKit load for the file: every rule that is built fires on a minimal
 * case and stays silent on a clean one; what could not be compared is said out loud; every request and every answer survives
 * `structuredClone` (they cross a worker port). CHEM-006 follows the reviewer's reading (letters only, cautious).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  balancePlan,
  createChemChecks,
  loadRdkit,
  createRdkitToolkit,
  membershipPlan,
  readMembership,
  type BalanceRequest,
  type ChemChecks,
  type StructureToolkit,
} from '@/chem';
import type { CanonicalState, Reaction, Species, StructureRep } from '@/core/schema';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const side = (label: string, value: string, coefficient = 1) => ({ label, structure: smiles(value), coefficient });

let checks: ChemChecks;
let toolkit: StructureToolkit;

beforeAll(async () => {
  const module = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => module });
  checks = createChemChecks(toolkit);
  await toolkit.ready();
}, 60_000);

/** Every value that crosses the worker port must be a structured-clone-safe plain value. */
function cloned<T>(value: T): T {
  const copy = structuredClone(value);
  expect(copy).toEqual(value);
  return copy;
}

async function species(structure: string, extra: { formula?: string; charge?: number; stereoDescriptors?: string[] } = {}) {
  const request = cloned({ id: 'spc_t', structure: smiles(structure), ...extra });
  const answer = cloned(await checks.checkSpecies([request]));
  const result = answer.results[0];
  if (result === undefined) throw new Error('no result');
  return result;
}
const rulesOf = (result: { drafts: readonly { ruleId: string }[] }): string[] => result.drafts.map((d) => d.ruleId);

describe('CHEM-001 and CHEM-002: a structure that cannot be read, and one that is readable but not valid', () => {
  it('CHEM-001 fires for a broken SMILES (and not CHEM-002); silent on a clean one', async () => {
    const bad = await species('C1CC(');
    expect(rulesOf(bad)).toEqual(['CHEM-001']);
    expect(bad.drafts[0]).toMatchObject({ path: 'structure' });
    expect(bad.status).toEqual({ state: 'checked', notCompared: [] });
    expect(bad.canonicalSmiles).toBeUndefined();
    expect(rulesOf(await species('CCO'))).toEqual([]);
  });

  it('CHEM-002 fires for a structure RDKit reads but cannot sanitise (pentavalent carbon), not CHEM-001', async () => {
    for (const value of ['C(C)(C)(C)(C)C', '[NH5]', 'CC(=O)(=O)(=O)C']) expect(rulesOf(await species(value)), value).toEqual(['CHEM-002']);
  });

  it('a molfile the toolkit refuses is CHEM-001 (unreadable), a declared-format mismatch too', async () => {
    const answer = await checks.checkSpecies([{ id: 'spc_m', structure: { format: 'molfile', value: 'not a molfile' } }]);
    expect(answer.results[0]?.drafts.map((d) => d.ruleId)).toEqual(['CHEM-001']);
  });

  it('the answer names the toolkit that gave it (the not-checkable memory keys on its version)', async () => {
    const answer = await checks.checkSpecies([]);
    expect(answer.toolkit.name).toBe('rdkit-minimallib');
    expect(answer.toolkit.version).not.toBe('not loaded');
  });
});

describe('CHEM-003: the entered formula against the derived formula, by ATOM COUNTS', () => {
  it('silent for the condensed forms the demo uses, which are not Hill strings', async () => {
    for (const [value, formula] of [['CCO', 'C2H5OH'], ['CC(=O)O', 'CH3COOH'], ['CCO', 'C2H6O'], ['CC(=O)OCC', 'CH3COOC2H5'], ['O=Cc1ccccc1', 'C6H5CHO'], ['[Ca+2].[O-]C([O-])=O', 'CaCO3'], ['[OH3+]', 'H3O+']] as const) {
      const result = await species(value, { formula });
      expect(rulesOf(result), `${value} ${formula}`).not.toContain('CHEM-003');
      expect(result.status).toEqual({ state: 'checked', notCompared: [] });
    }
  });

  it('fires when the counts differ, with both counts and the differences in data', async () => {
    const result = await species('CCO', { formula: 'C2H4O' });
    expect(rulesOf(result)).toEqual(['CHEM-003']);
    expect(result.drafts[0]).toMatchObject({ path: 'formula', data: { differences: { H: -2 } } });
  });

  it('a formula that cannot be read as counts gives no finding and is reported as not compared, never silently', async () => {
    for (const formula of ['C6H5R', 'Ph-OH', 'NH4+', '']) {
      const result = await species('CCO', { formula: formula === '' ? ' ' : formula });
      expect(rulesOf(result), formula).toEqual([]);
      expect(result.status).toMatchObject({ state: 'checked', notCompared: [{ ruleId: 'CHEM-003', reason: expect.stringContaining('was not compared') }] });
    }
  });

  it('a structure whose formula the toolkit cannot derive (a dummy atom) is not compared either', async () => {
    const result = await species('*CC', { formula: 'C2H5' });
    expect(rulesOf(result)).toEqual([]);
    expect(result.status).toMatchObject({ state: 'checked', notCompared: [{ ruleId: 'CHEM-003' }] });
  });

  it('no entered formula: nothing to compare, and nothing to report', async () => {
    expect((await species('CCO')).status).toEqual({ state: 'checked', notCompared: [] });
  });
});

describe('CHEM-004: the entered charge against the structure\'s net charge', () => {
  it('fires when they differ, silent when equal or not entered', async () => {
    expect(rulesOf(await species('[OH3+]', { charge: 0 }))).toEqual(['CHEM-004']);
    expect(rulesOf(await species('[OH3+]', { charge: 1 }))).toEqual([]);
    expect(rulesOf(await species('[OH3+]'))).toEqual([]);
    expect(rulesOf(await species('CCO', { charge: 0 }))).toEqual([]);
    expect((await species('[OH3+]', { charge: 2 })).drafts[0]?.data).toEqual({ entered: 2, derived: 1 });
  });
});

describe('CHEM-005: atom balance of an outcome, by counts and coefficients', () => {
  const run = async (request: BalanceRequest) => cloned(await checks.checkReaction([cloned(request)])).results[0];
  const ethanolToEthanal = (waterCoefficient?: number): BalanceRequest => ({
    path: 'outcomes[0]',
    reactants: [side('prt_a', 'CCO', 2), side('prt_b', 'O=O')],
    products: [side('prd_a', 'CC=O', 2), ...(waterCoefficient === undefined ? [] : [side('prd_b', 'O', waterCoefficient)])],
  });

  it('silent when balanced (coefficients count), fires with the differences when not', async () => {
    expect((await run(ethanolToEthanal(2)))?.drafts).toEqual([]);
    const off = await run(ethanolToEthanal());
    expect(off?.drafts).toHaveLength(1);
    expect(off?.drafts[0]).toMatchObject({ ruleId: 'CHEM-005', path: 'outcomes[0]', data: { differences: { H: 4, O: 2 } } });
    expect(off?.status).toEqual({ state: 'checked', notCompared: [] });
  });

  it('fractional coefficients balance exactly enough (0.5 O2)', async () => {
    const half: BalanceRequest = { path: 'outcomes[1]', reactants: [side('a', 'CCO'), side('b', 'O=O', 0.5)], products: [side('c', 'CC=O'), side('d', 'O')] };
    expect((await run(half))?.drafts).toEqual([]);
  });

  it('a structure that cannot be read leaves the outcome not compared, with the reason; no finding', async () => {
    const result = await run({ path: 'outcomes[0]', reactants: [side('prt_x', 'C1CC(')], products: [side('prd_x', 'C')] });
    expect(result?.drafts).toEqual([]);
    expect(result?.status).toMatchObject({ state: 'checked', notCompared: [{ ruleId: 'CHEM-005', reason: expect.stringContaining('prt_x') }] });
  });

  it('the planner sends an outcome only when every atom-contributing participant and every product is a species with a structure and a coefficient', () => {
    const species = (id: string, value?: string): Species => ({ id, kind: 'species', ...(value === undefined ? {} : { structure: smiles(value) }) }) as unknown as Species;
    const state = { records: { species: { spc_a: species('spc_a', 'CCO'), spc_b: species('spc_b', 'O=O'), spc_c: species('spc_c', 'CC=O'), spc_none: species('spc_none') } } } as unknown as CanonicalState;
    const participant = (id: string, ref: string, role: string, coefficient?: number, extra: object = {}) => ({ id, ref: { kind: 'species', id: ref }, role, ...(coefficient === undefined ? {} : { coefficient }), ...extra });
    const reaction = (participants: object[], products: object[]) => ({ conditionVariants: [], outcomes: [{ conditionVariantIds: [], products }] as unknown[], participants }) as unknown as Reaction;
    const product = { id: 'prd_1', ref: { kind: 'species', id: 'spc_c' }, role: 'main', coefficient: 1 };
    // complete, with a solvent that has no structure and no coefficient (it contributes no atoms): sent
    const ok = balancePlan(state, reaction([participant('prt_1', 'spc_a', 'reactant', 1), participant('prt_2', 'spc_none', 'solvent')], [product]));
    expect(ok.requests).toHaveLength(1);
    expect(ok.requests[0]?.reactants.map((r) => r.label)).toEqual(['prt_1']);
    const why = (plan: { notCompared: readonly { reason: string }[] }): string => plan.notCompared[0]?.reason ?? '';
    expect(why(balancePlan(state, reaction([participant('prt_1', 'spc_a', 'reactant')], [product])))).toContain('has no coefficient');
    expect(why(balancePlan(state, reaction([participant('prt_1', 'spc_none', 'reactant', 1)], [product])))).toContain('has no structure');
    expect(why(balancePlan(state, reaction([participant('prt_1', 'spc_a', 'reactant', 1)], [{ ...product, coefficient: undefined }])))).toContain('has no coefficient');
    // a spectator never contributes atoms, whatever its flag says; a flag can add a role that does not
    expect(balancePlan(state, reaction([participant('prt_1', 'spc_a', 'reactant', 1), participant('prt_2', 'spc_none', 'spectator', undefined, { flags: { contributesAtoms: true } })], [product])).requests).toHaveLength(1);
    expect(why(balancePlan(state, reaction([participant('prt_1', 'spc_a', 'reactant', 1), participant('prt_2', 'spc_none', 'catalyst', undefined, { flags: { contributesAtoms: true } })], [product])))).toContain('has no structure');
  });
});

describe('CHEM-007: class SMARTS membership against the stated classIds, both directions, as suggestions', () => {
  const ALCOHOL = '[CX4][OX2H]';
  const cls = (id: string, parentIds: string[], smarts?: string) => ({ id, kind: 'class', parentIds, ...(smarts === undefined ? {} : { generic: { smarts } }) });
  const state = { records: { class: { cls_alcohol: cls('cls_alcohol', [], ALCOHOL), cls_primary: cls('cls_primary', ['cls_alcohol']), cls_ketone: cls('cls_ketone', [], '[CX3](=O)([#6])[#6]'), cls_bad: cls('cls_bad', [], '[[[') } } } as unknown as CanonicalState;

  async function read(value: string, classIds: string[]) {
    const s = { id: 'spc_m', kind: 'species', structure: smiles(value), classIds } as unknown as Species;
    const plan = membershipPlan(state, s);
    const answer = cloned(await checks.matches(cloned(plan.probes)));
    return readMembership(state, s, plan, answer.outcomes);
  }

  it('suggests adding a class whose SMARTS matches but the species does not state', async () => {
    const reading = await read('CCO', []);
    expect(reading.drafts.map((d) => d.data)).toEqual([{ direction: 'suggest_add', classId: 'cls_alcohol' }]);
    expect(reading.drafts[0]).toMatchObject({ ruleId: 'CHEM-007', path: 'classIds', related: [{ kind: 'class', id: 'cls_alcohol' }] });
  });

  it('suggests a check when a LISTED class does not match', async () => {
    const reading = await read('CC(=O)C', ['cls_alcohol']);
    // (it is a ketone, which it does not list: that is the other direction, and is suggested too)
    expect(reading.drafts.map((d) => d.data)).toEqual([{ direction: 'suggest_review', classId: 'cls_alcohol' }, { direction: 'suggest_add', classId: 'cls_ketone' }]);
  });

  it('a class the species only INHERITS that does not match is not reported (the listed class is where the disagreement is)', async () => {
    const reading = await read('CC(=O)C', ['cls_primary']);
    expect(reading.drafts.map((d) => d.data)).toEqual([{ direction: 'suggest_add', classId: 'cls_ketone' }]);
  });

  it('silent when they agree, also through the hierarchy (a species under "primary" states "alcohol" too)', async () => {
    expect((await read('CCO', ['cls_alcohol'])).drafts).toEqual([]);
    expect((await read('CCO', ['cls_primary'])).drafts).toEqual([]);
    expect((await read('CC(=O)C', ['cls_ketone'])).drafts).toEqual([]);
  });

  it('a SMARTS that cannot be read is not compared (said out loud), a class without SMARTS is never probed', async () => {
    const reading = await read('CCO', ['cls_alcohol']);
    expect(reading.notCompared).toEqual([{ ruleId: 'CHEM-007', reason: expect.stringContaining('cls_bad') }]);
    const s = { id: 'spc_m', kind: 'species', structure: smiles('CCO'), classIds: [] } as unknown as Species;
    expect(membershipPlan(state, s).classIds).toEqual(['cls_alcohol', 'cls_bad', 'cls_ketone']);
  });
});

describe('CHEM-008: an atom map a step uses must be on an atom of one of its structures', () => {
  const step = (structures: string[], maps: number[][]) => ({
    path: 'variants[0].steps[0]',
    structures: structures.map(smiles),
    uses: maps.map((m, k) => ({ path: `variants[0].steps[0].bondsFormed[${k}]`, maps: m })),
  });
  const run = async (request: ReturnType<typeof step>) => cloned(await checks.checkMechanism([cloned(request)])).results[0];

  it('silent when every map is present (in any structure of the step)', async () => {
    expect((await run(step(['[OH-:1]', '[CH3:2]Br'], [[1, 2]])))?.drafts).toEqual([]);
  });

  it('fires per use with the absent maps, and says which are present', async () => {
    const result = await run(step(['[OH-:1]', '[CH3:2]Br'], [[1, 2], [2, 7], [8, 9]]));
    expect(result?.drafts.map((d) => [d.path, (d.data as { absent: number[] }).absent])).toEqual([
      ['variants[0].steps[0].bondsFormed[1]', [7]],
      ['variants[0].steps[0].bondsFormed[2]', [8, 9]],
    ]);
    expect(result?.drafts[0]).toMatchObject({ ruleId: 'CHEM-008' });
  });

  it('a mapped hydrogen is an atom of the step (RDKit removes it on reading; the proton transfer of the demo names it)', async () => {
    const result = await run(step(['[OH-:1]', '[H:2][CH2:3][CH:4]=[O:5]', '[H:2][OH:1]'], [[1, 2], [2, 3]]));
    expect(result?.drafts).toEqual([]);
    const facts = await toolkit.parse(smiles('[H:2][CH2:3][CH:4]=[O:5]'));
    expect(facts.ok ? facts.facts.atomMaps : []).toEqual([2, 3, 4, 5]);
  });

  it('a structure that cannot be read leaves the step not compared; no finding', async () => {
    const result = await run(step(['[OH-:1]', 'C1CC('], [[1, 2]]));
    expect(result?.drafts).toEqual([]);
    expect(result?.status).toMatchObject({ state: 'checked', notCompared: [{ ruleId: 'CHEM-008' }] });
  });
});

describe('CHEM-006: only the letters R/S and E/Z against RDKit, cautiously (reviewer, 2026-09-30)', () => {
  const six = (result: Awaited<ReturnType<typeof species>>) => ({
    rules: rulesOf(result),
    notCompared: result.status.state === 'checked' ? result.status.notCompared.filter((n) => n.ruleId === 'CHEM-006').length : -1,
  });

  it('agrees: no finding, nothing left out (locants ignored, order ignored)', async () => {
    expect(six(await species('C[C@H](O)C(=O)O', { stereoDescriptors: ['2S'] }))).toEqual({ rules: [], notCompared: 0 });
    expect(six(await species('C[C@H](O)[C@@H](C)O', { stereoDescriptors: ['(3R,2S)'] }))).toEqual({ rules: [], notCompared: 0 });
    expect(six(await species('C[C@H](O)[C@@H](C)O', { stereoDescriptors: ['R', '9S'] }))).toEqual({ rules: [], notCompared: 0 });
    expect(six(await species('F/C=C/F', { stereoDescriptors: ['E'] }))).toEqual({ rules: [], notCompared: 0 });
  });

  it('a descriptor that names the other letter is a finding on stereo.descriptors, with the catalogued severity (WARNING)', async () => {
    const wrong = await species('C[C@H](O)C(=O)O', { stereoDescriptors: ['2R'] });
    expect(six(wrong)).toEqual({ rules: ['CHEM-006'], notCompared: 0 });
    expect(wrong.drafts[0]).toMatchObject({ path: 'stereo.descriptors', data: { entered: { R: 1, S: 0 }, derived: { R: 0, S: 1 } } });
    expect(rulesOf(await species('F/C=C/F', { stereoDescriptors: ['Z'] }))).toEqual(['CHEM-006']);
    expect(rulesOf(await species('C[C@H](O)[C@@H](C)O', { stereoDescriptors: ['R', 'R'] }))).toEqual(['CHEM-006']);
    // more centres named than the structure has: not a case of naming fewer
    expect(rulesOf(await species('C[C@H](O)C(=O)O', { stereoDescriptors: ['2S', '3S'] }))).toEqual(['CHEM-006']);
  });

  it('is NOT compared, and says so (never a finding): words, lower-case, unspecified centres, fewer centres named', async () => {
    const cases: [string, string[]][] = [
      ['C[C@H](O)C(=O)O', ['cis']],
      ['CC(O)C(C)O', ['meso']],
      ['C[C@@H]1CC[C@H](C)CC1', ['1r', '4s']],
      ['CC(O)C(C)O', ['2R']],
      ['C[C@H](O)[C@@H](C)O', ['2S']],
      ['C[C@H](O)C(=O)O', ['rel-(2S)']],
      ['CC=CC', ['E']],
    ];
    for (const [value, descriptors] of cases) {
      const result = await species(value, { stereoDescriptors: descriptors });
      expect(six(result), value + ' ' + descriptors.join(',')).toEqual({ rules: [], notCompared: 1 });
    }
  });

  it('is silent when the species has no descriptors, and a request with them survives structuredClone', async () => {
    expect(six(await species('C[C@H](O)C(=O)O'))).toEqual({ rules: [], notCompared: 0 });
  });
});

describe('the wire: the worker refuses only what is malformed', () => {
  it('an input that traps RDKit is not_checked (never CHEM-001) and the next item is answered by a fresh module', async () => {
    const fresh = createChemChecks(createRdkitToolkit({ load: () => loadRdkit() }));
    const answer = await fresh.checkSpecies([{ id: 'a', structure: smiles('C'.repeat(700)) }, { id: 'b', structure: smiles('CCO') }]);
    // 700 carbons in a chain traps RDKit (step 4.3a): that item is not_checked, never CHEM-001; the next one still answers
    expect(answer.results[0]?.status).toMatchObject({ state: 'not_checked', reason: 'unavailable' });
    expect(answer.results[0]?.drafts).toEqual([]);
    expect(answer.results[1]?.status).toEqual({ state: 'checked', notCompared: [] });
  }, 30_000);
});
