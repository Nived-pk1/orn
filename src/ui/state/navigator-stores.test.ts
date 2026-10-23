import { describe, expect, it } from 'vitest';
import { createActiveExamStore, createExpansionStore, createFiltersStore, createNavigatorUiStores, createSelectionStore, createViewportsStore, DEFAULT_FILTERS } from './navigator-stores';

describe('the navigator UI stores', () => {
  it('start with the defaults: nothing selected or expanded, no filter, no exam version', () => {
    const stores = createNavigatorUiStores();
    expect(stores.selection.getState().selected).toBeNull();
    expect(stores.expansion.getState().expansion).toEqual({ expanded: [], collapsedEdgeIds: [] });
    expect(stores.filters.getState().filters).toEqual(DEFAULT_FILTERS);
    expect(stores.exam.getState().active).toBeNull();
    expect(stores.viewports.getState().views).toEqual({});
  });

  it('selection notifies a repeated pick (the inspector opens on a click on what is already selected) but not a repeated clear', () => {
    const store = createSelectionStore();
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.getState().select({ kind: 'node', id: 'a' });
    store.getState().select({ kind: 'node', id: 'a' });
    store.getState().select({ kind: 'edge', id: 'a' });
    store.getState().select(null);
    expect(calls).toBe(4);
  });

  it('toggle expands both ways, then collapses; prune removes the entries of unknown nodes and says which', () => {
    const store = createExpansionStore();
    expect(store.getState().toggle('a')).toBe('expanded');
    expect(store.getState().toggle('b')).toBe('expanded');
    expect(store.getState().expansion.expanded).toEqual([
      { nodeId: 'a', direction: 'both' },
      { nodeId: 'b', direction: 'both' },
    ]);
    expect(store.getState().isExpanded('a')).toBe(true);
    expect(store.getState().prune(new Set(['a']))).toEqual(['b']);
    expect(store.getState().prune(new Set(['a']))).toEqual([]);
    expect(store.getState().toggle('a')).toBe('collapsed');
    expect(store.getState().expansion.expanded).toEqual([]);
  });

  it('filters, the exam version and the viewport per view are plain values', () => {
    const filters = createFiltersStore();
    filters.getState().setFilters({ ...DEFAULT_FILTERS, scopes: ['official'] });
    expect(filters.getState().filters.scopes).toEqual(['official']);
    const exam = createActiveExamStore();
    expect(exam.getState().active).toBeNull();
    const views = createViewportsStore();
    let calls = 0;
    views.subscribe(() => (calls += 1));
    views.getState().setViewport('navigator', { x: 1, y: 2, scale: 3 });
    views.getState().setViewport('navigator', { x: 1, y: 2, scale: 3 });
    expect(calls).toBe(1);
    expect(views.getState().views.navigator).toEqual({ x: 1, y: 2, scale: 3 });
  });

  it('multi-selection (step 6.8b): toggle adds and removes, a single select or clear empties it, set replaces it', () => {
    const store = createSelectionStore();
    const a = { kind: 'node', id: 'a' } as const;
    const e = { kind: 'edge', id: 'e1' } as const;
    store.getState().toggle(a);
    store.getState().toggle(e);
    expect(store.getState().multi).toEqual([a, e]);
    store.getState().toggle(a);
    expect(store.getState().multi).toEqual([e]);
    store.getState().setMulti([a, a, e]);
    expect(store.getState().multi).toEqual([a, e]); // never the same item twice
    store.getState().select({ kind: 'node', id: 'b' });
    expect(store.getState().multi).toEqual([]);
    store.getState().toggle(a);
    store.getState().clearMulti();
    expect(store.getState().multi).toEqual([]);
  });

  it('the multi-selection is not saved with the single selection (it is never persisted)', () => {
    const store = createSelectionStore();
    store.getState().toggle({ kind: 'node', id: 'a' });
    expect(store.getState().selected).toBeNull();
  });
});
