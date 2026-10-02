/**
 * The follower controller's decisions with a fake adapter, store, lock and channel (no IndexedDB): what makes it
 * reload, what it refuses to do, how promotion fails, and what closing does. The end-to-end scenarios over fake
 * IndexedDB are in tests/integration/persistence-follower*.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CommitResult } from '@/core/commands/contracts';
import { RECORD_KINDS, type CanonicalState } from '@/core/schema';
import { createMemoryChannelHub } from '@/test-support/tab-fakes';
import { loadFixtureState } from '@/test-support/state-fixture';
import type { OpenResult, WriterLock } from './contracts';
import { createFollower, type FollowerAdapter, type FollowerEvent, type FollowerStore } from './follower';
import type { ChangedRows, FollowerLoad } from './follower-read';

const state = loadFixtureState('minimal-valid');
const okCommit = { ok: true, changes: {}, findings: [] } as unknown as CommitResult;
const failCommit = (code: string): CommitResult => ({ ok: false, error: { code, message: `${code} happened` } }) as CommitResult;

function rig(overrides: { adapter?: Partial<FollowerAdapter>; store?: Partial<FollowerStore> | null; revision?: number | null } = {}) {
  const hub = createMemoryChannelHub();
  const writerChannel = hub.newChannel();
  const channel = hub.newChannel();
  let grant: () => void = () => undefined;
  const whenAcquired = new Promise<void>((resolve) => (grant = resolve));
  const lock: WriterLock = { acquire: () => Promise.resolve('held_elsewhere'), whenAcquired: () => whenAcquired, release: vi.fn(() => Promise.resolve()) };
  const validMeta = state.meta;
  /** The revision the fake database is at: what the writer's last message said it ended on. */
  let dbRevision = 2;
  const adapter: FollowerAdapter = {
    readChanged: vi.fn((ids: readonly string[]): Promise<ChangedRows> => Promise.resolve({ rows: ids.map(() => undefined), revision: dbRevision, schemaVersion: 1, datasetMeta: validMeta })),
    loadForFollower: vi.fn((): Promise<FollowerLoad> => Promise.resolve({ ok: true, state, revision: 2, rejected: [] })),
    promote: vi.fn((): Promise<OpenResult> => Promise.resolve({ mode: 'read_write', state, revision: 5, storedSchemaVersion: 1, quarantinedCount: 0 })),
    setReadOnly: vi.fn(),
    ...overrides.adapter,
  };
  const store: FollowerStore | undefined =
    overrides.store === null
      ? undefined
      : { getState: () => state, getRevision: () => 1, applyRemote: vi.fn(() => okCommit), reload: vi.fn(() => okCommit), ...overrides.store };
  const events: FollowerEvent[] = [];
  const follower = createFollower({
    adapter,
    channel,
    lock,
    ...(store !== undefined ? { store } : {}),
    revision: overrides.revision === undefined ? 1 : overrides.revision,
    schemaVersion: 1,
    onEvent: (event) => events.push(event),
  });
  const send = async (message: unknown): Promise<void> => {
    const revision = (message as { revision?: unknown }).revision;
    if (typeof revision === 'number') dbRevision = revision;
    hub.inject(message, writerChannel);
    await follower.idle();
  };
  return { follower, adapter, store, lock, events, send, grant, types: () => events.map((e) => e.type) };
}
const message = (fromRevision: number, revision: number, changedIds: readonly string[] | 'all' = ['spc_x']) => ({ fromRevision, revision, changedIds });

describe('a full reload that cannot happen keeps what the follower has and says why', () => {
  it.each(['empty', 'newer_schema', 'needs_migration', 'integrity_failure'] as const)('the read says %s', async (reason) => {
    const r = rig({ adapter: { loadForFollower: () => Promise.resolve({ ok: false, reason, detail: `detail of ${reason}` }) } });
    await r.send(message(0, 2)); // a gap: reload
    expect(r.events).toEqual([{ type: 'reload_failed', reason, detail: `detail of ${reason}` }]);
    expect(r.store?.reload).not.toHaveBeenCalled();
  });

  it('the store refuses the reload', async () => {
    const r = rig({ store: { reload: () => failCommit('VALIDATION_FAILED') } });
    await r.send(message(0, 2));
    expect(r.events).toEqual([{ type: 'reload_failed', reason: 'VALIDATION_FAILED', detail: 'VALIDATION_FAILED happened' }]);
  });

  it('rows that failed L1 are reported (bounded) with the reload', async () => {
    const rejected = Array.from({ length: 30 }, (_, i) => ({ id: `spc_bad-${i}`, issues: ['bad'] }));
    const r = rig({ adapter: { loadForFollower: () => Promise.resolve({ ok: true, state, revision: 2, rejected }) } });
    await r.send(message(0, 2));
    expect(r.events.filter((e) => e.type === 'row_rejected')).toHaveLength(20);
    expect(r.events.at(-1)).toEqual({ type: 'reloaded', reason: 'gap', revision: 2, rejectedRows: 30 });
  });
});

describe('what the follower decides for a message', () => {
  it("an 'all' message older than the follower's revision is ignored", async () => {
    const r = rig({ revision: 7 });
    await r.send(message(3, 5, 'all'));
    expect(r.events).toEqual([{ type: 'message_ignored', reason: 'old' }]);
    expect(r.adapter.loadForFollower).not.toHaveBeenCalled();
  });

  it('with no state yet, any newer message loads one (no store attached: a loaded event for the app)', async () => {
    const r = rig({ store: null, revision: null });
    await r.send(message(1, 2));
    expect(r.events).toEqual([{ type: 'loaded', reason: 'no_state', state, revision: 2, rejectedRows: 0 }]);
    r.follower.attach({ getState: () => state, getRevision: () => 2, applyRemote: () => okCommit, reload: () => okCommit });
    await r.send(message(2, 3));
    expect(r.types()).toEqual(['loaded', 'applied']);
  });

  it('a stored dataset meta that is not valid is a full reload, not an apply', async () => {
    const r = rig({ adapter: { readChanged: () => Promise.resolve({ rows: [undefined], revision: 2, schemaVersion: 1, datasetMeta: { title: 5 } }) } });
    await r.send(message(1, 2));
    expect(r.events).toEqual([{ type: 'reloaded', reason: 'invalid_meta', revision: 2, rejectedRows: 0 }]);
    expect(r.store?.applyRemote).not.toHaveBeenCalled();
  });

  it('a row that fails L1 with more than 20 issues reports all of them capped, with the true total named (step 3.4 review)', async () => {
    const badRow = { kind: 'species', id: 'spc_bad', classIds: Array.from({ length: 25 }, (_, i) => i) };
    const r = rig({ adapter: { readChanged: () => Promise.resolve({ rows: [badRow], revision: 2, schemaVersion: 1, datasetMeta: state.meta }) } });
    await r.send(message(1, 2, ['spc_bad']));
    const rejected = r.events.find((e) => e.type === 'row_rejected');
    if (rejected?.type !== 'row_rejected') throw new Error('expected a row_rejected event');
    expect(rejected.issues.length).toBe(21); // 20 shown + one trailer naming the rest
    expect(rejected.issues.at(-1)).toMatch(/^… and \d+ more issue\(s\)$/);
    expect(r.events.at(-1)).toEqual({ type: 'reloaded', reason: 'invalid_row', revision: 2, rejectedRows: 0 });
  });

  it('a row of another schema version is never applied incrementally', async () => {
    const r = rig({ adapter: { readChanged: () => Promise.resolve({ rows: [undefined], revision: 2, schemaVersion: 2, datasetMeta: state.meta }) } });
    await r.send(message(1, 2));
    expect(r.events).toEqual([{ type: 'reloaded', reason: 'database_moved', revision: 2, rejectedRows: 0 }]);
  });

  it('a store that says STALE_REVISION or INTERNAL makes the follower reload; any other refusal is reported', async () => {
    for (const [code, reason] of [['STALE_REVISION', 'stale'], ['INTERNAL', 'store_failed']] as const) {
      const r = rig({ store: { applyRemote: () => failCommit(code) } });
      await r.send(message(1, 2));
      expect(r.events).toEqual([{ type: 'reloaded', reason, revision: 2, rejectedRows: 0 }]);
    }
    const refused = rig({ store: { applyRemote: () => failCommit('NOT_FOLLOWER') } });
    await refused.send(message(1, 2));
    expect(refused.events).toEqual([{ type: 'apply_refused', code: 'NOT_FOLLOWER', message: 'NOT_FOLLOWER happened' }]);
  });

  it('a read that throws is an error event, and the follower keeps working', async () => {
    let fail = true;
    const r = rig({ adapter: { readChanged: () => (fail ? Promise.reject(new Error('read failed')) : Promise.resolve({ rows: [undefined], revision: 2, schemaVersion: 1, datasetMeta: state.meta })) } });
    await r.send(message(1, 2));
    expect(r.events).toEqual([{ type: 'error', message: expect.stringContaining('read failed') }]);
    fail = false;
    await r.send(message(1, 2));
    expect(r.types()).toEqual(['error', 'applied']);
  });

  it('a listener that throws does not stop the follower; unsubscribed listeners hear nothing', async () => {
    const r = rig();
    const heard: string[] = [];
    r.follower.subscribe(() => {
      throw new Error('listener failure');
    });
    const off = r.follower.subscribe((event) => heard.push(event.type));
    await r.send(message(1, 2));
    off();
    await r.send(message(2, 3));
    expect(heard).toEqual(['applied']);
    expect(r.types()).toEqual(['applied', 'applied']);
  });
});

describe('promotion', () => {
  it('a store handed a state of nothing: the promotion fails, the queue is read-only again and the lock is given up', async () => {
    const r = rig({ adapter: { promote: () => Promise.resolve({ mode: 'read_write', state: null, revision: 0, storedSchemaVersion: null, quarantinedCount: 0 }) } });
    r.grant();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await r.follower.idle();
    expect(r.events).toEqual([{ type: 'promotion_failed', reason: 'state_missing', detail: expect.any(String) }]);
    expect(r.adapter.setReadOnly).toHaveBeenCalledWith(true);
    expect(r.lock.release).toHaveBeenCalled();
    expect(r.follower.isReadOnly()).toBe(true);
  });

  it('an empty store and an empty database: the tab becomes an empty writer, the store is not reloaded', async () => {
    const empty = { meta: state.meta, records: Object.fromEntries(RECORD_KINDS.map((kind) => [kind, {}])) } as unknown as CanonicalState;
    const r = rig({
      store: { getState: () => empty },
      adapter: { promote: () => Promise.resolve({ mode: 'read_write', state: null, revision: 0, storedSchemaVersion: null, quarantinedCount: 0 }) },
    });
    r.grant();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await r.follower.idle();
    expect(r.events).toEqual([{ type: 'promoted', state: null, revision: 0, bootReport: undefined }]);
    expect(r.store?.reload).not.toHaveBeenCalled();
    expect(r.adapter.setReadOnly).not.toHaveBeenCalled();
    expect(r.lock.release).not.toHaveBeenCalled();
    expect(r.follower.isReadOnly()).toBe(false);
  });

  it('a store that refuses the promoted state: same, and the tab stays read-only', async () => {
    const r = rig({ store: { reload: () => failCommit('VALIDATION_FAILED') } });
    r.grant();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await r.follower.idle();
    expect(r.events).toEqual([{ type: 'promotion_failed', reason: 'VALIDATION_FAILED', detail: 'VALIDATION_FAILED happened' }]);
    expect(r.follower.isReadOnly()).toBe(true);
  });

  it('no store yet and nothing stored: the promoted tab is writable and the event says there is no state', async () => {
    const r = rig({ store: null, revision: null, adapter: { promote: () => Promise.resolve({ mode: 'read_write', state: null, revision: 0, storedSchemaVersion: null, quarantinedCount: 0 }) } });
    r.grant();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await r.follower.idle();
    expect(r.events).toEqual([{ type: 'promoted', state: null, revision: 0, bootReport: undefined }]);
    expect(r.follower.isReadOnly()).toBe(false);
  });

  it('messages that arrive while promoting or after are ignored: a writer does not follow', async () => {
    const r = rig();
    r.grant();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await r.follower.idle();
    expect(r.types()).toEqual(['promoted']);
    await r.send(message(5, 6));
    expect(r.types()).toEqual(['promoted']);
    expect(r.adapter.readChanged).not.toHaveBeenCalled();
  });

  it('a refused boot (newer schema) reports why and keeps the follower following, read-only', async () => {
    const refused: OpenResult = { mode: 'read_only', readOnlyReason: 'newer_schema', detail: 'saved by a newer version', state: null, revision: 0, storedSchemaVersion: 9, quarantinedCount: 0 };
    const r = rig({ adapter: { promote: () => Promise.resolve(refused) } });
    r.grant();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await r.follower.idle();
    expect(r.events).toEqual([{ type: 'promotion_failed', reason: 'newer_schema', detail: 'saved by a newer version' }]);
    await r.send(message(1, 2));
    expect(r.types()).toEqual(['promotion_failed', 'applied']);
  });

  it('an unavailable database at promotion is reported with its reason', async () => {
    const r = rig({ adapter: { promote: () => Promise.resolve({ mode: 'unavailable', reason: 'indexeddb_blocked', detail: 'blocked' }) } });
    r.grant();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await r.follower.idle();
    expect(r.events).toEqual([{ type: 'promotion_failed', reason: 'indexeddb_blocked', detail: 'blocked' }]);
  });

  it('a tab closed before it was granted the lock never promotes, and closing gives the lock wait up', async () => {
    const r = rig();
    await r.follower.close();
    expect(r.lock.release).toHaveBeenCalled();
    r.grant();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await r.follower.idle();
    expect(r.adapter.promote).not.toHaveBeenCalled();
    await r.send(message(1, 2));
    expect(r.events).toEqual([]);
  });
});
