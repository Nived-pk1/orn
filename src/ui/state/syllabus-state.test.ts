/** The Syllabus view's UI state (7.6 D): the chosen version, the version compared with, "Gaps only"; saved in the navigator entry, read tolerantly. */
import { describe, expect, it } from 'vitest';
import { createNavigatorUi, parseNavigatorUi, type NavigatorUiPort } from './navigator-persist';
import { createSyllabusStore, parseSyllabus } from './syllabus-state';

describe('the store', () => {
  it('starts with no choice (the view picks the default) and no comparison', () => {
    expect(createSyllabusStore().getState()).toMatchObject({ versionId: null, compareId: null, gapsOnly: false });
  });
  it('choosing another version drops the comparison (it belonged to the old choice)', () => {
    const store = createSyllabusStore({ versionId: 'exv_a', compareId: 'exv_b' });
    store.getState().setVersion('exv_c');
    expect(store.getState()).toMatchObject({ versionId: 'exv_c', compareId: null });
  });
  it('compare and "Gaps only" are set alone', () => {
    const store = createSyllabusStore({ versionId: 'exv_a' });
    store.getState().setCompare('exv_b');
    store.getState().setGapsOnly(true);
    expect(store.getState()).toMatchObject({ versionId: 'exv_a', compareId: 'exv_b', gapsOnly: true });
    store.getState().setCompare(null);
    expect(store.getState().compareId).toBeNull();
  });
});

describe('parseSyllabus (tolerant)', () => {
  it('absent: defaults, nothing damaged', () => {
    expect(parseSyllabus(undefined)).toEqual({ versionId: null, compareId: null, gapsOnly: false, damaged: [] });
  });
  it('each damaged part falls back alone and is named', () => {
    const parsed = parseSyllabus({ versionId: 7, compareId: 'exv_b', gapsOnly: 'yes' });
    expect(parsed).toMatchObject({ versionId: null, compareId: 'exv_b', gapsOnly: false });
    expect([...parsed.damaged].sort()).toEqual(['syllabus.gapsOnly', 'syllabus.versionId']);
  });
  it('a value that is not an object is damaged as a whole', () => {
    expect(parseSyllabus('x')).toMatchObject({ versionId: null, damaged: ['syllabus'] });
  });
  it('reads good values', () => {
    expect(parseSyllabus({ versionId: 'exv_a', compareId: 'exv_b', gapsOnly: true })).toEqual({ versionId: 'exv_a', compareId: 'exv_b', gapsOnly: true, damaged: [] });
  });
});

describe('inside the navigator entry', () => {
  it('the key is known, saved and read back', async () => {
    const saves: Record<string, unknown>[] = [];
    const port: NavigatorUiPort = { stored: undefined, mode: () => 'writable', save: (v) => (saves.push({ ...v }), Promise.resolve()) };
    let fire: (() => void) | undefined;
    const ui = createNavigatorUi(port, { after: (_ms, run) => ((fire = run), () => undefined) });
    ui.stores.syllabus.getState().setVersion('exv_a');
    ui.stores.syllabus.getState().setCompare('exv_b');
    ui.stores.syllabus.getState().setGapsOnly(true);
    fire?.();
    await ui.flush();
    const saved = saves.at(-1) as Record<string, unknown>;
    expect(saved.syllabus).toEqual({ versionId: 'exv_a', compareId: 'exv_b', gapsOnly: true });
    const parsed = parseNavigatorUi(saved);
    expect(parsed.syllabus).toMatchObject({ versionId: 'exv_a', compareId: 'exv_b', gapsOnly: true });
    expect(parsed.damaged).toEqual([]);
  });
  it('a damaged saved syllabus is named in `damaged`', () => {
    expect(parseNavigatorUi({ syllabus: { gapsOnly: 3 } }).damaged).toContain('syllabus.gapsOnly');
  });
});
