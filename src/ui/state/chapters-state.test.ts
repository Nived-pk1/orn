/** The Chapters view's UI state (step 7.3b D6): the open chapter and the filters; saved in the navigator entry, read tolerantly. */
import { describe, expect, it } from 'vitest';
import { createChaptersStore, parseChapters } from './chapters-state';
import { createNavigatorUi, parseNavigatorUi, type NavigatorUiPort } from './navigator-persist';

describe('the store', () => {
  it('starts on the chapter list with no filter', () => {
    expect(createChaptersStore().getState()).toMatchObject({ chapterId: null, kinds: [], text: '', onlyInScope: false });
  });
  it('opening a chapter clears the filters of the one before; going back keeps the choice for "back"', () => {
    const store = createChaptersStore({ chapterId: 'top_a', kinds: ['concepts'], text: 'x' });
    store.getState().open('top_b');
    expect(store.getState()).toMatchObject({ chapterId: 'top_b', kinds: [], text: '' });
    store.getState().back();
    expect(store.getState().chapterId).toBeNull();
  });
  it('kind chips toggle, in the page order, each once', () => {
    const store = createChaptersStore();
    store.getState().toggleKind('reactions');
    store.getState().toggleKind('concepts');
    store.getState().toggleKind('reactions');
    expect(store.getState().kinds).toEqual(['concepts']);
  });
});

describe('parseChapters (tolerant)', () => {
  it('absent: defaults, nothing damaged', () => {
    expect(parseChapters(undefined)).toEqual({ chapterId: null, kinds: [], text: '', onlyInScope: false, damaged: [] });
  });
  it('each damaged part falls back alone and is named', () => {
    const parsed = parseChapters({ chapterId: 5, kinds: ['concepts', 'bogus'], text: 'abc', onlyInScope: 'yes' });
    expect(parsed).toMatchObject({ chapterId: null, kinds: [], text: 'abc', onlyInScope: false });
    expect([...parsed.damaged].sort()).toEqual(['chapters.chapterId', 'chapters.kinds', 'chapters.onlyInScope']);
  });
  it('reads good values', () => {
    expect(parseChapters({ chapterId: 'top_a', kinds: ['reactions'], text: 'q', onlyInScope: true })).toMatchObject({ chapterId: 'top_a', kinds: ['reactions'], text: 'q', onlyInScope: true, damaged: [] });
  });
});

describe('inside the navigator entry', () => {
  it('the key is known, and is saved and read back', async () => {
    const saves: Record<string, unknown>[] = [];
    const port: NavigatorUiPort = { stored: undefined, mode: () => 'writable', save: (v) => (saves.push({ ...v }), Promise.resolve()) };
    let fire: (() => void) | undefined;
    const ui = createNavigatorUi(port, { after: (_ms, run) => ((fire = run), () => undefined) });
    ui.stores.chapters.getState().open('top_a');
    ui.stores.chapters.getState().setText('amide');
    fire?.();
    await ui.flush();
    const saved = saves.at(-1) as Record<string, unknown>;
    expect(parseNavigatorUi(saved).chapters).toMatchObject({ chapterId: 'top_a', text: 'amide', damaged: [] });
    expect(parseNavigatorUi({ chapters: { text: 'a' } }).extra).toEqual({});
  });
});
