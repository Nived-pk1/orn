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

describe('the reagents part of uiState (7.3c D5, E1)', () => {
  it('nothing saved: defaults; a damaged part is named and the rest is read', () => {
    expect(parseNavigatorUi(undefined).reagents).toEqual({ reagentId: null, families: [], text: '', onlyInScope: false, damaged: [] });
    const parsed = parseNavigatorUi({ reagents: { families: 'x', text: 'ok' }, overviewMode: 'list' });
    expect(parsed.damaged).toContain('reagents.families');
    expect(parsed.reagents.text).toBe('ok');
    expect(parsed.overviewMode).toBe('list');
  });

  it('"reagents" is a known explorer; an unknown one still falls back and is named', () => {
    expect(parseNavigatorUi({ explorer: { last: 'reagents' } })).toMatchObject({ explorer: { last: 'reagents', damaged: [] }, damaged: [] });
    expect(parseNavigatorUi({ explorer: { last: 'banana' } }).explorer).toMatchObject({ last: 'reactions', damaged: ['explorer.last'] });
  });

  it('is saved with the entry and read back', async () => {
    const saves: Record<string, unknown>[] = [];
    const port: NavigatorUiPort = { stored: undefined, mode: () => 'writable', save: (v) => (saves.push({ ...v }), Promise.resolve()) };
    const ui = createNavigatorUi(port, timers());
    ui.stores.reagents.getState().open('rgt_koh');
    ui.stores.reagents.getState().toggleFamily('base');
    ui.stores.explorer.getState().setLast('reagents');
    await ui.flush();
    const saved = saves.at(-1) as Record<string, unknown>;
    expect(saved.reagents).toEqual({ reagentId: 'rgt_koh', families: ['base'], text: '', onlyInScope: false });
    const again = parseNavigatorUi(saved);
    expect(again.reagents).toMatchObject({ reagentId: 'rgt_koh', families: ['base'], damaged: [] });
    expect(again.explorer.last).toBe('reagents');
  });
});

describe('the named and mechanisms parts of uiState (7.4)', () => {
  it('nothing saved: defaults; a damaged part is named and the rest is read', () => {
    expect(parseNavigatorUi(undefined).named).toEqual({ openId: null, text: '', onlyInScope: false, damaged: [] });
    expect(parseNavigatorUi(undefined).mechanisms).toEqual({ openId: null, text: '', onlyInScope: false, damaged: [] });
    const parsed = parseNavigatorUi({ named: { id: 5, text: 'ok' }, mechanisms: [], overviewMode: 'list' });
    expect(parsed.damaged).toEqual(expect.arrayContaining(['named.id', 'mechanisms']));
    expect(parsed.named.text).toBe('ok');
    expect(parsed.overviewMode).toBe('list');
  });

  it('"named" and "mechanisms" are known explorers', () => {
    expect(parseNavigatorUi({ explorer: { last: 'named' } })).toMatchObject({ explorer: { last: 'named', damaged: [] }, damaged: [] });
    expect(parseNavigatorUi({ explorer: { last: 'mechanisms' } })).toMatchObject({ explorer: { last: 'mechanisms', damaged: [] }, damaged: [] });
  });

  it('is saved with the entry and read back', async () => {
    const saves: Record<string, unknown>[] = [];
    const port: NavigatorUiPort = { stored: undefined, mode: () => 'writable', save: (v) => (saves.push({ ...v }), Promise.resolve()) };
    const ui = createNavigatorUi(port, timers());
    ui.stores.named.getState().open('nrx_aldol');
    ui.stores.mechanisms.getState().setText('sn2');
    ui.stores.explorer.getState().setLast('mechanisms');
    await ui.flush();
    const saved = saves.at(-1) as Record<string, unknown>;
    expect(saved.named).toEqual({ id: 'nrx_aldol', text: '', onlyInScope: false });
    expect(saved.mechanisms).toEqual({ id: null, text: 'sn2', onlyInScope: false });
    const again = parseNavigatorUi(saved);
    expect(again.named).toMatchObject({ openId: 'nrx_aldol', damaged: [] });
    expect(again.mechanisms).toMatchObject({ text: 'sn2', damaged: [] });
    expect(again.explorer.last).toBe('mechanisms');
  });
});
