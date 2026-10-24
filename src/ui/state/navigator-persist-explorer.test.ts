/**
 * The Reactions view's state inside the navigator's saved entry (step 7.1b D5, E1): the explorer part and the phone's Explore tab are read
 * tolerantly, written back with the rest, and a damaged part is named without touching the others.
 */
import { describe, expect, it } from 'vitest';
import { EMPTY_EXPLORER_FILTER } from './explorer-state';
import { createNavigatorUi, parseNavigatorUi, type NavigatorUiPort } from './navigator-persist';
import { SAVE_DEBOUNCE_MS } from './panels';

const timers = () => {
  let pending: (() => void) | undefined;
  return { after: (_ms: number, run: () => void) => ((pending = run), () => void (pending = undefined)), fire: () => pending?.() };
};

describe('the explorer part of uiState', () => {
  it('nothing saved: defaults', () => {
    expect(parseNavigatorUi(undefined).explorer).toEqual({ filter: EMPTY_EXPLORER_FILTER, view: 'cards', last: 'reactions', damaged: [] });
  });

  it('a damaged explorer is named and the rest of the entry is read', () => {
    const parsed = parseNavigatorUi({ explorer: { view: 'grid' }, overviewMode: 'list' });
    expect(parsed.damaged).toContain('explorer.view');
    expect(parsed.overviewMode).toBe('list');
  });

  it('the Explore tab is a phone tab', () => {
    expect(parseNavigatorUi({ phoneTab: 'explore' })).toMatchObject({ phoneTab: 'explore', damaged: [] });
  });

  it('is saved with the entry (debounced) and read back', async () => {
    const saves: Record<string, unknown>[] = [];
    const port: NavigatorUiPort = { stored: undefined, mode: () => 'writable', save: (v) => (saves.push({ ...v }), Promise.resolve()) };
    const t = timers();
    const ui = createNavigatorUi(port, t);
    ui.stores.explorer.getState().setFilter({ typeIds: ['cpt_x'] });
    ui.stores.explorer.getState().setView('compact');
    ui.stores.overview.getState().setPhoneTab('explore');
    expect(SAVE_DEBOUNCE_MS).toBeGreaterThan(0);
    t.fire();
    await ui.flush();
    const saved = saves.at(-1) as Record<string, unknown>;
    expect(saved.phoneTab).toBe('explore');
    const again = parseNavigatorUi(saved);
    expect(again.explorer.filter.typeIds).toEqual(['cpt_x']);
    expect(again.explorer.view).toBe('compact');
    expect(again.damaged).toEqual([]);
  });
});
