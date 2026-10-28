/** The Precursors view's UI state (step 7.2a D6): the choices and the last search's QUERY, never a result; read tolerantly. */
import { describe, expect, it } from 'vitest';
import { createPrecursorsStore, DEFAULT_PRECURSOR_STEPS, parsePrecursors } from './precursor-state';

const T = { kind: 'species', id: 'spc_phenol' } as const;
const S = { kind: 'class', id: 'cls_alcohols' } as const;

describe('the store', () => {
  it('starts empty with the engine default steps chosen', () => {
    const state = createPrecursorsStore().getState();
    expect(state).toMatchObject({ target: null, startFrom: [], maxSteps: DEFAULT_PRECURSOR_STEPS, onlyListed: false, onlyInScope: false, searched: false });
    expect(DEFAULT_PRECURSOR_STEPS).toBe(5);
  });
  it('a new target clears "searched"; start-from keeps each substance once and removes by id', () => {
    const store = createPrecursorsStore({ target: T, searched: true });
    store.getState().addStart(S);
    store.getState().addStart(S);
    expect(store.getState().startFrom).toEqual([S]);
    store.getState().removeStart(S.id);
    expect(store.getState().startFrom).toEqual([]);
    store.getState().setTarget({ kind: 'species', id: 'spc_other' });
    expect(store.getState().searched).toBe(false);
  });
  it('"only the listed starting materials" is off when there is no start-from', () => {
    const store = createPrecursorsStore({ startFrom: [S], onlyListed: true });
    store.getState().removeStart(S.id);
    expect(store.getState().onlyListed).toBe(false);
  });
  it('steps are held to 1 to 5', () => {
    const store = createPrecursorsStore();
    store.getState().setMaxSteps(9);
    expect(store.getState().maxSteps).toBe(5);
    store.getState().setMaxSteps(0);
    expect(store.getState().maxSteps).toBe(1);
  });
});

describe('parsePrecursors (tolerant)', () => {
  it('absent: defaults, nothing damaged', () => {
    expect(parsePrecursors(undefined)).toMatchObject({ target: null, startFrom: [], maxSteps: 5, damaged: [] });
  });
  it('a good entry comes back as it was saved', () => {
    const saved = { target: T, startFrom: [S], maxSteps: 3, onlyListed: true, onlyInScope: true, searched: true };
    expect(parsePrecursors(saved)).toEqual({ ...saved, damaged: [] });
  });
  it('each bad part falls back alone and is named', () => {
    const parsed = parsePrecursors({ target: { kind: 'reaction', id: 'rxn_x' }, startFrom: [S, 7], maxSteps: 'many', onlyListed: 'yes', onlyInScope: true, searched: 3 });
    expect(parsed).toMatchObject({ target: null, startFrom: [], maxSteps: 5, onlyListed: false, onlyInScope: true, searched: false });
    expect(parsed.damaged).toEqual(['precursors.target', 'precursors.startFrom', 'precursors.maxSteps', 'precursors.onlyListed', 'precursors.searched']);
  });
  it('anything but an object is one damaged part', () => {
    expect(parsePrecursors('x')).toMatchObject({ target: null, damaged: ['precursors'] });
  });
  it('a start-from list longer than the limit is damaged, not cut', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ kind: 'species', id: `spc_${i}` }));
    expect(parsePrecursors({ startFrom: many })).toMatchObject({ startFrom: [], damaged: ['precursors.startFrom'] });
  });
});
