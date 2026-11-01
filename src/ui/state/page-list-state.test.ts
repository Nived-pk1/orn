import { describe, expect, it } from 'vitest';
import { createPageListStore, parsePageList } from './page-list-state';

describe('the list-and-page state (7.4)', () => {
  it('opens a page with clean filters and comes back to the list', () => {
    const store = createPageListStore({ text: 'ald', onlyInScope: true });
    store.getState().open('nrx_aldol');
    expect(store.getState()).toMatchObject({ openId: 'nrx_aldol', text: '', onlyInScope: false });
    store.getState().back();
    expect(store.getState().openId).toBeNull();
  });
  it('the name box is bounded; filters clear', () => {
    const store = createPageListStore();
    store.getState().setText('x'.repeat(500));
    expect(store.getState().text).toHaveLength(200);
    store.getState().setOnlyInScope(true);
    store.getState().clearFilters();
    expect(store.getState()).toMatchObject({ text: '', onlyInScope: false });
  });
  it('reads a saved value tolerantly: a bad part falls back and is named', () => {
    expect(parsePageList(undefined, 'named')).toEqual({ openId: null, text: '', onlyInScope: false, damaged: [] });
    expect(parsePageList({ id: 'nrx_a', text: 'ab', onlyInScope: true }, 'named')).toEqual({ openId: 'nrx_a', text: 'ab', onlyInScope: true, damaged: [] });
    expect(parsePageList({ id: 7, text: 'ok', onlyInScope: 'yes' }, 'named')).toEqual({ openId: null, text: 'ok', onlyInScope: false, damaged: ['named.id', 'named.onlyInScope'] });
    expect(parsePageList([], 'mechanisms').damaged).toEqual(['mechanisms']);
    expect(parsePageList(null, 'mechanisms').damaged).toEqual(['mechanisms']);
  });
});
