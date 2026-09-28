/**
 * ADR-033: a follower (read-only) store mirrors the writer through `applyRemote` and `reload`. Both are refused as a
 * value on a writable store (INV-28). No ERROR gate, no history, `cause: 'remote'`, indexes and findings equal a
 * fresh build after every mirror.
 */
import { describe, expect, it, vi } from 'vitest';
import { coreIndexEngine } from '../indexes/engine';
import type { AnyRecord, CanonicalState } from '../schema';
import { validator } from '../validation';
import { envelope, makeStore, mustCommit, recordIn, ref, withFields } from '../../test-support/command-kit';
import { commit, loadFixtureState, remove } from '../../test-support/state-fixture';
import type { CommitResult, RemoteChange } from './contracts';

const SPECIES = 'spc_max-propanone';
const base = loadFixtureState('maximal-valid');
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const code = (result: CommitResult): string => (result.ok ? 'ok' : result.error.code);

function follower(state: CanonicalState = base, revision = 0) {
  let readOnly = true;
  const store = makeStore(state, { readOnly: () => readOnly, revision });
  return { store, promote: () => void (readOnly = false) };
}

/** The store's derived data must equal a fresh build over its state, and its revision must be the index revision. */
function expectConsistent(store: ReturnType<typeof makeStore>): void {
  const state = store.getState();
  const fresh = coreIndexEngine.build(state, store.getRevision());
  const live = store.getIndexes();
  expect(live.revision).toBe(store.getRevision());
  for (const table of Object.values(state.records)) {
    for (const record of Object.values(table)) {
      expect(live.referrersOf(record.id)).toEqual(fresh.referrersOf(record.id));
      expect(live.definersOf(record.id)).toEqual(fresh.definersOf(record.id));
      expect(live.linkersOf(record.id)).toEqual(fresh.linkersOf(record.id));
      expect(live.byFoldedName(record.kind, record.id.toLowerCase())).toEqual(fresh.byFoldedName(record.kind, record.id.toLowerCase()));
    }
  }
  expect([...store.findings.all()].sort(byId)).toEqual([...validator.validateAll(state, fresh)].sort(byId));
}

/** What a follower would read from storage after the writer moved from `before` to `after`. */
function remoteChange(fromRevision: number, revision: number, before: CanonicalState, after: CanonicalState): RemoteChange {
  const upserts: AnyRecord[] = [];
  const deletedIds: string[] = [];
  const ids = new Set<string>();
  for (const state of [before, after]) for (const table of Object.values(state.records)) for (const id of Object.keys(table)) ids.add(id);
  for (const id of [...ids].sort()) {
    const now = Object.values(after.records).map((t) => (t as Record<string, AnyRecord>)[id]).find((r) => r !== undefined);
    const was = Object.values(before.records).map((t) => (t as Record<string, AnyRecord>)[id]).find((r) => r !== undefined);
    if (now === undefined) deletedIds.push(id);
    else if (now !== was) upserts.push(now);
  }
  return { fromRevision, revision, upserts, deletedIds, ...(before.meta === after.meta ? {} : { meta: after.meta }) };
}

describe('ADR-033 guards: applyRemote and reload are refused as values on a writable store (INV-28)', () => {
  it('a writable store refuses both, and nothing changes: state, revision, indexes, findings, subscribers', () => {
    const store = makeStore(base);
    const heard = vi.fn();
    store.subscribe(heard);
    const species = recordIn(store.getState(), 'species', SPECIES);
    const change: RemoteChange = { fromRevision: 0, revision: 1, upserts: [withFields(species, { notes: 'x' })], deletedIds: [] };
    const applied = store.applyRemote(change);
    const reloaded = store.reload(loadFixtureState('minimal-valid'), 5);
    expect([code(applied), code(reloaded)]).toEqual(['NOT_FOLLOWER', 'NOT_FOLLOWER']);
    expect(applied.ok ? '' : applied.error.message).toMatch(/INV-28/);
    expect(store.getState()).toBe(base);
    expect(store.getRevision()).toBe(0);
    expect(heard).not.toHaveBeenCalled();
    expectConsistent(store);
  });

  it('the guard follows the read-only flag: a promoted store refuses again', () => {
    const f = follower();
    const species = recordIn(f.store.getState(), 'species', SPECIES);
    const change = (revision: number): RemoteChange => ({ fromRevision: revision - 1, revision, upserts: [withFields(species, { notes: `n${revision}` })], deletedIds: [] });
    expect(code(f.store.applyRemote(change(1)))).toBe('ok');
    f.promote();
    expect(code(f.store.applyRemote(change(2)))).toBe('NOT_FOLLOWER');
    expect(f.store.getRevision()).toBe(1);
  });
});

describe('applyRemote mirrors one persisted transaction of the writer', () => {
  it('one commit: the follower equals the writer, revision and indexes too, announced with cause remote and no history', () => {
    const writer = makeStore(base);
    const f = follower();
    const heard = vi.fn();
    f.store.subscribe(heard);
    const species = recordIn(writer.getState(), 'species', SPECIES);
    mustCommit(writer.dispatch(envelope('Edit', { type: 'record.update', record: withFields(species, { notes: 'Edited.' }) })));
    const result = mustCommit(f.store.applyRemote(remoteChange(0, 1, base, writer.getState())));
    expect(f.store.getState()).toEqual(writer.getState());
    expect(f.store.getRevision()).toBe(1);
    expect(result.changes).toMatchObject({ revision: 1, cause: 'remote', created: [], updated: [ref('species', SPECIES)], deleted: [] });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard.mock.calls[0]?.[0]).toBe(result.changes);
    expect(f.store.canUndo()).toBe(false);
    expect(f.store.historyLabels()).toEqual({ undo: [], redo: [] });
    expectConsistent(f.store);
  });

  it('a coalesced span (create, update, delete over three revisions) applies as one step and lands on the writer state', () => {
    const writer = makeStore(base);
    const f = follower();
    const source = recordIn(writer.getState(), 'concept', 'cpt_max-elimination');
    const species = recordIn(writer.getState(), 'species', SPECIES);
    mustCommit(writer.dispatch(envelope('Add', { type: 'record.create', record: withFields(source, { id: 'cpt_span-new' }) })));
    mustCommit(writer.dispatch(envelope('Edit', { type: 'record.update', record: withFields(species, { notes: 'two' }) })));
    mustCommit(writer.dispatch(envelope('Add and drop', { type: 'record.create', record: withFields(source, { id: 'cpt_span-gone' }) })));
    mustCommit(writer.dispatch(envelope('Drop', { type: 'record.delete', ref: ref('concept', 'cpt_span-gone'), mode: 'restrict' })));
    expect(writer.getRevision()).toBe(4);
    const result = mustCommit(f.store.applyRemote(remoteChange(0, 4, base, writer.getState())));
    expect(f.store.getState()).toEqual(writer.getState());
    expect(f.store.getRevision()).toBe(4);
    expect(result.changes.revision).toBe(4);
    expect(result.changes.created).toEqual([ref('concept', 'cpt_span-new')]);
    expectConsistent(f.store);
    // and the next span continues from 4
    mustCommit(writer.dispatch(envelope('Again', { type: 'record.update', record: withFields(recordIn(writer.getState(), 'species', SPECIES), { notes: 'five' }) })));
    mustCommit(f.store.applyRemote(remoteChange(4, 5, f.store.getState(), writer.getState())));
    expect(f.store.getState()).toEqual(writer.getState());
    expectConsistent(f.store);
  });

  it('an ID the writer created and deleted inside the span, and a delete of an unknown ID, are harmless', () => {
    const f = follower();
    const result = f.store.applyRemote({ fromRevision: 0, revision: 3, upserts: [], deletedIds: ['cpt_never-existed', 'spc_also-not-here'] });
    expect(result.ok).toBe(true);
    expect(f.store.getState().records).toEqual(base.records);
    expect(f.store.getRevision()).toBe(3);
    expectConsistent(f.store);
  });

  it('a changed dataset meta is applied', () => {
    const writer = makeStore(base);
    const f = follower();
    const meta = { ...base.meta, title: 'Renamed by the writer' };
    mustCommit(writer.dispatch(envelope('Rename', { type: 'meta.update', meta })));
    mustCommit(f.store.applyRemote({ fromRevision: 0, revision: 1, upserts: [], deletedIds: [], meta: writer.getState().meta }));
    expect(f.store.getState().meta.title).toBe('Renamed by the writer');
    expectConsistent(f.store);
  });

  it('STALE_REVISION when fromRevision is not the current revision, or the change does not move forward: nothing changes', () => {
    const f = follower(base, 5);
    const species = recordIn(f.store.getState(), 'species', SPECIES);
    const edit = withFields(species, { notes: 'stale' });
    const heard = vi.fn();
    f.store.subscribe(heard);
    for (const change of [
      { fromRevision: 4, revision: 6 },
      { fromRevision: 6, revision: 7 },
      { fromRevision: 5, revision: 5 },
      { fromRevision: 5, revision: 4 },
      { fromRevision: 5, revision: 5.5 },
    ]) {
      expect(code(f.store.applyRemote({ ...change, upserts: [edit], deletedIds: [] }))).toBe('STALE_REVISION');
    }
    expect(f.store.getState()).toBe(base);
    expect(f.store.getRevision()).toBe(5);
    expect(heard).not.toHaveBeenCalled();
    expectConsistent(f.store);
  });

  it('no ERROR gate: a durable state with an error is mirrored, and the error is a finding (never silent)', () => {
    const f = follower();
    const species = recordIn(f.store.getState(), 'species', SPECIES);
    const broken = withFields(species, { classIds: ['cls_does-not-exist'] });
    const result = f.store.applyRemote({ fromRevision: 0, revision: 1, upserts: [broken], deletedIds: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(recordIn(f.store.getState(), 'species', SPECIES)).toEqual(broken);
    expect(result.findings.some((finding) => finding.severity === 'error' && finding.subject.id === SPECIES)).toBe(true);
    expect(f.store.findings.all().some((finding) => finding.severity === 'error' && finding.subject.id === SPECIES)).toBe(true);
    expectConsistent(f.store);
  });

  it('a record the writer changed to another kind under the same ID is moved, not duplicated', () => {
    const f = follower();
    const concept = recordIn(base, 'concept', 'cpt_max-elimination');
    const asSpecies = { ...recordIn(base, 'species', SPECIES), id: concept.id } as AnyRecord;
    const result = f.store.applyRemote({ fromRevision: 0, revision: 1, upserts: [asSpecies], deletedIds: [] });
    expect(result.ok).toBe(true);
    expect(Object.hasOwn(f.store.getState().records.concept, concept.id)).toBe(false);
    expect(Object.hasOwn(f.store.getState().records.species, concept.id)).toBe(true);
  });
});

describe('the index engine takes a remote span incrementally, and only a remote one', () => {
  const species = Object.values(base.records.species)[0] as AnyRecord;
  const drop = (t: Parameters<typeof remove>[0]) => remove(t, 'species', species.id);

  it("a 'remote' ChangeSet may skip revisions: apply is incremental (the previous handle goes stale) and equals a fresh build", () => {
    const ix = coreIndexEngine.build(base, 2);
    const { after, changes } = commit(base, 6, drop, 'remote');
    const next = coreIndexEngine.apply(ix, changes, after);
    expect(next.revision).toBe(6);
    expect(() => ix.get(species.id)).toThrow(/Stale/);
    const fresh = coreIndexEngine.build(after, 6);
    for (const id of Object.keys(base.records.class)) expect(next.referrersOf(id)).toEqual(fresh.referrersOf(id));
    expect(next.get(species.id)).toBeUndefined();
  });

  it('any other cause that skips a revision is still rebuilt, never applied blindly (the gap guard is unchanged)', () => {
    const ix = coreIndexEngine.build(base, 2);
    const { after, changes } = commit(base, 6, drop, 'command');
    const next = coreIndexEngine.apply(ix, changes, after);
    expect(next.revision).toBe(6);
    expect(ix.get(species.id)).toBeDefined(); // not consumed: this was a rebuild
  });
});

describe('reload adopts a whole state read from storage at its own revision', () => {
  it('any revision (not revision + 1), indexes and findings rebuilt, history cleared, announced as remote', () => {
    let readOnly = false;
    const store = makeStore(base, { readOnly: () => readOnly });
    const species = recordIn(store.getState(), 'species', SPECIES);
    mustCommit(store.dispatch(envelope('Edit', { type: 'record.update', record: withFields(species, { notes: 'local' }) })));
    expect(store.canUndo()).toBe(true);
    readOnly = true;
    const heard = vi.fn();
    store.subscribe(heard);
    const other = loadFixtureState('minimal-valid');
    const result = mustCommit(store.reload(other, 40));
    expect(store.getState()).toBe(other);
    expect(store.getRevision()).toBe(40);
    expect(result.changes).toMatchObject({ revision: 40, cause: 'remote' });
    expect(heard).toHaveBeenCalledTimes(1);
    readOnly = false;
    expect(store.canUndo()).toBe(false);
    expect(store.historyLabels()).toEqual({ undo: [], redo: [] });
    expectConsistent(store);
  });

  it('promotion: reload, then writable: the next commit is revision + 1 and undo covers only new commits', () => {
    const f = follower();
    const writer = makeStore(base);
    const species = recordIn(writer.getState(), 'species', SPECIES);
    mustCommit(writer.dispatch(envelope('Edit', { type: 'record.update', record: withFields(species, { notes: 'by the old writer' }) })));
    mustCommit(f.store.reload(writer.getState(), writer.getRevision()));
    expect(f.store.isReadOnly()).toBe(true);
    f.promote();
    const mine = withFields(recordIn(f.store.getState(), 'species', SPECIES), { notes: 'by me' });
    const result = mustCommit(f.store.dispatch(envelope('Mine', { type: 'record.update', record: mine })));
    expect(result.changes.revision).toBe(2);
    expect(f.store.historyLabels().undo).toEqual(['Mine']);
    mustCommit(f.store.undo() ?? { ok: false, error: { code: 'INTERNAL', message: 'no undo' } });
    expect(f.store.canUndo()).toBe(false);
    expect((recordIn(f.store.getState(), 'species', SPECIES) as unknown as { notes: string }).notes).toBe('by the old writer');
    expectConsistent(f.store);
  });

  it('refuses a state that is not a canonical state, and a bad revision; nothing changes', () => {
    const f = follower();
    const broken = { meta: base.meta, records: { ...base.records, species: undefined } } as unknown as CanonicalState;
    expect(code(f.store.reload(broken, 3))).toBe('VALIDATION_FAILED');
    expect(code(f.store.reload(base, -1))).toBe('STALE_REVISION');
    expect(code(f.store.reload(base, 1.5))).toBe('STALE_REVISION');
    expect(f.store.getState()).toBe(base);
    expect(f.store.getRevision()).toBe(0);
  });

  it('no ERROR gate: a stored state with errors is adopted and its errors are findings', () => {
    const f = follower();
    const species = recordIn(base, 'species', SPECIES);
    const broken: CanonicalState = { ...base, records: { ...base.records, species: { ...base.records.species, [SPECIES]: withFields(species, { classIds: ['cls_nope'] }) as never } } };
    const result = f.store.reload(broken, 9);
    expect(result.ok).toBe(true);
    expect(f.store.findings.all().some((finding) => finding.severity === 'error')).toBe(true);
    expectConsistent(f.store);
  });
});
