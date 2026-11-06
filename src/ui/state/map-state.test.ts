/** The map's UI state (step 8.2a, D2, D5, D7): the chapter and "Unclassified shown" are saved; the focus is not. */
import { describe, expect, it } from 'vitest';
import { createMapStore, parseMap } from './map-state';
import { createNavigatorUi, parseNavigatorUi, type NavigatorUiPort } from './navigator-persist';

const timers = () => ({ after: (_ms: number, _run: () => void) => () => undefined });

describe('parseMap', () => {
  it('nothing saved: all chapters, Unclassified hidden, no damage', () => {
    expect(parseMap(undefined)).toEqual({ chapterId: null, showUnclassified: false, fitRule: null, damaged: [] });
  });

  it('reads a good part and names a damaged field without touching the other', () => {
    expect(parseMap({ chapterId: 'top_a', showUnclassified: true })).toEqual({ chapterId: 'top_a', showUnclassified: true, fitRule: null, damaged: [] });
    const bad = parseMap({ chapterId: 7, showUnclassified: true });
    expect(bad).toMatchObject({ chapterId: null, showUnclassified: true });
    expect(bad.damaged).toEqual(['map.chapterId']);
    expect(parseMap('nope').damaged).toEqual(['map']);
  });
});

describe('the map store', () => {
  it('holds the focus, which is not part of the saved choices', () => {
    const store = createMapStore();
    store.getState().setFocus('hub-a');
    expect(store.getState().focusId).toBe('hub-a');
    store.getState().setFocus(null);
    expect(store.getState().focusId).toBeNull();
  });

  it('choosing a chapter clears the focus (a focus from another set of arrows would mislead)', () => {
    const store = createMapStore();
    store.getState().setFocus('hub-a');
    store.getState().setChapter('top_a');
    expect(store.getState().chapterId).toBe('top_a');
    expect(store.getState().focusId).toBeNull();
  });
});

describe('the map part of uiState', () => {
  it('is saved with the entry and read back; the focus is not saved', async () => {
    const saves: Record<string, unknown>[] = [];
    const port: NavigatorUiPort = { stored: undefined, mode: () => 'writable', save: (v) => (saves.push({ ...v }), Promise.resolve()) };
    const ui = createNavigatorUi(port, { after: (_ms, run) => { run(); return () => undefined; } });
    ui.stores.map.getState().setChapter('top_a');
    ui.stores.map.getState().setShowUnclassified(true);
    ui.stores.map.getState().setFocus('hub-a');
    await ui.flush();
    const saved = saves.at(-1) as Record<string, unknown>;
    expect(saved.map).toEqual({ chapterId: 'top_a', showUnclassified: true, fitRule: 3 });
    const again = createNavigatorUi({ stored: saved, mode: () => 'writable', save: () => Promise.resolve() }, timers());
    expect(again.stores.map.getState()).toMatchObject({ chapterId: 'top_a', showUnclassified: true, focusId: null });
    ui.dispose();
    again.dispose();
  });

  it('opening a chapter in the Chapters view makes it the map\'s chapter (D7); "No chapter yet" does not', () => {
    const ui = createNavigatorUi({ stored: undefined, mode: () => 'writable', save: () => Promise.resolve() }, timers());
    ui.stores.chapters.getState().open('top_b');
    expect(ui.stores.map.getState().chapterId).toBe('top_b');
    ui.stores.chapters.getState().open('none');
    expect(ui.stores.map.getState().chapterId).toBe('top_b');
    ui.dispose();
  });

  it('a stored part is read tolerantly by the whole entry parser', () => {
    expect(parseNavigatorUi({ map: { chapterId: 'top_c' } }).map).toEqual({ chapterId: 'top_c', showUnclassified: false, fitRule: null, damaged: [] });
    expect(parseNavigatorUi({ map: { showUnclassified: 'yes' } }).damaged).toContain('map.showUnclassified');
  });
});
