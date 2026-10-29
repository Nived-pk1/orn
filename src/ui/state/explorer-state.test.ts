/**
 * The Reactions view's saved UI state (step 7.1b D5, ADR-042 E6): the filter, Cards or Compact and the last explorer, never records. Reading
 * is tolerant: an unusable part falls back to its default and is named; unknown ids are kept here (the view drops those that name nothing).
 */
import { describe, expect, it } from 'vitest';
import { createExplorerStore, EMPTY_EXPLORER_FILTER, parseExplorer, isFilterSet } from './explorer-state';

describe('parseExplorer', () => {
  it('nothing saved: the defaults, nothing damaged', () => {
    expect(parseExplorer(undefined)).toEqual({ filter: EMPTY_EXPLORER_FILTER, view: 'cards', last: 'reactions', damaged: [] });
  });

  it('a saved filter and view come back', () => {
    const saved = { filter: { ...EMPTY_EXPLORER_FILTER, substanceIds: ['spc_a'], usedAs: 'product', typeIds: ['cpt_x'], text: 'oxid', onlyInScope: true }, view: 'compact', last: 'reactions' };
    expect(parseExplorer(saved)).toEqual({ ...saved, damaged: [] });
  });

  it('each unusable part falls back alone and is named', () => {
    const parsed = parseExplorer({ filter: { substanceIds: 'nope', usedAs: 'sideways', typeIds: ['ok', 7], text: 5, onlyInScope: 'yes', reviewStatuses: ['verified'] }, view: 'grid', last: 'banana' });
    expect(parsed.filter).toEqual({ ...EMPTY_EXPLORER_FILTER, reviewStatuses: ['verified'] });
    expect(parsed.view).toBe('cards');
    expect([...parsed.damaged].sort()).toEqual(['explorer.filter.onlyInScope', 'explorer.filter.substanceIds', 'explorer.filter.text', 'explorer.filter.typeIds', 'explorer.filter.usedAs', 'explorer.last', 'explorer.view'].sort());
  });

  it('something that is not an object is damaged as a whole', () => {
    expect(parseExplorer(7).damaged).toEqual(['explorer']);
  });

  it('bounds the lists', () => {
    const many = Array.from({ length: 500 }, (_, i) => `id_${i}`);
    expect(parseExplorer({ filter: { typeIds: many } }).damaged).toEqual(['explorer.filter.typeIds']);
  });
});

describe('the explorer store', () => {
  it('sets parts of the filter, clears all, tells whether a filter is set', () => {
    const store = createExplorerStore();
    expect(isFilterSet(store.getState().filter)).toBe(false);
    store.getState().setFilter({ typeIds: ['cpt_x'] });
    store.getState().setFilter({ text: 'a' });
    expect(store.getState().filter).toMatchObject({ typeIds: ['cpt_x'], text: 'a' });
    expect(isFilterSet(store.getState().filter)).toBe(true);
    store.getState().clearFilter();
    expect(store.getState().filter).toEqual(EMPTY_EXPLORER_FILTER);
  });

  it('usedAs alone is not a filter (it only means something with a substance)', () => {
    const store = createExplorerStore();
    store.getState().setFilter({ usedAs: 'product' });
    expect(isFilterSet(store.getState().filter)).toBe(false);
  });

  it('the view is Cards or Compact', () => {
    const store = createExplorerStore();
    store.getState().setView('compact');
    expect(store.getState().view).toBe('compact');
  });
});

describe('the last explorer (7.2b D1)', () => {
  it('"precursors" is a known value, kept as it is; setLast changes it', () => {
    expect(parseExplorer({ last: 'precursors' })).toMatchObject({ last: 'precursors', damaged: [] });
    const store = createExplorerStore();
    store.getState().setLast('precursors');
    expect(store.getState().last).toBe('precursors');
  });
});
