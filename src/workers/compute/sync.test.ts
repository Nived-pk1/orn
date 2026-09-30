/**
 * The main-thread replica sync (step 4.2b), in memory: an in-memory port pair per worker start (every message cloned with
 * `structuredClone`), the real host and the real handlers behind it. Forwarding in order and one at a time, `REPLICA_STALE`
 * and the backlog bound turning into ONE reload, crash and timeout answered by the restart hook (never by re-sending an
 * apply), an idempotent call retried once, status as a value and as an event, and the way down.
 */
import { describe, expect, it } from 'vitest';
import type { StoreHandle } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset';
import { documentToState } from '@/core/dataset';
import { envelope, makeStore, mustCommit, recordIn, withFields } from '@/test-support/command-kit';
import { buildDemoDocument } from '@/test-support/demo';
import { expectReplicaEqualsStore } from '@/test-support/replica-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import { rig } from '@/test-support/compute-rig';
import type { Call, Rig } from '@/test-support/compute-rig';
import { callWithRetry } from '@/workers/rpc/retry';
import type { Replica } from './replica';
import { COMPUTE_SPECS } from './specs';
import { DEFAULT_MAX_BACKLOG, DEFAULT_MAX_BACKLOG_RECORDS } from './sync';

const MAX = loadFixtureState('maximal-valid');


/** Edits the note of the first species the store has now (a replace may have swapped the whole dataset). */
const edit = (store: StoreHandle, notes: string): ChangeSet => {
  const species = recordIn(store.getState(), 'species', Object.keys(store.getState().records.species).sort()[0] ?? '');
  return mustCommit(store.dispatch(envelope(`Note ${notes}`, { type: 'record.update', record: withFields(species, { notes }) }))).changes;
};

/** One ChangeSet that updates two records. */
const editTwo = (store: StoreHandle, notes: string): ChangeSet => {
  const ids = Object.keys(store.getState().records.species).sort().slice(0, 2);
  const commands = ids.map((id) => ({ type: 'record.update' as const, record: withFields(recordIn(store.getState(), 'species', id), { notes }) }));
  return mustCommit(store.dispatch(envelope(`Notes ${notes}`, ...commands))).changes;
};

const loads = (r: Rig): Call[] => r.calls.filter((call) => call.method === 'loadReplica');
const applies = (r: Rig): number[] => r.calls.filter((call) => call.method === 'applyChanges').map((call) => call.revision ?? -1);
const never = (): Promise<never> => new Promise<never>(() => undefined);

describe('following the store', () => {
  it('loads the store first: reloading, then in_sync, as a value and as events', async () => {
    const r = rig();
    expect(r.sync.status()).toMatchObject({ state: 'reloading', replicaRevision: null, storeRevision: 0 });
    const settled = await r.sync.settled();
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: 0, storeRevision: 0, queued: 0, reloads: 1 });
    expect(r.statuses()).toEqual(['reloading', 'in_sync']);
    expect(loads(r)).toEqual([{ worker: 0, method: 'loadReplica', revision: 0 }]);
    expectReplicaEqualsStore(r.replicas[0] as Replica, r.store, 'first load');
    r.sync.stop();
  });

  it('forwards commits, undo, redo and replace, in order and one at a time; the replica equals the store', async () => {
    const r = rig();
    await r.sync.settled();
    // Several commits before the worker can answer any of them: a burst, not a lockstep.
    edit(r.store, 'one');
    edit(r.store, 'two');
    edit(r.store, 'three');
    r.store.undo();
    r.store.redo();
    const parsed = documentToState(buildDemoDocument());
    if (!parsed.ok) throw new Error('demo has duplicate IDs');
    mustCommit(r.store.replaceState(parsed.state, 'import'));
    edit(r.store, 'after the import');
    const settled = await r.sync.settled();
    expect(applies(r)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.concurrency.max).toBe(1);
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: 7, storeRevision: 7, queued: 0, reloads: 1 });
    expectReplicaEqualsStore(r.replicas[0] as Replica, r.store, 'after the burst');
    r.sync.stop();
  });

  it('a follower store forwards its remote ChangeSets, a span included', async () => {
    const follower = makeStore(MAX, { readOnly: () => true });
    const r = rig({ store: follower });
    await r.sync.settled();
    follower.applyRemote({ fromRevision: 0, revision: 4, upserts: [withFields(recordIn(MAX, 'species', Object.keys(MAX.records.species).sort()[0] ?? ''), { notes: 'from the writer' })], deletedIds: [] });
    const settled = await r.sync.settled();
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: 4, reloads: 1 });
    expectReplicaEqualsStore(r.replicas[0] as Replica, follower, 'after a remote span');
    r.sync.stop();
  });

  it('stop() ends the following: later commits are not forwarded, and the worker is terminated', async () => {
    const r = rig();
    await r.sync.settled();
    r.sync.stop();
    edit(r.store, 'after stop');
    await r.sync.settled();
    expect(applies(r)).toEqual([]);
    expect(r.workers[0]?.alive()).toBe(false);
  });
});

describe('reloading instead of forwarding', () => {
  it('REPLICA_STALE: one reload of the current state, then forwarding goes on', async () => {
    const r = rig();
    await r.sync.settled();
    // Push the worker's replica somewhere the store is not (a lost ChangeSet, a worker that was reloaded by someone else).
    expect((await r.sync.client.loadReplica({ state: r.store.getState(), revision: 40 })).ok).toBe(true);
    edit(r.store, 'one');
    const settled = await r.sync.settled();
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: 1, storeRevision: 1, reloads: 2 });
    expect(r.statuses()).toEqual(['reloading', 'in_sync', 'reloading', 'in_sync']);
    const reason = r.events.find((event) => event.type === 'replica_status' && event.reason.startsWith('REPLICA_STALE'));
    expect(reason).toBeDefined();
    edit(r.store, 'two');
    await r.sync.settled();
    expect(r.replicas[0]?.revision()).toBe(2);
    expectReplicaEqualsStore(r.replicas[0] as Replica, r.store, 'after the stale reload');
    r.sync.stop();
  });

  it('a backlog beyond the bound is dropped for ONE loadReplica of the current state; no edit is lost', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const r = rig({
      maxBacklog: 3,
      wrap: (_index, api) => ({ ...api, applyChanges: async (params, ctx) => (params.changes.revision === 1 ? (await gate, api.applyChanges(params, ctx)) : api.applyChanges(params, ctx)) }),
    });
    await r.sync.settled();
    for (let i = 1; i <= 7; i += 1) edit(r.store, `edit ${i}`);
    // The first ChangeSet is in flight (blocked); the rest arrived faster than the worker answers.
    expect(r.sync.status().state).toBe('reloading');
    release();
    const settled = await r.sync.settled();
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: 7, storeRevision: 7, reloads: 2 });
    expect(loads(r).map((call) => call.revision)).toEqual([0, 7]);
    expect(applies(r)).toEqual([1]);
    const reason = r.events.find((event) => event.type === 'replica_status' && event.reason.includes('more than 3 ChangeSets'));
    expect(reason).toBeDefined();
    expectReplicaEqualsStore(r.replicas[0] as Replica, r.store, 'after the backlog reload');
    r.sync.stop();
  });

  it('the default bound is 100 and up to the bound nothing is reloaded', async () => {
    expect(DEFAULT_MAX_BACKLOG).toBe(100);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const r = rig({ maxBacklog: 3, wrap: (_index, api) => ({ ...api, applyChanges: async (params, ctx) => (params.changes.revision === 1 ? (await gate, api.applyChanges(params, ctx)) : api.applyChanges(params, ctx)) }) });
    await r.sync.settled();
    // One in flight and exactly 3 waiting: at the bound, not beyond it.
    for (let i = 1; i <= 4; i += 1) edit(r.store, `edit ${i}`);
    expect(r.sync.status()).toMatchObject({ state: 'in_sync', queued: 3 });
    release();
    await r.sync.settled();
    expect(loads(r)).toHaveLength(1);
    expect(applies(r)).toEqual([1, 2, 3, 4]);
    r.sync.stop();
  });

  it('a backlog beyond the record bound (touched records, not ChangeSets) is dropped for ONE loadReplica', async () => {
    expect(DEFAULT_MAX_BACKLOG_RECORDS).toBe(2_000);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const r = rig({
      maxBacklogRecords: 3,
      wrap: (_index, api) => ({ ...api, applyChanges: async (params, ctx) => (params.changes.revision === 1 ? (await gate, api.applyChanges(params, ctx)) : api.applyChanges(params, ctx)) }),
    });
    await r.sync.settled();
    edit(r.store, 'in flight');
    // Two species per ChangeSet: 2 records waiting (at most 3 allowed), then 4 (beyond).
    editTwo(r.store, 'a');
    expect(r.sync.status()).toMatchObject({ state: 'in_sync', queued: 1 });
    editTwo(r.store, 'b');
    expect(r.sync.status().state).toBe('reloading');
    release();
    const settled = await r.sync.settled();
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: 3, storeRevision: 3, reloads: 2 });
    expect(r.events.some((event) => event.type === 'replica_status' && event.reason.includes('more than 3 touched records'))).toBe(true);
    expectReplicaEqualsStore(r.replicas[0] as Replica, r.store, 'after the record-bound reload');
    r.sync.stop();
  });

  it('a worker error that is not a crash (INTERNAL) is answered by a reload, not by ignoring it', async () => {
    let failures = 1;
    const r = rig({
      wrap: (_index, api) => ({
        ...api,
        applyChanges: async (params, ctx) => {
          if (failures > 0 && params.changes.revision === 2) {
            failures -= 1;
            throw new Error('a bug in apply');
          }
          return api.applyChanges(params, ctx);
        },
      }),
    });
    await r.sync.settled();
    edit(r.store, 'one');
    edit(r.store, 'two');
    edit(r.store, 'three');
    const settled = await r.sync.settled();
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: 3, reloads: 2 });
    expect(r.events.some((event) => event.type === 'replica_status' && event.reason.includes('applyChanges failed (INTERNAL'))).toBe(true);
    expectReplicaEqualsStore(r.replicas[0] as Replica, r.store, 'after an INTERNAL answer');
    r.sync.stop();
  });
});

describe('a crash under the sync', () => {
  it('under applyChanges: the restart hook reloads the CURRENT state; the apply is never sent again', async () => {
    const r = rig({
      wrap: (index, api, worker) => ({
        ...api,
        applyChanges: async (params, ctx) => {
          if (index === 0 && params.changes.revision === 2) {
            worker.crash('exit');
            return never();
          }
          return api.applyChanges(params, ctx);
        },
      }),
    });
    await r.sync.settled();
    edit(r.store, 'one');
    edit(r.store, 'two');
    edit(r.store, 'three');
    const settled = await r.sync.settled();
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: 3, storeRevision: 3 });
    // Worker 0 saw applies 1 and 2 (the crash); worker 1 was loaded at revision 3 and was sent nothing more.
    expect(r.calls.filter((call) => call.worker === 0 && call.method === 'applyChanges').map((call) => call.revision)).toEqual([1, 2]);
    expect(r.calls.filter((call) => call.worker === 1)).toEqual([{ worker: 1, method: 'loadReplica', revision: 3 }]);
    expect(r.statuses()).toEqual(['reloading', 'in_sync', 'reloading', 'in_sync']);
    expect(r.events.some((event) => event.type === 'crash' && event.willRestart)).toBe(true);
    expectReplicaEqualsStore(r.replicas[1] as Replica, r.store, 'after the restart');
    // And it keeps following.
    edit(r.store, 'four');
    await r.sync.settled();
    expect(r.replicas[1]?.revision()).toBe(4);
    r.sync.stop();
  });

  it('while idle: the hook reloads before any other call; an idempotent call is retried once and succeeds', async () => {
    const r = rig({
      wrap: (index, api, worker) => ({
        ...api,
        validateAll: async (params, ctx) => {
          if (index === 0) {
            worker.crash('exit');
            return never();
          }
          return api.validateAll(params, ctx);
        },
      }),
    });
    await r.sync.settled();
    edit(r.store, 'one');
    await r.sync.settled();
    const answer = await callWithRetry(r.sync.client, COMPUTE_SPECS, 'validateAll', { revision: r.store.getRevision() });
    expect(answer.ok && answer.value.ok && answer.value.findings.length).toBe(r.store.findings.all().length);
    expect(r.calls.filter((call) => call.method === 'validateAll').map((call) => call.worker)).toEqual([0, 1]);
    expect(loads(r).map((call) => [call.worker, call.revision])).toEqual([[0, 0], [1, 1]]);
    expectReplicaEqualsStore(r.replicas[1] as Replica, r.store, 'after the retried call');
    r.sync.stop();
  });

  it('an apply-like call is never retried: it answers WORKER_CRASHED and the sync reloads instead', async () => {
    const r = rig({
      wrap: (index, api, worker) => ({
        ...api,
        applyChanges: async (params, ctx) => {
          if (index === 0 && params.changes.revision === 9) {
            worker.crash('exit');
            return never();
          }
          return api.applyChanges(params, ctx);
        },
      }),
    });
    await r.sync.settled();
    const answer = await callWithRetry(r.sync.client, COMPUTE_SPECS, 'applyChanges', { changes: { revision: 9, label: 'x', cause: 'command', created: [], updated: [], deleted: [], patches: [], inversePatches: [] } });
    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.error.code).toBe('WORKER_CRASHED');
    expect(r.calls.filter((call) => call.method === 'applyChanges')).toHaveLength(1);
    await r.sync.settled();
    expectReplicaEqualsStore(r.replicas[1] as Replica, r.store, 'after the crash');
    r.sync.stop();
  });

  it('a crash while the hook is reloading starts over: the next worker is loaded and the sync is in_sync', async () => {
    const r = rig({
      wrap: (index, api, worker) => ({
        ...api,
        loadReplica: async (params, ctx) => {
          if (index === 1) {
            worker.crash('exit');
            return never();
          }
          return api.loadReplica(params, ctx);
        },
        applyChanges: async (params, ctx) => {
          if (index === 0 && params.changes.revision === 1) {
            worker.crash('exit');
            return never();
          }
          return api.applyChanges(params, ctx);
        },
      }),
    });
    await r.sync.settled();
    edit(r.store, 'one');
    const settled = await r.sync.settled();
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: 1 });
    expect(r.workers).toHaveLength(3);
    expectReplicaEqualsStore(r.replicas[2] as Replica, r.store, 'after two restarts');
    r.sync.stop();
  });
});

describe('down', () => {
  it('the client giving up is `down`: a value and an event, the queue is dropped, later commits are not an error', async () => {
    const r = rig({
      maxRestarts: 1,
      wrap: (index, api, worker) => ({
        ...api,
        loadReplica: async (params, ctx) => {
          if (index >= 1) {
            worker.crash('exit');
            return never();
          }
          return api.loadReplica(params, ctx);
        },
        applyChanges: async (params, ctx) => {
          if (index === 0) {
            worker.crash('exit');
            return never();
          }
          return api.applyChanges(params, ctx);
        },
      }),
    });
    await r.sync.settled();
    edit(r.store, 'one');
    const settled = await r.sync.settled();
    expect(settled.state).toBe('down');
    expect(settled.reason).toMatch(/down for good/);
    expect(r.events.some((event) => event.type === 'gave_up')).toBe(true);
    expect(r.statuses().at(-1)).toBe('down');
    edit(r.store, 'while down');
    expect(r.sync.status()).toMatchObject({ state: 'down', queued: 0, storeRevision: 2 });
    r.sync.stop();
  });

  it('a reload the worker refuses (not a crash) is `down` with the reason, not a loop', async () => {
    const r = rig({
      wrap: (_index, api) => ({ ...api, loadReplica: async () => { throw new Error('cannot load this'); } }),
    });
    const settled = await r.sync.settled();
    expect(settled.state).toBe('down');
    expect(settled.reason).toContain('INTERNAL');
    expect(settled.reason).toContain('cannot load this');
    expect(r.statuses()).toEqual(['reloading', 'down']);
    r.sync.stop();
  });
});
