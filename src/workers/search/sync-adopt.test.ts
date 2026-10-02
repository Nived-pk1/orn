/**
 * `SearchSync.adopt(revision)` and `refresh(ids)` (step 5.1b): the warm-boot cache loads a serialised index into the worker and the
 * sync adopts it instead of loading again, only while the store is still at that revision; afterwards edits, removals and refreshes
 * reach the index although the sync cannot know what the cache held; `refresh` rebuilds the documents of species whose derived
 * formula changed and is ignored while a full load is pending.
 */
import { describe, expect, it } from 'vitest';
import { makeStore, testContext } from '@/test-support/command-kit';
import { resolveSearchIntent } from '@/test-support/search-edits';
import { searchRig } from '@/test-support/search-rig';
import { documentsOf, firstDifference, freshEngine, queriesOf } from '@/test-support/search-rig';
import { fullDocuments, searchStateOf } from '@/test-support/search-state';
import { mustCommit, envelope, recordIn, withFields } from '@/test-support/command-kit';
import type { RecordRef } from '@/core/schema';

const BASE = searchStateOf({ species: 12, classes: 3, reagents: 3, reactions: 8, relationshipsPerReaction: 0.5, topics: 3, shape: 'dense', seed: 5 });
/** BASE plus one species nothing refers to (so the test can delete it). */
const STATE = ((): typeof BASE => {
  const seed = makeStore(BASE);
  const created = resolveSearchIntent(seed.getState(), { op: 'create_species', a: 1, b: 1, c: 1 }, testContext(23));
  if (created === undefined || created === 'undo' || created === 'redo' || created === 'replace') throw new Error('no species was made');
  mustCommit(seed.dispatch(created));
  return seed.getState();
})();

async function warmRig() {
  const first = searchRig(makeStore(STATE));
  await first.boot();
  const cached = first.engine().serialize();
  const store = makeStore(STATE);
  const formulas = new Map<string, string>();
  const rig = searchRig(store, { derivedFormulaOf: (ref: RecordRef) => (ref.kind === 'species' ? formulas.get(ref.id) : undefined) });
  const loaded = await rig.service.loadSerialized(cached);
  return { rig, store, cached, loaded, formulas };
}
const firstSpecies = (rig: { store: { getState(): typeof STATE } }): string => Object.keys(rig.store.getState().records.species).sort()[0] as string;

describe('adopt', () => {
  it('after a serialised load at the store\'s revision: adopted, no document built, no full load, the status is idle and at that revision', async () => {
    const { rig, store, loaded } = await warmRig();
    expect(loaded).toMatchObject({ ok: true, value: { ok: true } });
    expect(rig.sync.adopt(store.getRevision())).toBe(true);
    expect(rig.sync.status()).toMatchObject({ state: 'idle', indexRevision: store.getRevision(), loadPending: false, reason: '' });
    await rig.sync.flush();
    expect(rig.sync.stats()).toMatchObject({ loads: 0, adopts: 1, updates: 0 });
    expect(documentsOf(rig.engine())).toEqual(fullDocuments(store.getState(), store.getRevision()));
  });

  it('refuses a revision the store has moved past (and a disposed sync): nothing changes, a full load is still pending', async () => {
    const { rig, store } = await warmRig();
    const id = firstSpecies(rig);
    mustCommit(store.dispatch(envelope('Note', { type: 'record.update', record: withFields(recordIn(store.getState(), 'species', id), { notes: 'moved on' }) })));
    expect(rig.sync.adopt(store.getRevision() - 1)).toBe(false);
    expect(rig.sync.status()).toMatchObject({ loadPending: true, indexRevision: null });
    expect(rig.sync.stats().adopts).toBe(0);
    rig.sync.dispose();
    expect(rig.sync.adopt(store.getRevision())).toBe(false);
  });

  it('afterwards an edit, a deletion and a refresh all reach the index, which equals a fresh build', async () => {
    const { rig, store, formulas } = await warmRig();
    rig.sync.adopt(store.getRevision());
    const ids = Object.keys(store.getState().records.species).sort();
    const free = ids.filter((id) => store.getIndexes().referrersOf(id).length === 0);
    expect(free.length).toBeGreaterThan(0);
    const deleted = free[0] as string;
    const [edited, refreshed] = ids.filter((id) => id !== deleted).slice(0, 2) as [string, string];
    mustCommit(store.dispatch(envelope('Edit', { type: 'record.update', record: withFields(recordIn(store.getState(), 'species', edited), { notes: 'adopted edit zzyzx' }) })));
    mustCommit(store.dispatch(envelope('Delete', { type: 'record.delete', ref: { kind: 'species', id: deleted }, mode: 'apply_cascade' })));
    formulas.set(refreshed, 'C9H9');
    rig.sync.refresh([refreshed, 'spc_that-does-not-exist']);
    await rig.sync.flush();
    expect(rig.sync.stats().loads).toBe(0);
    const state = store.getState();
    const held = documentsOf(rig.engine());
    expect(held.some((d) => d.id === deleted)).toBe(false);
    expect(held.find((d) => d.id === refreshed)?.derivedFormula).toBe('C9H9');
    expect(held).toEqual(fullDocuments(state, store.getRevision(), (ref) => (ref.kind === 'species' ? formulas.get(ref.id) : undefined)));
    expect(firstDifference(rig.engine(), freshEngine(state, store.getRevision(), (ref) => formulas.get(ref.id)), queriesOf(held, Object.keys(state.records.exam_version)))).toBeUndefined();
    expect(rig.engine().revision).toBe(store.getRevision());
  });
});

describe('refresh', () => {
  it('is ignored while a full load is pending (the load reads the formulas itself) and for ids that are not species', async () => {
    const formulas = new Map<string, string>();
    const store = makeStore(STATE);
    const rig = searchRig(store, { derivedFormulaOf: (ref) => (ref.kind === 'species' ? formulas.get(ref.id) : undefined) });
    const id = firstSpecies(rig);
    formulas.set(id, 'C1H4');
    rig.sync.refresh([id]);
    expect(rig.sync.status()).toMatchObject({ queued: 0, loadPending: true });
    await rig.boot();
    expect(documentsOf(rig.engine()).find((d) => d.id === id)?.derivedFormula).toBe('C1H4');
    const clsId = Object.keys(store.getState().records.class)[0] as string;
    rig.sync.refresh([clsId]);
    expect(rig.sync.status().queued).toBe(0);
  });

  it('a formula that did not change is built and not sent', async () => {
    const formulas = new Map<string, string>();
    const rig = searchRig(makeStore(STATE), { derivedFormulaOf: (ref) => (ref.kind === 'species' ? formulas.get(ref.id) : undefined) });
    const id = firstSpecies(rig);
    formulas.set(id, 'C1H4');
    await rig.boot();
    const before = rig.sync.stats();
    rig.sync.refresh([id]);
    await rig.sync.flush();
    expect(rig.sync.stats()).toMatchObject({ upserts: before.upserts, unchanged: before.unchanged + 1 });
  });
});
