/**
 * Step 8.5 M4: what a step's drawing is made of, over a scripted structure tool. The words of "No drawing" and the cases behind them (D4):
 * no atom-mapped structure; a movement naming an atom no drawn structure holds; the tool did not load. Never a partial drawing.
 */
import { describe, expect, it } from 'vitest';
import type { StructureRep } from '@/core/schema';
import type { DrawableStep, StepDrawingAnswer, StepDrawingPort } from './contracts';
import { loadStep, NO_DRAWING_WORDS } from './step-model';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const answer = (maps: readonly number[], size = 100): StepDrawingAnswer => ({
  ok: true,
  svg: '<svg/>',
  width: size,
  height: 60,
  atoms: maps.map((map, i) => ({ map, x: 10 + 20 * i, y: 30, rx: 8, ry: 8 })),
  bonds: [],
});
function port(by: Record<string, StepDrawingAnswer | ((positions: boolean) => StepDrawingAnswer)>) {
  const calls: string[] = [];
  const logs: string[] = [];
  const p: StepDrawingPort = {
    depict: async (structure, positions) => {
      calls.push(`${structure.value}:${positions}`);
      const found = by[structure.value];
      return typeof found === 'function' ? found(positions) : (found ?? { ok: false, reason: 'invalid', message: 'unknown' });
    },
    createUrl: () => 'blob:x',
    revokeUrl: () => undefined,
    log: (type, message) => logs.push(`${type}: ${message}`),
  };
  return { p, calls, logs };
}
const step = (over: Partial<DrawableStep>): DrawableStep => ({ number: 1, species: [], electronMovements: [], reversible: false, ...over });
const move = { from: { kind: 'lone_pair', atom: 1 }, to: { kind: 'bond', atoms: [1, 2] }, electrons: 2 } as const;

describe('loadStep', () => {
  it('draws a step with mapped structures: the sides, the drawn species with their atoms, the structure drawings', async () => {
    const { p } = port({ '[OH-:1]': answer([1]), '[H:2]C': answer([2, 3]), '[H:2][OH:1]': answer([1, 2]) });
    const out = await loadStep(step({ species: [{ role: 'reagent', structure: smiles('[OH-:1]') }, { role: 'reactant', structure: smiles('[H:2]C') }, { role: 'product', structure: smiles('[H:2][OH:1]') }], electronMovements: [move] }), p);
    expect(out.status).toBe('ready');
    if (out.status !== 'ready') return;
    expect(out.before.map((s) => s.drawn.atoms.map((a) => a.map))).toEqual([[1], [2, 3]]);
    expect(out.after.map((s) => s.drawn.atoms.map((a) => a.map))).toEqual([[1, 2]]);
    expect(out.before[0]?.svg).toBe('<svg/>');
    expect(out.noMovements).toBe(false);
  });

  it('a species with no structure is a text box with its label; nothing is blank', async () => {
    const { p } = port({ '[CH3:1]': answer([1]) });
    const out = await loadStep(step({ species: [{ role: 'reactant', structure: smiles('[CH3:1]') }, { role: 'reagent', label: 'H3O+' }] }), p);
    expect(out.status === 'ready' && out.before.map((s) => [s.drawn.kind, s.drawn.label])).toEqual([['structure', undefined], ['label', 'H3O+']]);
  });

  it('structures with no atom maps: "No drawing: this step has no atom-mapped structures."', async () => {
    const { p } = port({ CCO: answer([]) });
    const out = await loadStep(step({ species: [{ role: 'reactant', structure: smiles('CCO') }] }), p);
    expect(out).toEqual({ status: 'none', words: NO_DRAWING_WORDS.noMaps });
    expect(NO_DRAWING_WORDS.noMaps).toBe('No drawing: this step has no atom-mapped structures.');
    expect(await loadStep(step({ species: [{ role: 'reactant', label: 'Ethanal' }] }), p)).toEqual({ status: 'none', words: NO_DRAWING_WORDS.noMaps });
    expect(await loadStep(step({}), p)).toEqual({ status: 'none', words: NO_DRAWING_WORDS.noMaps });
  });

  it('a movement that names an atom no drawn structure holds: the CHEM-008 words, nothing partial (also when the atom is only on the after side)', async () => {
    const { p } = port({ '[OH-:1]': answer([1]), '[H:2][OH:1]': answer([1, 2]) });
    const out = await loadStep(step({ species: [{ role: 'reagent', structure: smiles('[OH-:1]') }, { role: 'product', structure: smiles('[H:2][OH:1]') }], electronMovements: [move] }), p);
    expect(out).toEqual({ status: 'none', words: NO_DRAWING_WORDS.missingAtoms });
    expect(NO_DRAWING_WORDS.missingAtoms).toBe("No drawing: an electron movement names an atom that is not in this step's structures.");
  });

  it('a structure the tool refuses to position, in a step WITH movements, is the same words and the reason is logged', async () => {
    const { p, logs } = port({ '[CH3:1][CH2:1]': { ok: false, reason: 'refused', message: 'no atom positions: a map number is written more than once' } });
    const out = await loadStep(step({ species: [{ role: 'reactant', structure: smiles('[CH3:1][CH2:1]') }], electronMovements: [move] }), p);
    expect(out).toEqual({ status: 'none', words: NO_DRAWING_WORDS.missingAtoms });
    expect(logs).toEqual(['mechanism_drawing: step 1: no atom positions: a map number is written more than once']);
  });

  it('a structure the tool refuses to position, in a step WITHOUT movements, is drawn plainly (there is no arrow to place) and the line says so', async () => {
    const { p, calls } = port({ '[CH3:1][CH2:1]': (positions) => (positions ? { ok: false, reason: 'refused', message: 'no atom positions: x' } : answer([])) });
    const out = await loadStep(step({ species: [{ role: 'reactant', structure: smiles('[CH3:1][CH2:1]') }, { role: 'product', structure: smiles('[CH3:1][CH2:1]') }] }), p);
    expect(calls).toContain('[CH3:1][CH2:1]:false');
    // plainly drawn structures have no positions, so no species is known to have atom maps: the step is not drawn as arrows
    expect(out).toEqual({ status: 'none', words: NO_DRAWING_WORDS.noMaps });
  });

  it('the tool did not load: the engine words (with Retry in the component); a timeout is the same', async () => {
    const { p } = port({ A: { ok: false, reason: 'unavailable', message: 'not loaded' }, B: { ok: false, reason: 'timeout', message: 'slow' } });
    expect(await loadStep(step({ species: [{ role: 'reactant', structure: smiles('A') }] }), p)).toEqual({ status: 'engine' });
    expect(await loadStep(step({ species: [{ role: 'reactant', structure: smiles('B') }] }), p)).toEqual({ status: 'engine' });
    expect(NO_DRAWING_WORDS.engine).toBe('Drawings need the structure tool, which did not load.');
  });

  it('a structure the tool cannot read is a text box (its label, else its role) and is logged; the rest of the step is drawn', async () => {
    const { p, logs } = port({ BAD: { ok: false, reason: 'invalid', message: 'RDKit cannot read this smiles' }, '[CH3:1]': answer([1]) });
    const out = await loadStep(step({ species: [{ role: 'reactant', structure: smiles('[CH3:1]') }, { role: 'reagent', structure: smiles('BAD'), label: 'Odd' }] }), p);
    expect(out.status === 'ready' && out.before.map((s) => s.drawn.kind)).toEqual(['structure', 'label']);
    expect(logs.length).toBe(1);
  });

  it('a step without movements is ready with noMovements true (the line "No electron movements given for this step.")', async () => {
    const { p } = port({ '[CH3:1]': answer([1]) });
    const out = await loadStep(step({ species: [{ role: 'reactant', structure: smiles('[CH3:1]') }] }), p);
    expect(out.status === 'ready' && out.noMovements).toBe(true);
  });

  it('asks the tool for every structure once, with positions', async () => {
    const { p, calls } = port({ '[CH3:1]': answer([1]), '[OH:2]': answer([2]) });
    await loadStep(step({ species: [{ role: 'reactant', structure: smiles('[CH3:1]') }, { role: 'product', structure: smiles('[OH:2]') }] }), p);
    expect(calls.sort()).toEqual(['[CH3:1]:true', '[OH:2]:true']);
  });
});
