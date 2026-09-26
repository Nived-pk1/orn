/**
 * Store dispatch pipeline: errors, atomic batches, rejection leaves state/indexes/findings untouched
 * (INV-12), ChangeSets, subscribers, read-only, revisions, replaceState.
 */
import { describe, expect, it, vi } from 'vitest';
import { coreIndexEngine } from '../indexes/engine';
import type { CanonicalState, DatasetMeta } from '../schema';
import { validator } from '../validation';
import { envelope, makeStore, mustCommit, recordIn, ref, withFields } from '../../test-support/command-kit';
import { loadFixtureState } from '../../test-support/state-fixture';
import type { CommandErrorCode, CommitResult } from './contracts';

const SPECIES = ref('species', 'spc_max-propanone');
const code = (result: CommitResult): CommandErrorCode | 'ok' => (result.ok ? 'ok' : result.error.code);

/** The store's derived data must equal what a fresh build over its state gives. */
function expectConsistent(store: ReturnType<typeof makeStore>): void {
  const state = store.getState();
  const fresh = coreIndexEngine.build(state, store.getRevision());
  const live = store.getIndexes();
  expect(live.revision).toBe(store.getRevision());
  for (const table of Object.values(state.records)) {
    for (const record of Object.values(table)) {
      expect(live.referrersOf(record.id)).toEqual(fresh.referrersOf(record.id));
      expect(live.definersOf(record.id)).toEqual(fresh.definersOf(record.id));
    }
  }
  const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  expect([...store.findings.all()].sort(byId)).toEqual([...validator.validateAll(state, fresh)].sort(byId));
}

describe('dispatch', () => {
  it('commits an update: revision + 1, ChangeSet, findings, notification, indexes consistent', () => {
    const store = makeStore();
    const heard = vi.fn();
    store.subscribe(heard);
    const species = recordIn(store.getState(), 'species', SPECIES.id);
    const next = withFields(species, { notes: 'Edited note.' });
    const result = mustCommit(store.dispatch({ label: 'Edit note', commands: [{ type: 'record.update', record: next }] }));
    expect(store.getRevision()).toBe(1);
    expect(result.changes).toMatchObject({ revision: 1, label: 'Edit note', cause: 'command', created: [], updated: [SPECIES], deleted: [] });
    expect(result.changes.patches.length).toBeGreaterThan(0);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard.mock.calls[0]?.[0]).toBe(result.changes);
    expect(recordIn(store.getState(), 'species', SPECIES.id)).toEqual(next);
    expectConsistent(store);
  });

  it('create adds a record and ID_CONFLICT protects an existing one', () => {
    const store = makeStore();
    const source = recordIn(store.getState(), 'concept', 'cpt_max-elimination');
    const fresh = withFields(source, { id: 'cpt_new-one' });
    const created = mustCommit(store.dispatch(envelope('Add', { type: 'record.create', record: fresh })));
    expect(created.changes.created).toEqual([ref('concept', 'cpt_new-one')]);
    expect(code(store.dispatch(envelope('Again', { type: 'record.create', record: fresh })))).toBe('ID_CONFLICT');
    expectConsistent(store);
  });

  it('update errors: NOT_FOUND, IMMUTABLE_FIELD (kind vs prefix), identical record is EMPTY_COMMAND', () => {
    const store = makeStore();
    const species = recordIn(store.getState(), 'species', SPECIES.id);
    expect(code(store.dispatch(envelope('x', { type: 'record.update', record: withFields(species, { id: 'spc_nothing' }) })))).toBe('NOT_FOUND');
    expect(code(store.dispatch(envelope('x', { type: 'record.update', record: withFields(species, { kind: 'class' }) })))).toBe('IMMUTABLE_FIELD');
    expect(code(store.dispatch(envelope('x', { type: 'record.update', record: JSON.parse(JSON.stringify(species)) })))).toBe('EMPTY_COMMAND');
    expect(store.getRevision()).toBe(0);
  });

  it('rejects malformed kind and ID values without touching any table', () => {
    const store = makeStore();
    const species = recordIn(store.getState(), 'species', SPECIES.id);
    for (const bad of [withFields(species, { kind: 'nonsense' }), withFields(species, { id: '__proto__' }), withFields(species, { id: 42 })]) {
      const result = store.dispatch(envelope('x', { type: 'record.create', record: bad }));
      expect(code(result)).toBe('VALIDATION_FAILED');
    }
    expect(store.getRevision()).toBe(0);
  });

  it('INV-12: an ERROR rejects the command and leaves state, indexes and findings exactly as before', () => {
    const store = makeStore();
    const before = store.getState();
    const findingsBefore = store.findings.all();
    const species = recordIn(store.getState(), 'species', SPECIES.id);
    const broken = withFields(species, { classIds: ['cls_does-not-exist'] });
    const result = store.dispatch(envelope('Break', { type: 'record.update', record: broken }));
    expect(code(result)).toBe('VALIDATION_FAILED');
    if (!result.ok) {
      expect(result.error.findings?.length).toBeGreaterThan(0);
      expect(result.error.findings?.every((f) => f.severity === 'error')).toBe(true);
      expect(result.error.findings?.some((f) => f.ruleId === 'REF-001')).toBe(true);
    }
    expect(store.getState()).toBe(before);
    expect(store.getRevision()).toBe(0);
    expect(store.findings.all()).toEqual(findingsBefore);
    expect(store.canUndo()).toBe(false);
    expectConsistent(store);
    // and the store still works afterwards
    mustCommit(store.dispatch(envelope('Fine', { type: 'record.update', record: withFields(species, { notes: 'ok' }) })));
    expectConsistent(store);
  });

  it('a batch is atomic: a failing command rolls back the ones before it', () => {
    const store = makeStore();
    const species = recordIn(store.getState(), 'species', SPECIES.id);
    const before = store.getState();
    const result = store.dispatch(
      envelope(
        'Batch',
        { type: 'record.update', record: withFields(species, { notes: 'first' }) },
        { type: 'record.delete', ref: ref('species', 'spc_nope'), mode: 'restrict' },
      ),
    );
    expect(code(result)).toBe('NOT_FOUND');
    expect(store.getState()).toBe(before);
  });

  it('a batch sees the state left by its earlier commands (re-point then delete)', () => {
    const store = makeStore();
    const from = ref('class', 'cls_max-tertiary-alcohols');
    const to = ref('class', 'cls_max-alcohols');
    const result = mustCommit(
      store.dispatch(envelope('Merge refs', { type: 'record.replaceReferences', from, to }, { type: 'record.delete', ref: from, mode: 'restrict' })),
    );
    expect(result.changes.deleted).toEqual([from]);
    expect(store.getIndexes().referrersOf(from.id)).toEqual([]);
    expectConsistent(store);
  });

  it('created then deleted inside one batch leaves no trace in the ChangeSet', () => {
    const store = makeStore();
    const source = recordIn(store.getState(), 'concept', 'cpt_max-elimination');
    const temp = withFields(source, { id: 'cpt_temp-record' });
    const result = mustCommit(
      store.dispatch(
        envelope('Temp', { type: 'record.create', record: temp }, { type: 'record.delete', ref: ref('concept', 'cpt_temp-record'), mode: 'restrict' }, {
          type: 'record.update',
          record: withFields(recordIn(store.getState(), 'species', SPECIES.id), { notes: 'x' }),
        }),
      ),
    );
    expect(result.changes.created).toEqual([]);
    expect(result.changes.deleted).toEqual([]);
    expect(result.changes.updated).toEqual([SPECIES]);
  });

  it('EMPTY_COMMAND for an empty envelope and for commands that change nothing; STALE_REVISION on mismatch', () => {
    const store = makeStore();
    expect(code(store.dispatch({ label: 'none', commands: [] }))).toBe('EMPTY_COMMAND');
    const species = recordIn(store.getState(), 'species', SPECIES.id);
    expect(code(store.dispatch({ label: 'stale', expectedRevision: 3, commands: [{ type: 'record.update', record: withFields(species, { notes: 'x' }) }] }))).toBe('STALE_REVISION');
    expect(code(store.dispatch({ label: 'ok', expectedRevision: 0, commands: [{ type: 'record.update', record: withFields(species, { notes: 'x' }) }] }))).toBe('ok');
  });

  it('meta.update: validated, identical is a no-op, and it is undoable', () => {
    const store = makeStore();
    const meta = store.getState().meta;
    const renamed: DatasetMeta = { ...meta, title: 'Renamed dataset' };
    const result = mustCommit(store.dispatch(envelope('Rename', { type: 'meta.update', meta: renamed })));
    expect(result.changes.created.length + result.changes.updated.length + result.changes.deleted.length).toBe(0);
    expect(store.getState().meta.title).toBe('Renamed dataset');
    expect(code(store.dispatch(envelope('Same', { type: 'meta.update', meta: renamed })))).toBe('EMPTY_COMMAND');
    expect(code(store.dispatch(envelope('Bad', { type: 'meta.update', meta: { ...meta, title: '' } })))).toBe('VALIDATION_FAILED');
    mustCommit(store.undo() ?? { ok: false, error: { code: 'INTERNAL', message: 'no undo' } });
    expect(store.getState().meta).toEqual(meta);
  });

  it('read-only stores reject every write path and disable undo', () => {
    let readOnly = false;
    const store = makeStore(undefined, { readOnly: () => readOnly });
    const species = recordIn(store.getState(), 'species', SPECIES.id);
    mustCommit(store.dispatch(envelope('Edit', { type: 'record.update', record: withFields(species, { notes: 'a' }) })));
    readOnly = true;
    expect(store.isReadOnly()).toBe(true);
    expect(store.canUndo()).toBe(false);
    expect(code(store.dispatch(envelope('Edit', { type: 'record.update', record: withFields(species, { notes: 'b' }) })))).toBe('READ_ONLY');
    expect(code(store.undo() ?? { ok: true, changes: undefined as never, findings: [] })).toBe('READ_ONLY');
    expect(code(store.replaceState(loadFixtureState('minimal-valid'), 'import'))).toBe('READ_ONLY');
    expect(store.getRevision()).toBe(1);
  });

  it('subscribers all run when one throws, announcements stay in order under re-entrant dispatch, unsubscribe works', () => {
    const errors: unknown[] = [];
    const store = makeStore(undefined, { onListenerError: (e) => errors.push(e) });
    const species = recordIn(store.getState(), 'species', SPECIES.id);
    const seen: number[] = [];
    let reentered = false;
    store.subscribe((changes) => {
      seen.push(changes.revision);
      if (!reentered) {
        reentered = true;
        mustCommit(store.dispatch(envelope('Second', { type: 'record.update', record: withFields(species, { notes: 'second' }) })));
        seen.push(-1); // the nested commit must not have been announced yet
      }
    });
    store.subscribe(() => {
      throw new Error('listener failure');
    });
    const off = store.subscribe((changes) => seen.push(changes.revision * 100));
    mustCommit(store.dispatch(envelope('First', { type: 'record.update', record: withFields(species, { notes: 'first' }) })));
    expect(seen).toEqual([1, -1, 100, 2, 200]);
    expect(errors).toHaveLength(2);
    off();
    mustCommit(store.dispatch(envelope('Third', { type: 'record.update', record: withFields(species, { notes: 'third' }) })));
    expect(seen.slice(5)).toEqual([3]);
  });
});

describe('replaceState', () => {
  it('replaces the state, rebuilds indexes and findings, clears history and reports a replace ChangeSet', () => {
    const store = makeStore(loadFixtureState('minimal-valid'));
    const first = Object.values(store.getState().records.species)[0];
    if (first === undefined) throw new Error('fixture has no species');
    mustCommit(store.dispatch(envelope('Edit', { type: 'record.update', record: withFields(first, { notes: 'edit' }) })));
    expect(store.canUndo()).toBe(true);
    const next = loadFixtureState('maximal-valid');
    const result = mustCommit(store.replaceState(next, 'import'));
    expect(result.changes.cause).toBe('replace');
    expect(result.changes.revision).toBe(2);
    expect(store.getState()).toBe(next);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect(store.historyLabels()).toEqual({ undo: [], redo: [] });
    expect(store.undo()).toBeNull();
    expectConsistent(store);
  });

  it('rejects a state with validation errors or a malformed shape and changes nothing', () => {
    const store = makeStore();
    const before = store.getState();
    const species = recordIn(before, 'species', SPECIES.id);
    const broken = {
      ...before,
      records: { ...before.records, species: { ...before.records.species, [SPECIES.id]: withFields(species, { classIds: ['cls_missing'] }) } },
    } as unknown as CanonicalState;
    const invalid = store.replaceState(broken, 'restore');
    expect(code(invalid)).toBe('VALIDATION_FAILED');
    if (!invalid.ok) expect(invalid.error.findings?.length).toBeGreaterThan(0);
    const misplaced = { ...before, records: { ...before.records, species: { spc_wrong_key: species } } } as unknown as CanonicalState;
    expect(code(store.replaceState(misplaced, 'restore'))).toBe('VALIDATION_FAILED');
    const noTable = { ...before, records: { ...before.records, species: undefined } } as unknown as CanonicalState;
    expect(code(store.replaceState(noTable, 'migration'))).toBe('VALIDATION_FAILED');
    expect(store.getState()).toBe(before);
    expect(store.getRevision()).toBe(0);
    expectConsistent(store);
  });

  it('the replace patches reproduce the new state and its inverse reproduces the old one', async () => {
    const { applyPatches } = await import('immer');
    const store = makeStore(loadFixtureState('minimal-valid'));
    const old = store.getState();
    const next = loadFixtureState('maximal-valid');
    const { changes } = mustCommit(store.replaceState(next, 'restore'));
    expect(applyPatches(old, changes.patches as never)).toEqual(next);
    expect(applyPatches(next, changes.inversePatches as never)).toEqual(old);
  });
});
