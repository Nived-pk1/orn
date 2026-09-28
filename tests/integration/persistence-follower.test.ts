/**
 * INV-28 (exactly one tab writes) and ADV-039, integration part (step 3.4, ADR-033): two in-process tabs over one
 * IndexedDB. The second tab opens read-only, follows the writer's changes through the change channel, and is promoted
 * when the writer closes. The main scenario also runs against the REAL `navigator.locks` and `BroadcastChannel`
 * (Node 24); every other scenario uses the in-memory fakes, whose deliveries the test controls. The guards are in
 * persistence-follower-guards.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { loadState, stubLock } from '@/test-support/persistence-kit';
import { envelope, mustCommit, recordIn, withFields } from '@/test-support/command-kit';
import { openTab } from '@/test-support/tab-kit';
import { closeRealChannels, edit, fakeRig, notesOf, realRig, settle, SPECIES, storeOf } from '@/test-support/tab-rig';

afterEach(closeRealChannels);

describe.each([
  ['in-memory fakes', fakeRig],
  ['the real navigator.locks and BroadcastChannel (Node 24)', realRig],
])('ADV-039 two tabs (integration part), %s: the second tab is read-only, follows changes, promotes on close', (_name, makeRig) => {
  it('follows the writer, cannot write, and after the writer closes is promoted and writes (INV-28)', async () => {
    const rig = await makeRig();
    const a = await openTab(rig.env);
    expect(a.open).toMatchObject({ mode: 'read_write', revision: 1 });
    expect(a.wiring()?.ok).toBe(true);
    const b = await openTab(rig.env);
    expect(b.open).toMatchObject({ mode: 'read_only', readOnlyReason: 'other_tab_is_writer', revision: 1 });
    expect(b.store()?.isReadOnly()).toBe(true);
    expect(b.wiring()).toBeUndefined();

    // the writer edits; the follower catches up and equals it
    mustCommit(edit(a, 'first'));
    await a.t.adapter.flush();
    await settle(rig, b, () => b.store()?.getRevision() === 2);
    expect(b.store()?.getState()).toEqual(a.store()?.getState());
    expect(notesOf(b)).toBe('first');

    // the follower cannot write: not through the store, not through the queue, and nothing reached IndexedDB
    expect(edit(b, 'nope')).toMatchObject({ ok: false, error: { code: 'READ_ONLY' } });
    expect(() => b.t.adapter.writeChanges(mustCommit(edit(a, 'second')).changes, storeOf(a).getState())).toThrow(/read-only/);
    await a.t.adapter.flush();
    await settle(rig, b, () => b.store()?.getRevision() === 3);
    expect(b.t.mutations).toEqual([]);

    // the writer shuts down cleanly: the follower is granted the lock, reloads, and only then becomes writable
    await a.t.adapter.setLastCleanShutdownAt('2026-09-28T12:00:00.000Z');
    await a.t.adapter.close();
    await settle(rig, b, () => b.follower?.isReadOnly() === false);
    const promoted = b.events.find((event) => event.type === 'promoted');
    expect(promoted).toMatchObject({ type: 'promoted', revision: 3 });
    expect(promoted?.type === 'promoted' ? promoted.bootReport?.crashSuspected : undefined).toBe(false);
    expect(b.store()?.isReadOnly()).toBe(false);
    expect(b.t.adapter.getStatus().state).toBe('saved');
    expect(b.wiring()?.ok).toBe(true);
    expect(b.store()?.getState()).toEqual((await loadState(b.t.adapter)).state);

    // ... and it persists like a writer, from the revision it adopted
    mustCommit(edit(b, 'after promotion'));
    await b.t.adapter.flush();
    expect(b.t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 4, pendingRevisions: 0 });
    const stored = await loadState(b.t.adapter);
    expect(stored.revision).toBe(4);
    expect(stored.state).toEqual(b.store()?.getState());
    await b.t.adapter.close();
  }, 30_000);
});

describe('following the writer (fakes)', () => {
  it('a burst of commits in one tick is one transaction, one message covering the span, one apply', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const b = await openTab(rig.env);
    for (const notes of ['one', 'two', 'three']) mustCommit(edit(a, notes));
    await a.t.adapter.flush();
    expect(rig.channels.pending()).toBe(1);
    expect(a.channel && (a.channel as unknown as { sent: unknown[] }).sent).toEqual([{ fromRevision: 1, revision: 4, changedIds: [SPECIES] }]);
    await settle(rig, b, () => b.store()?.getRevision() === 4);
    expect(b.events.filter((e) => e.type === 'applied')).toEqual([{ type: 'applied', revision: 4, changed: 1 }]);
    expect(b.store()?.getState()).toEqual(a.store()?.getState());
    expect(b.t.mutations).toEqual([]);
  });

  it('creates, deletes and meta changes are mirrored, and the follower ends equal to the writer', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const b = await openTab(rig.env);
    const store = storeOf(a);
    const concept = recordIn(store.getState(), 'concept', 'cpt_max-elimination');
    mustCommit(store.dispatch(envelope('add', { type: 'record.create', record: withFields(concept, { id: 'cpt_follow-new' }) })));
    mustCommit(store.dispatch(envelope('rename', { type: 'meta.update', meta: { ...store.getState().meta, title: 'Renamed' } })));
    await a.t.adapter.flush();
    await settle(rig, b, () => b.store()?.getRevision() === 3);
    mustCommit(store.dispatch(envelope('drop', { type: 'record.delete', ref: { kind: 'concept', id: 'cpt_follow-new' }, mode: 'restrict' })));
    await a.t.adapter.flush();
    await settle(rig, b, () => b.store()?.getRevision() === 4);
    expect(b.store()?.getState()).toEqual(store.getState());
    expect(b.store()?.getState().meta.title).toBe('Renamed');
  });

  it('a message that was never delivered is a gap: the next message makes the follower reload fully, and it still ends equal', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const b = await openTab(rig.env);
    mustCommit(edit(a, 'lost'));
    await a.t.adapter.flush();
    rig.channels.drop();
    mustCommit(edit(a, 'seen'));
    await a.t.adapter.flush();
    await settle(rig, b, () => b.store()?.getRevision() === 3);
    expect(b.events.filter((e) => e.type === 'reloaded')).toEqual([{ type: 'reloaded', reason: 'gap', revision: 3, rejectedRows: 0 }]);
    expect(b.store()?.getState()).toEqual(a.store()?.getState());
    expect(b.t.mutations).toEqual([]);
  });

  it('a duplicate or older message is ignored and reported; a database that moved on is a full reload, not a wrong apply', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const b = await openTab(rig.env);
    mustCommit(edit(a, 'one'));
    await a.t.adapter.flush();
    rig.channels.duplicateOldest();
    await settle(rig, b, () => b.store()?.getRevision() === 2);
    expect(b.events.filter((e) => e.type === 'message_ignored')).toEqual([{ type: 'message_ignored', reason: 'old' }]);

    // two transactions; the follower only hears about the first after the second is already durable
    mustCommit(edit(a, 'two'));
    await a.t.adapter.flush();
    mustCommit(edit(a, 'three'));
    await a.t.adapter.flush();
    await settle(rig, b, () => b.store()?.getRevision() === 4);
    expect(b.events.filter((e) => e.type === 'reloaded').map((e) => (e.type === 'reloaded' ? e.reason : ''))).toEqual(['database_moved']);
    expect(b.store()?.getState()).toEqual(a.store()?.getState());
  });

  it('malformed messages from another tab are ignored and reported, never acted on', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const b = await openTab(rig.env);
    const junk: unknown[] = [null, 7, 'reload', [], {}, { fromRevision: -1, revision: 2, changedIds: [] }, { fromRevision: 1, revision: 1, changedIds: [SPECIES] }, { fromRevision: 1, revision: 2, changedIds: [3] }, { fromRevision: 1, revision: 2, changedIds: Array.from({ length: 5000 }, (_, i) => `spc_${i}`) }, { fromRevision: 1.5, revision: 2, changedIds: [] }];
    for (const value of junk) rig.channels.inject(value, a.channel as never);
    await b.follower?.idle();
    expect(b.events.filter((e) => e.type === 'message_ignored')).toHaveLength(junk.length);
    expect(b.events.every((e) => e.type === 'message_ignored')).toBe(true);
    expect(b.store()?.getRevision()).toBe(1);
    expect(b.t.mutations).toEqual([]);
  });

  it('a stored row that fails L1 is reported, not applied, and triggers a full reload; the follower never quarantines or writes', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const b = await openTab(rig.env);
    mustCommit(edit(a, 'about to be damaged'));
    await a.t.adapter.flush();
    // the stored row is damaged behind the writer's back (a bug, a bad import, disk damage)
    await a.t.db.records.put({ ...(await a.t.db.records.get(SPECIES)), unexpectedField: 1 } as never);
    await settle(rig, b, () => b.events.some((e) => e.type === 'reloaded'));
    expect(b.events.find((e) => e.type === 'row_rejected')).toMatchObject({ id: SPECIES, issues: [expect.stringContaining('Unknown field')] });
    expect(b.events.find((e) => e.type === 'reloaded')).toMatchObject({ reason: 'invalid_row', revision: 2, rejectedRows: 1 });
    expect(Object.hasOwn(b.store()?.getState().records.species ?? {}, SPECIES)).toBe(false);
    expect(b.t.mutations).toEqual([]);
    expect(await b.t.db.quarantine.count()).toBe(0);
    expect(await b.t.db.records.get(SPECIES)).toBeDefined(); // the row is untouched: only the writer moves it
  });

  it('a wholesale replacement by the writer (replaceAll) makes followers reload', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const b = await openTab(rig.env);
    const store = storeOf(a);
    mustCommit(edit(a, 'x'));
    await a.t.adapter.flush();
    await a.t.adapter.replaceAll(store.getState(), store.getRevision());
    expect(a.channel && (a.channel as unknown as { sent: unknown[] }).sent.at(-1)).toEqual({ fromRevision: 2, revision: 2, changedIds: 'all' });
    await settle(rig, b, () => b.events.some((e) => e.type === 'reloaded' && e.reason === 'everything'));
    expect(b.store()?.getState()).toEqual(store.getState());
  });

  it('a backlog beyond the bound is dropped for one full reload', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const b = await openTab(rig.env);
    mustCommit(edit(a, 'x'));
    await a.t.adapter.flush();
    rig.channels.drop();
    for (let i = 0; i < 101; i += 1) rig.channels.inject({ fromRevision: 1, revision: 2, changedIds: [SPECIES] }, a.channel as never);
    await b.follower?.idle();
    expect(b.events.filter((e) => e.type === 'reloaded')).toEqual([{ type: 'reloaded', reason: 'backlog', revision: 2, rejectedRows: 0 }]);
    expect(b.store()?.getState()).toEqual(a.store()?.getState());
  });
});

describe('promotion (fakes)', () => {
  it('changes the follower never heard about are in the promoted state (promotion reloads from storage)', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const b = await openTab(rig.env);
    mustCommit(edit(a, 'one'));
    mustCommit(edit(a, 'two'));
    await a.t.adapter.flush();
    expect(b.store()?.getRevision()).toBe(1); // nothing delivered yet
    await a.t.adapter.close();
    await settle(rig, b, () => b.follower?.isReadOnly() === false);
    expect(b.store()?.getRevision()).toBe(3);
    expect(notesOf(b)).toBe('two');
    expect(b.events.some((e) => e.type === 'applied')).toBe(false);
  });

  it('the store reloads while still read-only, and only then does the tab become writable', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const b = await openTab(rig.env);
    const seen: boolean[] = [];
    b.store()?.subscribe((changes) => seen.push(changes.cause === 'remote' && b.follower?.isReadOnly() === true));
    await a.t.adapter.close();
    await settle(rig, b, () => b.follower?.isReadOnly() === false);
    expect(seen).toEqual([true]);
  });

  it('the promoted tab runs boot as the writer: a bad row is moved to quarantine and a crash of the old writer is reported', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    await a.t.db.records.put({ ...(await a.t.db.records.get(SPECIES)), unexpectedField: 1 } as never);
    const b = await openTab(rig.env);
    expect(b.store()?.getState().records.species[SPECIES]).toBeUndefined();
    expect(await b.t.db.records.get(SPECIES)).toBeDefined();
    await a.t.adapter.saveEditorSession({ id: 'ses_crash', kind: 'species', target: null, baseRevision: 1, baseRecord: null, draft: {}, past: [], future: [], updatedAt: '2026-09-28T10:00:00.000Z' });
    await a.t.adapter.close(); // never wrote a clean-shutdown time: a crash as far as storage can tell
    await settle(rig, b, () => b.follower?.isReadOnly() === false);
    const promoted = b.events.find((e) => e.type === 'promoted');
    expect(promoted?.type === 'promoted' ? promoted.bootReport : undefined).toMatchObject({ crashSuspected: true, editorSessionIds: ['ses_crash'], newlyQuarantined: 1 });
    expect(await b.t.db.records.get(SPECIES)).toBeUndefined();
    expect(await b.t.db.quarantine.count()).toBe(1);
  });

  it('a refused promotion (a newer app wrote newer data) leaves the tab read-only and says why', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const b = await openTab(rig.env);
    await a.t.db.meta.put({ key: 'schemaVersion', value: 99 });
    await a.t.adapter.close();
    await settle(rig, b, () => b.events.some((e) => e.type === 'promotion_failed'));
    expect(b.events.find((e) => e.type === 'promotion_failed')).toMatchObject({ reason: 'newer_schema' });
    expect(b.follower?.isReadOnly()).toBe(true);
    expect(b.store()?.isReadOnly()).toBe(true);
    expect(b.t.adapter.getStatus().state).toBe('read_only');
    expect(b.wiring()).toBeUndefined();
  });

  it('a lockless tab that needs a migration opens read-only without data and loads when the writer has migrated', async () => {
    const { SYNTHETIC_STEPS } = await import('@/test-support/synthetic-migration');
    const { withVersionOffset } = await import('@/test-support/version-offset');
    const runner = withVersionOffset(SYNTHETIC_STEPS);
    const rig = await fakeRig();
    const setup = await openTab({ ...rig.env, newLock: () => stubLock('acquired') });
    await setup.t.db.meta.put({ key: 'schemaVersion', value: 0 });
    await setup.t.adapter.close();

    const a = { lock: rig.env.newLock(), channel: rig.env.newChannel() };
    await a.lock.acquire(); // the writer holds the lock but has not booted yet
    const b = await openTab({ ...rig.env, newLock: () => rig.env.newLock(), newChannel: () => rig.env.newChannel() }, { runner });
    expect(b.open).toMatchObject({ mode: 'read_only', readOnlyReason: 'other_tab_is_writer', state: null });
    expect(b.store()).toBeUndefined();
    const writer = await openTab({ ...rig.env, newLock: () => a.lock, newChannel: () => a.channel }, { runner });
    expect(writer.open).toMatchObject({ mode: 'read_write', revision: 2, storedSchemaVersion: 0 });
    await settle(rig, b, () => b.store() !== undefined);
    expect(b.events.find((e) => e.type === 'loaded')).toMatchObject({ reason: 'everything', revision: 2 });
    expect(b.store()?.getState()).toEqual(writer.store()?.getState());
    expect(b.store()?.isReadOnly()).toBe(true);
    expect(b.t.mutations).toEqual([]);
  });
});
