/**
 * Step 5.1a, the follower path of createAppServices (docs/PERSISTENCE.md §10, INV-28, E11): a second tab boots read-only, follows
 * the writer's commits (the channel hub delivers by hand), is promoted when the writer goes away (read-only until the reload is
 * done, then a write queue), and a refused promotion stays read-only with its reason without asking for the lock again. The
 * follower controller's events become AppStatus fields and event-log entries.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachWriteQueue } from '@/persistence';
import { createBooter, demoState, editNote, renameDataset, smallState, storedMeta, tamper } from '@/test-support/app-boot-kit';
import { newWorld, testEnv, worldHolding } from '@/test-support/app-env-kit';
import { envelope } from '@/test-support/command-kit';
import { expectReplicaEqualsStore } from '@/test-support/replica-kit';
import type { Replica } from '@/workers/compute/replica';

const booter = createBooter();
afterEach(() => booter.disposeAll());

/** Two tabs of one browser over one database: A is the writer, B follows. */
async function twoTabs(state = demoState(), revision = 2) {
  const world = await worldHolding(state, revision);
  const a = await booter.bootEnv(testEnv({ world }));
  const tb = testEnv({ world });
  const b = await booter.bootEnv(tb);
  return { world, a, b, tb };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe('a tab that is not the writer follows it', () => {
  it('boots read-only: mode follower, the promotion waiting, a store that refuses commands, a replica in sync', async () => {
    const { a, b, tb } = await twoTabs();
    expect(a.status.get().mode).toBe('writer');
    expect(b.status.get()).toMatchObject({ mode: 'follower', reason: 'other_tab_is_writer', promotion: 'waiting', save: { state: 'read_only' }, replica: { state: 'in_sync' }, stage: 'ready' });
    expect(b.store.isReadOnly()).toBe(true);
    expect(b.store.getRevision()).toBe(2);
    expect(b.store.dispatch(envelope('Rename', { type: 'meta.update', meta: { ...b.store.getState().meta, title: 'x' } }))).toMatchObject({ ok: false, error: { code: 'READ_ONLY' } });
    expect(tb.calls.filter((call) => call.endsWith(':loadReplica'))).toHaveLength(1);
  });

  it("INV-28: a follower never has a write queue: attaching one is refused as a value, nothing is written, the marker is not written", async () => {
    const { world, b } = await twoTabs();
    expect(attachWriteQueue(b.store, b.persistence as NonNullable<typeof b.persistence>)).toMatchObject({ ok: false, reason: 'read_only' });
    const before = await storedMeta(world);
    expect(await b.shutdown()).toMatchObject({ written: false, reason: 'not_writer' });
    expect(await b.resume()).toMatchObject({ resumed: false, reason: 'not_writer' });
    expect(await b.saveEverythingNow()).toMatchObject({ ok: false, code: 'NOT_WRITER' });
    expect(b.pendingWrites()).toBe(false);
    expect(await storedMeta(world)).toBe(before);
  });

  it("follows the writer's commit: the store, the replica and the derived indexes equal the writer's", async () => {
    const { world, a, b, tb } = await twoTabs();
    editNote(a, 'seen by the follower');
    await a.persistence?.flush();
    expect(world.channels.deliver()).toBeGreaterThan(0);
    await vi.waitFor(() => expect(b.store.getRevision()).toBe(3));
    expect(b.store.getState()).toEqual(a.store.getState());
    expect(b.log.get().some((entry) => entry.source === 'follower' && entry.event.type === 'applied')).toBe(true);
    await b.replicaSync()?.settled();
    expectReplicaEqualsStore(tb.replicas[0] as Replica, b.store, 'follower replica');
    expect(b.indexes.current().revision).toBe(3);
    expect(b.store.isReadOnly()).toBe(true);
  });

  it('nothing stored yet: the follower holds an empty dataset until the writer saves, then reloads', async () => {
    const world = newWorld();
    const a = await booter.bootEnv(testEnv({ world }));
    const b = await booter.bootEnv(testEnv({ world }));
    expect(b.status.get().mode).toBe('follower');
    expect(b.store.getRevision()).toBe(0);
    renameDataset(a, 'First save');
    await a.persistence?.flush();
    world.channels.deliver();
    await vi.waitFor(() => expect(b.store.getRevision()).toBe(1));
    expect(b.store.getState().meta.title).toBe('First save');
    expect(b.status.get().followerReloads).toBe(1);
  });

  it('a row that fails L1 becomes a status field and a log entry; a reload that cannot be done is a status too', async () => {
    const { world, a, b } = await twoTabs(smallState(), 2);
    const speciesId = Object.keys(a.store.getState().records.species).sort()[0] as string;
    editNote(a, 'valid at first');
    await a.persistence?.flush();
    // damaged behind everyone's back before the follower reads it
    await tamper(world, (db) => db.records.put({ id: speciesId, kind: 'species', damaged: true } as never));
    world.channels.deliver();
    await vi.waitFor(() => expect(b.status.get().rejectedRows).toBeGreaterThan(0));
    expect(b.log.get().some((entry) => entry.source === 'follower' && entry.event.type === 'row_rejected')).toBe(true);
    expect(b.store.getRevision()).toBe(3);

    // the database cannot be read as a dataset any more: the reload fails and says so
    await tamper(world, (db) => db.meta.delete('datasetMeta'));
    world.channels.inject({ fromRevision: 0, revision: 9, changedIds: 'all' });
    await vi.waitFor(() => expect(b.status.get().reloadFailure).not.toBeNull());
    expect(b.status.get().reloadFailure?.reason).toEqual(expect.any(String));
    expect(b.log.get().some((entry) => entry.source === 'follower' && entry.event.type === 'reload_failed')).toBe(true);
    expect(b.store.isReadOnly()).toBe(true);
  });
});

describe('promotion', () => {
  it('stays read-only until the reload is done, then is the writer with a write queue', async () => {
    const { world, a, b } = await twoTabs();
    editNote(a, 'by the old writer');
    await a.persistence?.flush();
    await a.dispose(); // the lock is released: the follower is granted it
    await vi.waitFor(() => expect(b.status.get().mode).toBe('writer'));
    expect(b.status.get()).toMatchObject({ promotion: 'promoted', reason: null, detail: null, validation: { where: 'worker' } });
    expect(b.store.isReadOnly()).toBe(false);
    expect(b.store.getRevision()).toBe(3);
    expect(world.locks.held()).toEqual(['orn-writer']);
    editNote(b, 'by the new writer');
    await b.persistence?.flush();
    expect(b.status.get().save).toMatchObject({ state: 'saved', lastSavedRevision: 4 });
    expect(await b.shutdown()).toMatchObject({ written: true });
    // INV-28 still holds for the dead tab: its store was never wired after dispose
    const again = await booter.bootEnv(testEnv({ world }));
    expect(again.store.getRevision()).toBe(4);
    expect(again.bootReport?.crashSuspected).toBe(false);
  });

  it('two empty tabs: the writer closes, the follower becomes an empty writer and its first edit reaches IndexedDB', async () => {
    const world = newWorld();
    const a = await booter.bootEnv(testEnv({ world }));
    const b = await booter.bootEnv(testEnv({ world }));
    expect(b.status.get()).toMatchObject({ mode: 'follower', promotion: 'waiting' });
    await a.dispose();
    await vi.waitFor(() => expect(b.status.get().promotion).toBe('promoted'));
    expect(b.status.get()).toMatchObject({ mode: 'writer', reason: null, detail: null, save: { state: 'saved' } });
    expect(b.store.isReadOnly()).toBe(false);
    expect(world.locks.held()).toEqual(['orn-writer']);
    renameDataset(b, 'Written after promotion');
    await b.persistence?.flush();
    expect(b.status.get().save).toMatchObject({ state: 'saved', lastSavedRevision: 1 });
    const c = await booter.bootEnv(testEnv({ world }));
    expect(c.store.getState().meta.title).toBe('Written after promotion');
  });

  it('a store that holds records while the database holds nothing is still refused (state_missing)', async () => {
    const { world, a, b } = await twoTabs();
    await tamper(world, async (db) => {
      await db.records.clear();
      await db.meta.clear();
    });
    await a.dispose();
    await vi.waitFor(() => expect(b.status.get().promotion).toBe('refused'));
    expect(b.status.get()).toMatchObject({ mode: 'read_only', reason: 'state_missing', save: { state: 'read_only' } });
    expect(b.store.isReadOnly()).toBe(true);
    expect(b.log.get().some((entry) => entry.source === 'follower' && entry.event.type === 'promotion_failed')).toBe(true);
  });

  it('a refused promotion stays read-only with its reason and does not ask for the lock again (E11)', async () => {
    const { world, a, b } = await twoTabs();
    await tamper(world, (db) => db.meta.put({ key: 'schemaVersion', value: 99 }));
    await a.dispose();
    await vi.waitFor(() => expect(b.status.get().promotion).toBe('refused'));
    const status = b.status.get();
    expect(status).toMatchObject({ mode: 'read_only', reason: 'newer_schema', promotion: 'refused' });
    expect(status.detail?.length).toBeGreaterThan(5);
    expect(b.store.isReadOnly()).toBe(true);
    expect(b.log.get().some((entry) => entry.source === 'follower' && entry.event.type === 'promotion_failed')).toBe(true);
    const requests = world.locks.requests();
    await settle();
    expect(world.locks.requests()).toBe(requests);
    expect(world.locks.held()).toEqual([]);
    expect(world.locks.waiting()).toBe(0);
    expect(await b.shutdown()).toMatchObject({ written: false, reason: 'not_writer' });
  });
});
