/**
 * How an entry point opens Reactions (step 7.1b E2, E3): the filter a record stands for, and what opening does to the explorer's UI state.
 */
import { describe, expect, it } from 'vitest';
import { createNavigatorUiStores, EMPTY_EXPLORER_FILTER } from '@/ui/state';
import { filterFor, openReactions } from './reactions-entry';

describe('filterFor', () => {
  it.each(['species', 'class', 'reagent'])('a %s is a substance used as Any', (kind) => {
    expect(filterFor({ kind, id: 'x_1' } as never)).toEqual({ substanceIds: ['x_1'], usedAs: 'any' });
  });
  it('a named reaction is a named-reaction filter', () => {
    expect(filterFor({ kind: 'named_reaction', id: 'nrx_1' } as never)).toEqual({ namedReactionIds: ['nrx_1'] });
  });
  it('any other record stands for no filter', () => {
    expect(filterFor({ kind: 'concept', id: 'c' } as never)).toBeUndefined();
    expect(filterFor({ kind: 'reaction', id: 'r' } as never)).toBeUndefined();
  });
});

describe('openReactions', () => {
  it('replaces the filter (the old one does not linger), keeps Cards/Compact, remembers the phone tab and asks for the mode', () => {
    const ui = createNavigatorUiStores();
    ui.explorer.getState().setFilter({ typeIds: ['cpt_old'], text: 'old' });
    ui.explorer.getState().setView('compact');
    const modes: string[] = [];
    openReactions(ui, (mode) => modes.push(mode), { substanceIds: ['spc_1'], usedAs: 'any' });
    expect(ui.explorer.getState().filter).toEqual({ ...EMPTY_EXPLORER_FILTER, substanceIds: ['spc_1'] });
    expect(ui.explorer.getState().view).toBe('compact');
    expect(ui.overview.getState().phoneTab).toBe('explore');
    expect(ui.family.getState().open).toBeNull();
    expect(modes).toEqual(['reactions']);
  });

  it('an arrow: From and To set, the same family twice for a loop', () => {
    const ui = createNavigatorUiStores();
    openReactions(ui, () => undefined, { fromFamilyIds: ['cls_a'], toFamilyIds: ['cls_a'] });
    expect(ui.explorer.getState().filter).toMatchObject({ fromFamilyIds: ['cls_a'], toFamilyIds: ['cls_a'] });
  });
});
