/**
 * INV-28 guards (ADR-033) and the single-tab warning (Q4), integration part: no write queue on a follower, a remote
 * ChangeSet is never written, a store that is not a follower refuses to mirror, and there is one lock holder at a time.
 */
import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import type { AnyRecord } from '@/core/schema';
import { envelope, mustCommit, recordIn, withFields } from '@/test-support/command-kit';
import { stubLock } from '@/test-support/persistence-kit';
import { newIndexedDb, openTab, type TabEnv } from '@/test-support/tab-kit';
import { attachWriteQueue } from '@/persistence/write-wiring';
import { base, edit, fakeRig, seededIndexedDb, settle, SPECIES, storeOf } from '@/test-support/tab-rig';

describe('INV-28 guards', () => {
  it('no write queue is attached to a follower: attaching to a read-only store is refused as a value', async () => {
    const rig = await fakeRig();
    await openTab(rig.env);
    const b = await openTab(rig.env);
    const wiring = attachWriteQueue(storeOf(b), b.t.adapter);
    expect(wiring).toMatchObject({ ok: false, reason: 'read_only' });
    expect(b.t.mutations).toEqual([]);
  });

  it('a remote ChangeSet is never written, even if the wiring were there (second guard)', async () => {
    let readOnly = false;
    const store = createCanonicalStore({ initial: base, revision: 1, validateInitial: false, readOnly: () => readOnly });
    const written: number[] = [];
    const wiring = attachWriteQueue(store, { writeChanges: (changes) => { written.push(changes.revision); return Promise.resolve(); } });
    expect(wiring.ok).toBe(true);
    mustCommit(store.dispatch(envelope('local', { type: 'record.update', record: withFields(recordIn(store.getState(), 'species', SPECIES), { notes: 'mine' }) })));
    readOnly = true;
    mustCommit(store.applyRemote({ fromRevision: 2, revision: 3, upserts: [withFields(recordIn(store.getState(), 'species', SPECIES), { notes: 'theirs' }) as AnyRecord], deletedIds: [] }));
    mustCommit(store.reload(base, 9));
    expect(written).toEqual([2]);
  });

  it('a follower handed a writable store does not apply anything: the store refuses (NOT_FOLLOWER) and nothing is written', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const b = await openTab(rig.env);
    const misconfigured = createCanonicalStore({ initial: storeOf(b).getState(), revision: 1, validateInitial: false, readOnly: () => false });
    b.follower?.attach(misconfigured);
    mustCommit(edit(a, 'x'));
    await a.t.adapter.flush();
    await settle(rig, b, () => b.events.some((e) => e.type === 'apply_refused'));
    expect(b.events.find((e) => e.type === 'apply_refused')).toMatchObject({ code: 'NOT_FOLLOWER' });
    expect(misconfigured.getRevision()).toBe(1);
    expect(b.t.mutations).toEqual([]);
  });

  it('there is exactly one writer at any time: the lock is never held by two tabs', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const b = await openTab(rig.env);
    const c = await openTab(rig.env);
    expect([a.lock, b.lock, c.lock].filter((lock) => (lock as unknown as { holds(): boolean }).holds())).toEqual([a.lock]);
    expect(rig.locks.waiting()).toBe(2);
    await a.t.adapter.close();
    await settle(rig, b, () => b.follower?.isReadOnly() === false);
    expect([a.lock, b.lock, c.lock].filter((lock) => (lock as unknown as { holds(): boolean }).holds())).toEqual([b.lock]);
    expect(c.follower?.isReadOnly()).toBe(true);
    expect(c.t.adapter.getStatus().state).toBe('read_only');
  });
});

describe('no Web Locks (single-tab warning, Q4)', () => {
  it.each([
    ['a database with data', true],
    ['a fresh database', false],
  ])('%s: the tab runs as the writer and boot says singleTab', async (_name, seeded) => {
    const env: TabEnv = { indexedDB: seeded ? await seededIndexedDb() : newIndexedDb(), newLock: () => stubLock('unsupported'), newChannel: () => undefined };
    const tab = await openTab(env);
    expect(tab.open.mode).toBe('read_write');
    expect(tab.open.bootReport?.singleTab).toBe(true);
    expect(tab.follower).toBeUndefined();
    expect(tab.t.adapter.getStatus().state).not.toBe('read_only');
  });

  it('a granted lock is not a single-tab warning', async () => {
    const tab = await openTab({ indexedDB: await seededIndexedDb(), newLock: () => stubLock('acquired'), newChannel: () => undefined });
    expect(tab.open.bootReport?.singleTab).toBe(false);
  });
});
