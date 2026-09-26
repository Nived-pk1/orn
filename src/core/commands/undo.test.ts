/**
 * Undo/redo (INV-27, ADV-044/045): exact states, ChangeSets with causes, labels, selection hints,
 * redo cleared by new commands, batches as one entry, history limits.
 */
import { describe, expect, it } from 'vitest';
import { envelope, makeStore, mustCommit, recordIn, ref, withFields } from '../../test-support/command-kit';
import { loadFixtureState } from '../../test-support/state-fixture';
import type { HistoryEntry } from './contracts';
import { createHistory } from './history';

const SPECIES = ref('species', 'spc_max-propanone');

function noteEdit(store: ReturnType<typeof makeStore>, note: string, label = `Note ${note}`) {
  const species = recordIn(store.getState(), 'species', SPECIES.id);
  return store.dispatch({
    label,
    selectionHint: [SPECIES],
    commands: [{ type: 'record.update', record: withFields(species, { notes: note }) }],
  });
}

describe('undo and redo', () => {
  it('restore exact states, produce ChangeSets like any commit, and keep revisions increasing', () => {
    const store = makeStore();
    const s0 = store.getState();
    mustCommit(noteEdit(store, 'a'));
    const s1 = store.getState();
    mustCommit(noteEdit(store, 'b'));
    const s2 = store.getState();
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(false);

    const undone = mustCommit(store.undo() ?? { ok: false, error: { code: 'INTERNAL', message: 'null' } });
    expect(store.getState()).toEqual(s1);
    expect(undone.changes).toMatchObject({ cause: 'undo', revision: 3, label: 'Note b', updated: [SPECIES] });
    mustCommit(store.undo() ?? { ok: false, error: { code: 'INTERNAL', message: 'null' } });
    expect(store.getState()).toEqual(s0);
    expect(store.undo()).toBeNull();

    const redone = mustCommit(store.redo() ?? { ok: false, error: { code: 'INTERNAL', message: 'null' } });
    expect(redone.changes.cause).toBe('redo');
    expect(store.getState()).toEqual(s1);
    mustCommit(store.redo() ?? { ok: false, error: { code: 'INTERNAL', message: 'null' } });
    expect(store.getState()).toEqual(s2);
    expect(store.redo()).toBeNull();
    expect(store.getRevision()).toBe(6);
  });

  it('a new command clears redo; labels list the next action first', () => {
    const store = makeStore();
    mustCommit(noteEdit(store, 'a', 'First'));
    mustCommit(noteEdit(store, 'b', 'Second'));
    expect(store.historyLabels()).toEqual({ undo: ['Second', 'First'], redo: [] });
    store.undo();
    expect(store.historyLabels()).toEqual({ undo: ['First'], redo: ['Second'] });
    mustCommit(noteEdit(store, 'c', 'Third'));
    expect(store.canRedo()).toBe(false);
    expect(store.historyLabels()).toEqual({ undo: ['Third', 'First'], redo: [] });
  });

  it('a batch (cascade delete) is one entry and undoes to the exact state, findings included', () => {
    const store = makeStore();
    const before = store.getState();
    const findingsBefore = store.findings.all();
    mustCommit(
      store.dispatch(envelope('Delete concept', { type: 'record.delete', ref: ref('concept', 'cpt_max-carbocation-stability'), mode: 'apply_cascade' })),
    );
    expect(store.historyLabels().undo).toEqual(['Delete concept']);
    mustCommit(store.undo() ?? { ok: false, error: { code: 'INTERNAL', message: 'null' } });
    expect(store.getState()).toEqual(before);
    expect(store.findings.all()).toEqual(findingsBefore);
    expect(store.getIndexes().referrersOf('cpt_max-carbocation-stability').length).toBeGreaterThan(0);
  });

  it('peekHistory exposes the selection hint of the entry the next undo or redo acts on', () => {
    const store = makeStore();
    expect(store.peekHistory()).toEqual({});
    mustCommit(noteEdit(store, 'a'));
    expect(store.peekHistory().undo?.selectionHint).toEqual([SPECIES]);
    store.undo();
    expect(store.peekHistory().undo).toBeUndefined();
    expect(store.peekHistory().redo?.label).toBe('Note a');
  });

  it('subscribers hear undo and redo as ChangeSets with their causes', () => {
    const store = makeStore();
    const causes: string[] = [];
    store.subscribe((changes) => causes.push(changes.cause));
    mustCommit(noteEdit(store, 'a'));
    store.undo();
    store.redo();
    expect(causes).toEqual(['command', 'undo', 'redo']);
  });

  it('ADV-045: history is cleared by replaceState; the replaced state cannot be undone into', () => {
    const store = makeStore(loadFixtureState('minimal-valid'));
    const first = Object.values(store.getState().records.species)[0];
    if (first === undefined) throw new Error('fixture has no species');
    mustCommit(store.dispatch(envelope('Edit', { type: 'record.update', record: withFields(first, { notes: 'x' }) })));
    store.undo();
    expect(store.canRedo()).toBe(true);
    mustCommit(store.replaceState(loadFixtureState('maximal-valid'), 'migration'));
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect(store.redo()).toBeNull();
  });
});

describe('history limits', () => {
  const entry = (label: string, size = 1): HistoryEntry => ({
    label,
    revisionBefore: 0,
    revisionAfter: 1,
    patches: [{ op: 'replace', path: ['meta', 'title'], value: 'x'.repeat(size) }],
    inversePatches: [],
  });

  it('drops the oldest entries beyond the entry cap', () => {
    const history = createHistory({ maxEntries: 3, maxBytes: 1e9 });
    for (const label of ['a', 'b', 'c', 'd', 'e']) history.record(entry(label));
    expect(history.labels().undo).toEqual(['e', 'd', 'c']);
  });

  it('drops the oldest entries beyond the byte cap but always keeps the newest', () => {
    const history = createHistory({ maxEntries: 100, maxBytes: 300 });
    history.record(entry('old', 100));
    history.record(entry('mid', 100));
    history.record(entry('huge', 1000));
    expect(history.labels().undo).toEqual(['huge']);
  });

  it('redo entries survive undo and are cleared by record', () => {
    const history = createHistory();
    history.record(entry('a'));
    history.record(entry('b'));
    history.markUndone();
    expect(history.labels()).toEqual({ undo: ['a'], redo: ['b'] });
    history.markRedone();
    expect(history.labels()).toEqual({ undo: ['b', 'a'], redo: [] });
    history.markUndone();
    history.record(entry('c'));
    expect(history.labels()).toEqual({ undo: ['c', 'a'], redo: [] });
  });

  it('the store honours injected limits', () => {
    const store = makeStore(undefined, { historyLimits: { maxEntries: 2, maxBytes: 1e9 } });
    for (const note of ['a', 'b', 'c', 'd']) mustCommit(noteEdit(store, note, note));
    expect(store.historyLabels().undo).toEqual(['d', 'c']);
  });
});
