/**
 * The search sync on a follower (step 6.1b part 2, openItem 23): the ChangeSet of `applyRemote` (one mirrored writer transaction) is analysed like a
 * commit (the changed records and their fan-out; unchanged documents are not sent), so a rename on the writer costs a one-document update here;
 * the ChangeSet of `reload` (a whole state adopted from storage) stays ONE full load. The index equals a fresh build after either.
 */
import { describe, expect, it } from 'vitest';
import { envelope, makeStore, mustCommit, recordIn, testContext, withFields } from '@/test-support/command-kit';
import { resolveSearchIntent } from '@/test-support/search-edits';
import { documentsOf, searchRig } from '@/test-support/search-rig';
import { fullDocuments, searchStateOf } from '@/test-support/search-state';
import type { StoreHandle } from '@/core/commands';

const BASE = searchStateOf({ species: 12, classes: 3, reagents: 3, reactions: 8, relationshipsPerReaction: 0.5, topics: 3, shape: 'dense', seed: 5 });
/** BASE plus one species nothing refers to (so a test can delete it), and its id. */
const { STATE, LONER } = ((): { STATE: typeof BASE; LONER: string } => {
  const seed = makeStore(BASE);
  const created = resolveSearchIntent(seed.getState(), { op: 'create_species', a: 1, b: 1, c: 1 }, testContext(23));
  if (created === undefined || created === 'undo' || created === 'redo' || created === 'replace') throw new Error('no species was made');
  mustCommit(seed.dispatch(created));
  const before = new Set(Object.keys(BASE.records.species));
  return { STATE: seed.getState(), LONER: Object.keys(seed.getState().records.species).find((id) => !before.has(id)) as string };
})();

const firstSpecies = (store: StoreHandle): string => Object.keys(store.getState().records.species).sort()[0] as string;

function rename(writer: StoreHandle, canonical: string): string {
  const id = firstSpecies(writer);
  const record = recordIn(writer.getState(), 'species', id);
  mustCommit(writer.dispatch(envelope('Rename', { type: 'record.update', record: withFields(record, { names: { canonical, common: [], aliases: [] } }) })));
  return id;
}

async function pair() {
  const writer = makeStore(STATE);
  const follower = makeStore(STATE, { readOnly: () => true });
  const rig = searchRig(follower);
  await rig.boot();
  expect(rig.sync.stats()).toMatchObject({ loads: 1, updates: 0 });
  return { writer, follower, rig };
}

describe('the follower\'s search sync', () => {
  it('applyRemote: a rename on the writer is ONE incremental update here (one document), no full load, and the index equals a fresh build', async () => {
    const { writer, follower, rig } = await pair();
    const id = rename(writer, 'Renamed by the writer');
    const result = follower.applyRemote({ fromRevision: follower.getRevision(), revision: writer.getRevision(), upserts: [recordIn(writer.getState(), 'species', id)], deletedIds: [] });
    expect(result.ok).toBe(true);
    expect(rig.sync.status().queued).toBe(1);
    await rig.sync.flush();
    expect(rig.sync.stats()).toMatchObject({ loads: 1, updates: 1, upserts: 1, mismatches: 0 });
    expect(rig.sync.status()).toMatchObject({ state: 'idle', indexRevision: follower.getRevision(), loadPending: false });
    expect(documentsOf(rig.engine())).toEqual(fullDocuments(follower.getState(), follower.getRevision()));
  });

  it('applyRemote over several revisions (the writer coalesced) is still one update', async () => {
    const { writer, follower, rig } = await pair();
    rename(writer, 'First');
    const id = rename(writer, 'Second');
    expect(writer.getRevision() - follower.getRevision()).toBe(2);
    expect(follower.applyRemote({ fromRevision: follower.getRevision(), revision: writer.getRevision(), upserts: [recordIn(writer.getState(), 'species', id)], deletedIds: [] }).ok).toBe(true);
    await rig.sync.flush();
    expect(rig.sync.stats()).toMatchObject({ loads: 1, updates: 1, upserts: 1 });
    expect(rig.sync.status().indexRevision).toBe(writer.getRevision());
    expect(documentsOf(rig.engine())).toEqual(fullDocuments(follower.getState(), follower.getRevision()));
  });

  it('a record deleted on the writer is removed from the index by applyRemote', async () => {
    const { writer, follower, rig } = await pair();
    const result = writer.dispatch(envelope('Delete', { type: 'record.delete', ref: { kind: 'species', id: LONER }, mode: 'restrict' }));
    if (!result.ok) throw new Error(`the delete was refused: ${result.error.code} ${result.error.message}`);
    const changed = [...result.changes.updated, ...result.changes.created];
    const upserts = changed.map((ref) => (writer.getState().records as unknown as Record<string, Record<string, never>>)[ref.kind]?.[ref.id] as never);
    expect(follower.applyRemote({ fromRevision: follower.getRevision(), revision: writer.getRevision(), upserts, deletedIds: result.changes.deleted.map((ref) => ref.id) }).ok).toBe(true);
    await rig.sync.flush();
    expect(rig.sync.stats()).toMatchObject({ loads: 1, updates: 1, removals: 1 });
    expect(documentsOf(rig.engine())).toEqual(fullDocuments(follower.getState(), follower.getRevision()));
    expect(documentsOf(rig.engine()).some((doc) => doc.id === LONER)).toBe(false);
  });

  it('reload: a whole state adopted from storage is ONE full load', async () => {
    const { writer, follower, rig } = await pair();
    rename(writer, 'Renamed, then reloaded');
    expect(follower.reload(writer.getState(), writer.getRevision()).ok).toBe(true);
    expect(rig.sync.status().loadPending).toBe(true);
    await rig.sync.flush();
    expect(rig.sync.stats()).toMatchObject({ loads: 2, updates: 0 });
    expect(documentsOf(rig.engine())).toEqual(fullDocuments(follower.getState(), follower.getRevision()));
  });
});
