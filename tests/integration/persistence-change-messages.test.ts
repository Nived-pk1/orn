/**
 * The writer's side of the change channel (step 3.4, docs/PERSISTENCE.md §10): one message per persisted
 * transaction, `{ fromRevision, revision, changedIds }`, posted only after the transaction is durable.
 */
import { describe, expect, it } from 'vitest';
import type { AnyRecord } from '@/core/schema';
import { MAX_CHANGED_IDS } from '@/persistence/change-message';
import type { ChangeChannel, ChangeMessage } from '@/persistence/contracts';
import { commit, loadFixtureState, must } from '@/test-support/state-fixture';
import { freshAdapter, quotaError, savedDatabase, seedChangeSet } from '@/test-support/persistence-kit';
import { createMemoryChannelHub } from '@/test-support/tab-fakes';

const base = loadFixtureState('maximal-valid');
const speciesIds = Object.keys(base.records.species).sort();
const first = speciesIds[0] as string;
const second = speciesIds[1] as string;
const edit = (state: typeof base, revision: number, ids: string[], notes: string) =>
  commit(state, revision, (tables) => {
    for (const id of ids) tables.species[id] = { ...(must(state.records.species[id]) as object), notes } as AnyRecord;
  });

function recordingChannel(): ChangeChannel & { readonly posted: ChangeMessage[] } {
  const posted: ChangeMessage[] = [];
  return { posted, post: (message) => void posted.push(message), subscribe: () => () => undefined, close: () => undefined };
}

describe('the writer posts one message per persisted transaction', () => {
  it('after boot, each ChangeSet on an idle queue: from the revision the database was at, to the one it ended on', async () => {
    const channel = recordingChannel();
    const t = await savedDatabase(base, { channel }, 3);
    await t.adapter.open();
    const one = edit(base, 4, [first], 'one');
    await t.adapter.writeChanges(one.changes, one.after);
    const two = edit(one.after, 5, [second], 'two');
    await t.adapter.writeChanges(two.changes, two.after);
    expect(channel.posted).toEqual([
      { fromRevision: 3, revision: 4, changedIds: [first] },
      { fromRevision: 4, revision: 5, changedIds: [second] },
    ]);
  });

  it('ChangeSets committed together are one transaction and one message naming the whole span and every touched ID once', async () => {
    const channel = recordingChannel();
    const t = await savedDatabase(base, { channel }, 3);
    await t.adapter.open();
    const one = edit(base, 4, [first], 'one');
    const two = edit(one.after, 5, [first, second], 'two');
    const three = edit(two.after, 6, [second], 'three');
    const writes = [one, two, three].map((c) => t.adapter.writeChanges(c.changes, c.after));
    const mark = t.mutations.filter((m) => m.store === 'records' && m.type === 'put').length;
    await Promise.all(writes);
    // one transaction: the three ChangeSets' records were put in one bulkPut
    expect(t.mutations.filter((m) => m.store === 'records' && m.type === 'put').length - mark).toBe(1);
    expect(channel.posted).toEqual([{ fromRevision: 3, revision: 6, changedIds: [first, second] }]);
  });

  it('nothing is posted before the transaction is durable, or when it fails; a retry that succeeds posts once, with the same span', async () => {
    const channel = recordingChannel();
    const t = await savedDatabase(base, { channel }, 1);
    await t.adapter.open();
    t.faults.fail('records', () => new Error('disk hiccup'));
    const one = edit(base, 2, [first], 'one');
    const written = t.adapter.writeChanges(one.changes, one.after);
    await t.scheduler.waitForTimer();
    expect(channel.posted).toEqual([]);
    t.faults.clear();
    t.scheduler.fire();
    await written;
    expect(channel.posted).toEqual([{ fromRevision: 1, revision: 2, changedIds: [first] }]);
    expect(t.adapter.getStatus().state).toBe('saved');
  });

  it('a write that ends failed posts nothing; the next successful transaction names the whole gap', async () => {
    const channel = recordingChannel();
    const t = await savedDatabase(base, { channel, retryDelaysMs: [] }, 1);
    await t.adapter.open();
    t.faults.fail('records', () => quotaError());
    const one = edit(base, 2, [first], 'one');
    await t.adapter.writeChanges(one.changes, one.after);
    expect(t.adapter.getStatus().state).toBe('failed');
    expect(channel.posted).toEqual([]);
    t.faults.clear();
    const two = edit(one.after, 3, [second], 'two');
    await t.adapter.writeChanges(two.changes, two.after);
    expect(channel.posted).toEqual([{ fromRevision: 1, revision: 3, changedIds: [first, second] }]);
  });

  it("more than the bound of changed records is 'all': followers reload instead of reading that many rows", async () => {
    const channel = recordingChannel();
    const t = await savedDatabase({ ...base, records: { ...base.records, species: {} } }, { channel }, 1);
    await t.adapter.open();
    const rows: Record<string, AnyRecord> = {};
    const template = must(base.records.species[first]);
    for (let i = 0; i <= MAX_CHANGED_IDS; i += 1) rows[`spc_bulk-${i}`] = { ...template, id: `spc_bulk-${i}` } as AnyRecord;
    const empty = { ...base, records: { ...base.records, species: {} } };
    const bulk = commit(empty, 2, (tables) => void Object.assign(tables.species, rows));
    await t.adapter.writeChanges(bulk.changes, bulk.after);
    expect(channel.posted).toEqual([{ fromRevision: 1, revision: 2, changedIds: 'all' }]);
  });

  it('replaceAll announces everything (a wholesale rewrite: migration, "save everything now")', async () => {
    const channel = recordingChannel();
    const t = await savedDatabase(base, { channel }, 3);
    await t.adapter.open();
    await t.adapter.replaceAll(base, 4);
    expect(channel.posted).toEqual([{ fromRevision: 3, revision: 4, changedIds: 'all' }]);
  });

  it('a channel that throws is reported and never fails the write', async () => {
    const t = await savedDatabase(base, { channel: { post: () => { throw new Error('channel closed'); }, subscribe: () => () => undefined, close: () => undefined } }, 1);
    await t.adapter.open();
    const one = edit(base, 2, [first], 'one');
    await t.adapter.writeChanges(one.changes, one.after);
    expect(t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 2, pendingRevisions: 0 });
    expect(t.events).toContainEqual({ type: 'channel_error', message: 'channel closed' });
  });

  it('without a channel nothing is posted and nothing breaks (a single tab)', async () => {
    const t = await savedDatabase(base, {}, 1);
    await t.adapter.open();
    const one = edit(base, 2, [first], 'one');
    await t.adapter.writeChanges(one.changes, one.after);
    expect(t.adapter.getStatus().state).toBe('saved');
  });

  it('a read-only tab cannot write, so it never posts', async () => {
    const hub = createMemoryChannelHub();
    const channel = hub.newChannel();
    const t = await savedDatabase(base, { channel, lock: { acquire: () => Promise.resolve('held_elsewhere'), whenAcquired: () => new Promise<void>(() => undefined), release: () => Promise.resolve() } }, 1);
    await t.adapter.open();
    const one = edit(base, 2, [first], 'one');
    expect(() => t.adapter.writeChanges(one.changes, one.after)).toThrow(/read-only/);
    expect(hub.pending()).toBe(0);
  });

  it('an unbooted adapter (tests, tools) derives the start of the span from the ChangeSets it wrote', async () => {
    const channel = recordingChannel();
    const t = freshAdapter({ channel });
    await t.adapter.writeChanges(seedChangeSet(base, 1), base);
    expect(channel.posted).toHaveLength(1);
    expect(channel.posted[0]).toMatchObject({ fromRevision: 0, revision: 1 });
  });
});
