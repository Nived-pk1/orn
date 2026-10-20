/** The mechanism steps and their rows as recipes (step 6.5a part 4): text as typed, empty optional values absent, choices decoded exactly. */
import { describe, expect, it } from 'vitest';
import { addBond, addMovement, addSpecies, moveSpecies, onSpeciesRow, pairOfValue, pairValue, removeBond, removeSpecies, setBondOrder, setBondPair, setMovementElectrons, setMovementSite, setSpeciesLabel, setSpeciesRef, setSpeciesRole, siteOfValue, siteValue } from './step-rows-model';
import { addStep, moveStep, removeStep, setStepFlag, setStepText, stepSummary, stepsViewOf, toggleStepKind } from './step-model';

type Fields = Record<string, unknown>;
const base = (): Fields => ({
  variants: [
    {
      id: 'mvr_a',
      label: 'A',
      steps: [
        { id: 'mst_1', stepKinds: ['proton_transfer'], species: [{ role: 'reactant', label: 'X' }, { role: 'product', label: 'Y' }], bondsFormed: [{ atoms: [1, 2], order: 1 }], bondsBroken: [], electronMovements: [], isRateDetermining: true, reversible: false },
        { id: 'mst_2', stepKinds: [], species: [], bondsFormed: [], bondsBroken: [], electronMovements: [] },
      ],
    },
  ],
});
const run = (recipe: (draft: Fields) => void): Fields => {
  const copy = structuredClone(base());
  recipe(copy);
  return copy;
};
const step = (draft: Fields, s = 0): Fields => (((draft['variants'] as Fields[])[0] as Fields)['steps'] as Fields[])[s] as Fields;

describe('steps', () => {
  it('a new step has its ID, no kinds and no rows; Up / Down / Remove act on the one variant', () => {
    const next = run(addStep(0, 'mst_new'));
    expect(step(next, 2)).toEqual({ id: 'mst_new', stepKinds: [], species: [], bondsFormed: [], bondsBroken: [], electronMovements: [] });
    expect((((run(moveStep(0, 0, 1))['variants'] as Fields[])[0] as Fields)['steps'] as Fields[]).map((x) => x['id'])).toEqual(['mst_2', 'mst_1']);
    expect((((run(removeStep(0, 0))['variants'] as Fields[])[0] as Fields)['steps'] as Fields[]).map((x) => x['id'])).toEqual(['mst_2']);
  });
  it('kinds toggle in and out; flags are set to true or false; texts are as typed and an empty one is absent', () => {
    expect(step(run(toggleStepKind(0, 0, 'elimination', true)))['stepKinds']).toEqual(['proton_transfer', 'elimination']);
    expect(step(run(toggleStepKind(0, 0, 'proton_transfer', false)))['stepKinds']).toEqual([]);
    expect(step(run(setStepFlag(0, 1, 'reversible', true)), 1)['reversible']).toBe(true);
    expect(step(run(setStepFlag(0, 0, 'isRateDetermining', false)))['isRateDetermining']).toBe(false);
    expect(step(run(setStepText(0, 0, 'description', ' *slow* \n')))['description']).toBe(' *slow* \n');
    expect(Object.hasOwn(step(run(setStepText(0, 0, 'stereochemicalEvent', ''))), 'stereochemicalEvent')).toBe(false);
  });
  it('the summary line is "Step <n> · <kinds> · rate-determining · reversible" with unstated parts left out', () => {
    const views = stepsViewOf(base(), 0);
    expect(stepSummary(views[0] as never, 1)).toBe('Step 1 · proton transfer · rate-determining');
    expect(stepSummary(views[1] as never, 2)).toBe('Step 2');
    const both = stepsViewOf(run(setStepFlag(0, 0, 'reversible', true)), 0);
    expect(stepSummary(both[0] as never, 1)).toBe('Step 1 · proton transfer · rate-determining · reversible');
  });
});

describe('species rows', () => {
  it('a new row has no role (the schema has no default); role, record and label are set; empty ones removed; the row moves and goes', () => {
    const added = run(addSpecies(0, 1));
    expect(((step(added, 1)['species']) as Fields[])[0]).toEqual({});
    const set = run((d) => {
      setSpeciesRole(0, 0, 0, 'catalyst')(d);
      setSpeciesRef(0, 0, 0, { kind: 'species', id: 'spc_x' })(d);
      setSpeciesLabel(0, 0, 1, '')(d);
    });
    expect((step(set)['species'] as Fields[])[0]).toEqual({ role: 'catalyst', label: 'X', ref: { kind: 'species', id: 'spc_x' } });
    expect(Object.hasOwn((step(set)['species'] as Fields[])[1] as Fields, 'label')).toBe(false);
    expect((step(run(setSpeciesRef(0, 0, 0, undefined)))['species'] as Fields[])[0]).toEqual({ role: 'reactant', label: 'X' });
    expect((step(run(moveSpecies(0, 0, 0, 1)))['species'] as Fields[]).map((x) => x['label'])).toEqual(['Y', 'X']);
    expect((step(run(removeSpecies(0, 0, 0)))['species'] as Fields[]).map((x) => x['label'])).toEqual(['Y']);
  });
  it('onSpeciesRow applies a recipe to the row itself (the structure panel edits a row as if it were a record)', () => {
    const next = run(onSpeciesRow(0, 0, 0, (row) => void (row['structure'] = { format: 'smiles', value: '[OH-:1]' })));
    expect(((step(next)['species']) as Fields[])[0]?.['structure']).toEqual({ format: 'smiles', value: '[OH-:1]' });
  });
});

describe('bond changes', () => {
  it('a new bond has no atoms; a pair and an order are set; no order removes it; Remove takes it out', () => {
    const next = run((d) => {
      addBond(0, 0, 'bondsBroken')(d);
      setBondPair(0, 0, 'bondsBroken', 0, [2, 3])(d);
      setBondOrder(0, 0, 'bondsBroken', 0, 2)(d);
    });
    expect(step(next)['bondsBroken']).toEqual([{ atoms: [2, 3], order: 2 }]);
    expect((step(run(setBondOrder(0, 0, 'bondsFormed', 0, undefined)))['bondsFormed'] as Fields[])[0]).toEqual({ atoms: [1, 2] });
    expect(step(run(removeBond(0, 0, 'bondsFormed', 0)))['bondsFormed']).toEqual([]);
  });
  it('a pair is chosen as a value "a-b" and read back', () => {
    expect(pairValue([1, 12])).toBe('1-12');
    expect(pairOfValue('1-12')).toEqual([1, 12]);
    expect(pairOfValue('')).toBeUndefined();
    expect(pairOfValue('x-2')).toBeUndefined();
  });
});

describe('electron movements', () => {
  it('a new movement has nothing chosen; sites and the electron count are set; empty choices remove them', () => {
    const next = run((d) => {
      addMovement(0, 0)(d);
      setMovementSite(0, 0, 0, 'from', { kind: 'lone_pair', atom: 1 })(d);
      setMovementSite(0, 0, 0, 'to', { kind: 'bond', atoms: [1, 2] })(d);
      setMovementElectrons(0, 0, 0, 2)(d);
    });
    expect(step(next)['electronMovements']).toEqual([{ from: { kind: 'lone_pair', atom: 1 }, to: { kind: 'bond', atoms: [1, 2] }, electrons: 2 }]);
    const cleared = run((d) => {
      addMovement(0, 0)(d);
      setMovementSite(0, 0, 0, 'from', { kind: 'atom', atom: 1 })(d);
      setMovementSite(0, 0, 0, 'from', undefined)(d);
      setMovementElectrons(0, 0, 0, undefined)(d);
    });
    expect(step(cleared)['electronMovements']).toEqual([{}]);
  });
  it('sites are chosen as values and read back exactly, for all four kinds', () => {
    for (const site of [{ kind: 'atom', atom: 3 }, { kind: 'lone_pair', atom: 3 }, { kind: 'radical', atom: 3 }, { kind: 'bond', atoms: [3, 4] }] as const) {
      expect(siteOfValue(siteValue(site))).toEqual(site);
    }
    expect(siteValue({ kind: 'bond', atoms: [3, 4] })).toBe('bond:3-4');
    expect(siteOfValue('')).toBeUndefined();
    expect(siteOfValue('charge:3')).toBeUndefined();
  });
});
