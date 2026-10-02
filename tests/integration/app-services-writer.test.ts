/**
 * Step 5.1a, the writer path of createAppServices: the write queue attached after a writer boot (one commit reaches IndexedDB
 * AND the replica), SaveStatus mirrored into AppStatus, pendingWrites(), saveEverythingNow() for a revision gap and a value
 * otherwise, and the clean-shutdown marker (boot, shutdown, boot: no crash suspected; no shutdown: suspected; a follower writes
 * nothing). INV-20 and INV-28 touchpoints.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createBooter, demoState, editNote, renameDataset, smallState, storedMeta } from '@/test-support/app-boot-kit';
import { testEnv, worldHolding } from '@/test-support/app-env-kit';
import { freshDb, seedChangeSet } from '@/test-support/persistence-kit';
import { expectReplicaEqualsStore } from '@/test-support/replica-kit';
import type { Replica } from '@/workers/compute/replica';

const booter = createBooter();
afterEach(() => booter.disposeAll());

async function storedRevision(world: Awaited<ReturnType<typeof worldHolding>>): Promise<unknown> {
  const tdb = freshDb(undefined, world.indexedDB);
  try {
    return (await tdb.db.meta.get('revision'))?.value;
  } finally {
    tdb.db.close();
  }
}

describe('the write queue after a writer boot', () => {
  it('one commit reaches IndexedDB and the replica; SaveStatus is mirrored into AppStatus', async () => {
    const world = await worldHolding(demoState(), 2);
    const { services, t } = await booter.boot({ world });
    const saves: string[] = [];
    services.status.subscribe((status) => {
      const last = saves[saves.length - 1];
      if (status.save !== null && status.save.state !== last) saves.push(status.save.state);
    });
    editNote(services, 'persisted');
    expect(services.pendingWrites()).toBe(true);
    expect(services.status.get().save?.pendingRevisions).toBeGreaterThan(0);
    await services.persistence?.flush();
    expect(services.pendingWrites()).toBe(false);
    expect(services.status.get().save).toMatchObject({ state: 'saved', lastSavedRevision: 3, pendingRevisions: 0, failureReason: null });
    expect(saves).toContain('saving');
    expect(saves[saves.length - 1]).toBe('saved');
    expect(await storedRevision(world)).toBe(3);
    await services.replicaSync()?.settled();
    expectReplicaEqualsStore(t.replicas[0] as Replica, services.store, 'one commit');
    // a second boot reads exactly what the first one committed
    await services.dispose();
    const again = await booter.bootEnv(testEnv({ world }));
    expect(again.store.getState()).toEqual(services.store.getState());
  });

  it('a rejected commit writes nothing and moves no status', async () => {
    const { services } = await booter.boot({ world: await worldHolding(smallState(), 2) });
    const before = services.status.get();
    const rejected = services.store.dispatch({ label: 'bad', commands: [{ type: 'record.delete', ref: { kind: 'species', id: 'spc_does-not-exist' }, mode: 'restrict' }] });
    expect(rejected.ok).toBe(false);
    expect(services.pendingWrites()).toBe(false);
    expect(services.status.get()).toBe(before);
  });
});

describe('saveEverythingNow', () => {
  it('replaces everything when the queue stopped on a revision gap, and nothing otherwise', async () => {
    const world = await worldHolding(demoState(), 2);
    const { services } = await booter.boot({ world });
    const adapter = services.persistence as NonNullable<typeof services.persistence>;
    expect(await services.saveEverythingNow()).toMatchObject({ ok: false, code: 'NOT_NEEDED' });

    // A ChangeSet that does not follow the last one: refused loudly, the state is `failed` with the reason.
    const state = services.store.getState();
    expect(() => adapter.writeChanges(seedChangeSet(state, services.store.getRevision() + 3), state)).toThrow(/does not follow/);
    expect(services.status.get().save).toMatchObject({ state: 'failed', failureReason: 'revision_gap' });
    expect(services.pendingWrites()).toBe(true);
    expect(await services.shutdown()).toMatchObject({ written: false, reason: 'pending_writes' });

    editNote(services, 'made during the gap');
    expect(await services.saveEverythingNow()).toEqual({ ok: true, revision: 3 });
    expect(services.status.get().save).toMatchObject({ state: 'saved', failureReason: null, pendingRevisions: 0 });
    expect(await storedRevision(world)).toBe(3);
    expect(services.log.get().some((entry) => entry.source === 'app' && entry.event.type === 'saved_everything')).toBe(true);

    // the queue continues from there
    editNote(services, 'after the recovery');
    await adapter.flush();
    expect(await storedRevision(world)).toBe(4);
    await services.dispose();
    const again = await booter.bootEnv(testEnv({ world }));
    expect(again.store.getState()).toEqual(services.store.getState());
  });
});

describe('the clean-shutdown marker (writer only)', () => {
  it('boot, shutdown, boot again: no crash suspected', async () => {
    const world = await worldHolding(smallState(), 2);
    const first = await booter.bootEnv(testEnv({ world }));
    expect(first.status.get().notices?.crashSuspected).toBe(false);
    expect(await first.shutdown()).toMatchObject({ written: true });
    await first.dispose();
    const second = await booter.bootEnv(testEnv({ world }));
    expect(second.bootReport?.crashSuspected).toBe(false);
    expect(second.status.get().notices?.crashSuspected).toBe(false);
  });

  it('boot, no shutdown, boot again: a crash is suspected and the status says so', async () => {
    const world = await worldHolding(smallState(), 2);
    const first = await booter.bootEnv(testEnv({ world }));
    await first.dispose(); // dispose is not a clean shutdown: only shutdown() writes the marker
    const second = await booter.bootEnv(testEnv({ world }));
    expect(second.bootReport?.crashSuspected).toBe(true);
    expect(second.status.get().notices?.crashSuspected).toBe(true);
  });

  it('refuses, with the reason, while writes are pending; nothing is written', async () => {
    const world = await worldHolding(smallState(), 2);
    const { services } = await booter.boot({ world });
    const before = await storedMeta(world);
    renameDataset(services, 'unsaved');
    expect(await services.shutdown()).toMatchObject({ written: false, reason: 'pending_writes' });
    await services.persistence?.flush();
    expect(await storedMeta(world)).not.toBe(before); // the commit is saved; only the marker was refused
    expect(JSON.parse(await storedMeta(world)).find((row: { key: string }) => row.key === 'lastCleanShutdownAt').value).toBeNull();
    expect(await services.shutdown()).toMatchObject({ written: true });
  });

  it('writes the time of the injected clock', async () => {
    const { services } = await booter.boot({ world: await worldHolding(smallState(), 2) });
    const result = await services.shutdown();
    expect(result).toMatchObject({ written: true, at: expect.stringMatching(/^2026-.*Z$/) });
  });
});

describe('resume(): the session goes on after shutdown()', () => {
  const markerOf = async (world: Awaited<ReturnType<typeof worldHolding>>): Promise<unknown> =>
    JSON.parse(await storedMeta(world)).find((row: { key: string }) => row.key === 'lastCleanShutdownAt').value;

  it('pageshow path: shutdown writes the marker, resume() makes it null again, a second resume has nothing to do', async () => {
    const world = await worldHolding(smallState(), 2);
    const { services } = await booter.boot({ world });
    expect(await services.resume()).toMatchObject({ resumed: false, reason: 'not_shut_down' });
    expect(await services.shutdown()).toMatchObject({ written: true });
    expect(await markerOf(world)).not.toBeNull();
    expect(await services.resume()).toEqual({ resumed: true });
    expect(await markerOf(world)).toBeNull();
    expect(await services.resume()).toMatchObject({ resumed: false, reason: 'not_shut_down' });
  });

  it('commit path: a ChangeSet accepted after shutdown() clears the marker by itself', async () => {
    const world = await worldHolding(smallState(), 2);
    const { services } = await booter.boot({ world });
    expect(await services.shutdown()).toMatchObject({ written: true });
    editNote(services, 'the session went on');
    await services.persistence?.flush();
    await services.resume(); // runs after the automatic one (operations are serial)
    expect(await markerOf(world)).toBeNull();
    expect(services.log.get().some((entry) => entry.source === 'app' && entry.event.type === 'resume_marker_failed')).toBe(false);
  });

  it('a later boot after resume and no second shutdown suspects a crash', async () => {
    const world = await worldHolding(smallState(), 2);
    const first = await booter.bootEnv(testEnv({ world }));
    await first.shutdown();
    await first.resume();
    await first.dispose();
    const second = await booter.bootEnv(testEnv({ world }));
    expect(second.bootReport?.crashSuspected).toBe(true);
  });
});
