/**
 * The Reagents view's saved UI state (7.3c D5): the chosen reagent and the list's filters, never records. Reading is tolerant: an unusable
 * part falls back to its default and is named; an id that names nothing is dropped by the view, not here.
 */
import { describe, expect, it } from 'vitest';
import { createReagentsStore, parseReagents } from './reagents-state';

describe('parseReagents', () => {
  it('nothing saved: the defaults, nothing damaged', () => {
    expect(parseReagents(undefined)).toEqual({ reagentId: null, families: [], text: '', onlyInScope: false, damaged: [] });
  });

  it('a saved choice comes back (families in the schema order)', () => {
    const saved = { reagentId: 'rgt_koh', families: ['base', 'oxidant'], text: 'pot', onlyInScope: true };
    expect(parseReagents(saved)).toEqual({ ...saved, families: ['oxidant', 'base'], damaged: [] });
  });

  it('each unusable part falls back alone and is named', () => {
    const parsed = parseReagents({ reagentId: 7, families: ['base', 'banana'], text: 5, onlyInScope: 'yes' });
    expect(parsed).toMatchObject({ reagentId: null, families: [], text: '', onlyInScope: false });
    expect([...parsed.damaged].sort()).toEqual(['reagents.families', 'reagents.onlyInScope', 'reagents.reagentId', 'reagents.text']);
  });

  it('something that is not an object is damaged as a whole', () => {
    expect(parseReagents('x').damaged).toEqual(['reagents']);
  });
});

describe('the reagents store', () => {
  it('opening a reagent clears the list filters; back keeps the choice of filters off', () => {
    const store = createReagentsStore({ families: ['base'], text: 'k' });
    store.getState().open('rgt_koh');
    expect(store.getState()).toMatchObject({ reagentId: 'rgt_koh', families: [], text: '' });
    store.getState().back();
    expect(store.getState().reagentId).toBeNull();
  });

  it('toggling a family keeps the schema order; clear empties every filter', () => {
    const store = createReagentsStore();
    store.getState().toggleFamily('base');
    store.getState().toggleFamily('oxidant');
    expect(store.getState().families).toEqual(['oxidant', 'base']);
    store.getState().toggleFamily('base');
    expect(store.getState().families).toEqual(['oxidant']);
    store.getState().setText('x');
    store.getState().setOnlyInScope(true);
    store.getState().clearFilters();
    expect(store.getState()).toMatchObject({ families: [], text: '', onlyInScope: false });
  });
});
