/**
 * The Precursors view's choices inside the navigator's saved entry (step 7.2a D6): read tolerantly, written back with the rest, a damaged
 * part named without touching the others. Only the QUERY is saved (target, starting materials, steps, toggles, searched): never a result.
 */
import { describe, expect, it } from 'vitest';
import { createNavigatorUi, parseNavigatorUi, type NavigatorUiPort } from './navigator-persist';

const timers = () => {
  let pending: (() => void) | undefined;
  return { after: (_ms: number, run: () => void) => ((pending = run), () => void (pending = undefined)), fire: () => pending?.() };
};

describe('the precursors part of uiState', () => {
  it('nothing saved: defaults', () => {
    expect(parseNavigatorUi(undefined).precursors).toEqual({ target: null, startFrom: [], maxSteps: 5, onlyListed: false, onlyInScope: false, searched: false, damaged: [] });
  });

  it('a damaged part is named and the rest of the entry is read', () => {
    const parsed = parseNavigatorUi({ precursors: { maxSteps: 'many' }, overviewMode: 'list' });
    expect(parsed.damaged).toContain('precursors.maxSteps');
    expect(parsed.overviewMode).toBe('list');
  });

  it('the key is known (it does not travel in the unknown fields)', () => {
    expect(parseNavigatorUi({ precursors: { maxSteps: 2 } }).extra).toEqual({});
  });

  it('is saved with the entry (debounced), holds the query and no result, and is read back', async () => {
    const saves: Record<string, unknown>[] = [];
    const port: NavigatorUiPort = { stored: undefined, mode: () => 'writable', save: (v) => (saves.push({ ...v }), Promise.resolve()) };
    const t = timers();
    const ui = createNavigatorUi(port, t);
    const store = ui.stores.precursors;
    store.getState().setTarget({ kind: 'species', id: 'spc_phenol' });
    store.getState().addStart({ kind: 'species', id: 'spc_aniline' });
    store.getState().setMaxSteps(3);
    store.getState().setOnlyListed(true);
    store.getState().setSearched(true);
    t.fire();
    await ui.flush();
    const saved = saves.at(-1) as Record<string, unknown>;
    expect(Object.keys(saved.precursors as object).sort()).toEqual(['maxSteps', 'onlyInScope', 'onlyListed', 'searched', 'startFrom', 'target']);
    const again = parseNavigatorUi(saved).precursors;
    expect(again).toMatchObject({ target: { kind: 'species', id: 'spc_phenol' }, startFrom: [{ kind: 'species', id: 'spc_aniline' }], maxSteps: 3, onlyListed: true, searched: true, damaged: [] });
  });
});
