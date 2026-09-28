/**
 * The serial queue and SaveStatus with a scripted `persist` and a manual scheduler: retry delays are asserted,
 * never slept. Real-database behaviour is in tests/integration/persistence-write-path.test.ts.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { diffStates } from '@/core/dataset';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState } from '@/core/schema';
import { manualScheduler, quotaError } from '@/test-support/persistence-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import type { PendingBatch } from './coalesce';
import type { SaveStatus } from './contracts';
import { createWriteQueue, DEFAULT_RETRY_DELAYS_MS, type WriteQueueOptions } from './write-queue';

const base = loadFixtureState('maximal-valid');
const ids = Object.keys(base.records.species);

/** Successive states, each renaming one more species; `changes[i]` leads to `states[i]` (revision i + 1). */
function history(length: number): { states: CanonicalState[]; changes: ChangeSet[] } {
  const states: CanonicalState[] = [];
  const changes: ChangeSet[] = [];
  let before = base;
  for (let i = 0; i < length; i += 1) {
    const after = produce(before, (draft) => {
      (draft.records.species[ids[i % ids.length] as string] as unknown as { names: { canonical: string } }).names.canonical = `name ${i}`;
    });
    changes.push({ revision: i + 1, label: `edit ${i}`, cause: 'command', ...diffStates(before, after), patches: [], inversePatches: [] });
    states.push(after);
    before = after;
  }
  return { states, changes };
}

interface Rig {
  readonly queue: ReturnType<typeof createWriteQueue>;
  readonly scheduler: ReturnType<typeof manualScheduler>;
  readonly batches: { revision: number; count: number; touched: number }[];
  readonly statuses: SaveStatus[];
  readonly script: { fail: (() => Error | undefined)[] };
  quotaCalls: number;
}

/** `script.fail` is consumed one entry per persist call: an Error fails that call, undefined lets it succeed. */
function rig(options: Partial<WriteQueueOptions> & { quotaFrees?: number } = {}): Rig {
  const scheduler = manualScheduler();
  const batches: Rig['batches'] = [];
  const script = { fail: [] as (() => Error | undefined)[] };
  const state = { quotaCalls: 0, quotaFrees: options.quotaFrees ?? 0 };
  const queue = createWriteQueue({
    scheduler,
    persist: async (batch: PendingBatch) => {
      batches.push({ revision: batch.revision, count: batch.count, touched: batch.touched.size });
      const error = script.fail.shift()?.();
      if (error !== undefined) throw error;
    },
    onQuota: async () => {
      state.quotaCalls += 1;
      if (state.quotaFrees <= 0) return false;
      state.quotaFrees -= 1;
      return true;
    },
    ...options,
  });
  const statuses: SaveStatus[] = [];
  queue.subscribe((s) => statuses.push(s));
  return {
    queue,
    scheduler,
    batches,
    statuses,
    script,
    get quotaCalls() {
      return state.quotaCalls;
    },
  } as Rig;
}
const boom = (message = 'disk on fire') => () => new Error(message);

describe('write queue: the normal path', () => {
  it('saving → saved, lastSavedRevision follows, one batch per cycle', async () => {
    const { states, changes } = history(1);
    const r = rig();
    const done = r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(r.queue.getStatus()).toMatchObject({ state: 'saving', pendingRevisions: 1, lastSavedRevision: 0 });
    await done;
    expect(r.queue.getStatus()).toEqual({ state: 'saved', pendingRevisions: 0, lastSavedRevision: 1 });
    expect(r.statuses.map((s) => s.state)).toEqual(['saving', 'saved']);
    expect(r.batches).toEqual([{ revision: 1, count: 1, touched: 1 }]);
  });

  it('ChangeSets committed in the same tick share one transaction (latest value wins)', async () => {
    const { states, changes } = history(3);
    const r = rig();
    const all = changes.map((c, i) => r.queue.enqueue(c, states[i] as CanonicalState));
    expect(r.queue.getStatus()).toMatchObject({ state: 'saving', pendingRevisions: 3 });
    await Promise.all(all);
    expect(r.batches).toEqual([{ revision: 3, count: 3, touched: 3 }]);
    expect(r.queue.getStatus()).toMatchObject({ state: 'saved', lastSavedRevision: 3, pendingRevisions: 0 });
  });

  it('a ChangeSet that arrives while a write runs waits for the next transaction', async () => {
    const { states, changes } = history(2);
    const r = rig();
    const first = r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    await Promise.resolve();
    await Promise.resolve();
    expect(r.batches).toHaveLength(1);
    const second = r.queue.enqueue(changes[1] as ChangeSet, states[1] as CanonicalState);
    await Promise.all([first, second]);
    expect(r.batches.map((b) => b.revision)).toEqual([1, 2]);
    expect(r.queue.getStatus().lastSavedRevision).toBe(2);
  });

  it('flush with nothing pending resolves at once', async () => {
    await expect(rig().queue.flush()).resolves.toBeUndefined();
  });

  it('a throwing status listener does not stop the others or the write, and is reported', async () => {
    const events: string[] = [];
    const { states, changes } = history(1);
    const r = rig({ onEvent: (e) => events.push(e.type) });
    r.queue.subscribe(() => {
      throw new Error('listener bug');
    });
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(r.queue.getStatus().state).toBe('saved');
    expect(r.statuses.length).toBeGreaterThan(0);
    expect(events).toContain('status_listener_error');
  });

  it('unsubscribe stops notifications', async () => {
    const { states, changes } = history(1);
    const r = rig();
    const seen: string[] = [];
    const off = r.queue.subscribe((s) => seen.push(s.state));
    off();
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(seen).toEqual([]);
  });
});

describe('write queue: retry with backoff (fake timers)', () => {
  it('the default schedule is 250 ms, 1 s, 4 s', () => {
    expect(DEFAULT_RETRY_DELAYS_MS).toEqual([250, 1000, 4000]);
  });

  it('a failing write is retried after 250 ms, 1 s and 4 s, then the state is failed and the batch is kept', async () => {
    const { states, changes } = history(1);
    const r = rig();
    r.script.fail.push(boom('e1'), boom('e2'), boom('e3'), boom('e4'));
    const done = r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    for (const delay of [250, 1000, 4000]) {
      expect(await r.scheduler.waitForTimer()).toBe(delay);
      expect(r.queue.getStatus()).toMatchObject({ state: 'retrying', pendingRevisions: 1, lastError: expect.stringContaining('e') });
      r.scheduler.fire();
    }
    await done;
    expect(r.scheduler.delays).toEqual([250, 1000, 4000]);
    expect(r.batches).toHaveLength(4);
    expect(r.queue.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1, lastSavedRevision: 0, lastError: expect.stringContaining('e4') });
  });

  it('a retry that succeeds ends in saved with the error cleared', async () => {
    const { states, changes } = history(1);
    const r = rig();
    r.script.fail.push(boom(), boom());
    const done = r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    await r.scheduler.waitForTimer();
    r.scheduler.fire();
    await r.scheduler.waitForTimer();
    r.scheduler.fire();
    await done;
    expect(r.queue.getStatus()).toEqual({ state: 'saved', pendingRevisions: 0, lastSavedRevision: 1 });
    expect(r.scheduler.delays).toEqual([250, 1000]);
  });

  it('ChangeSets that arrive during a backoff join the retried transaction', async () => {
    const { states, changes } = history(2);
    const r = rig();
    r.script.fail.push(boom());
    const first = r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    await r.scheduler.waitForTimer();
    const second = r.queue.enqueue(changes[1] as ChangeSet, states[1] as CanonicalState);
    expect(r.queue.getStatus()).toMatchObject({ state: 'retrying', pendingRevisions: 2 });
    r.scheduler.fire();
    await Promise.all([first, second]);
    expect(r.batches.map((b) => b.revision)).toEqual([1, 2]);
    expect(r.batches[1]).toMatchObject({ count: 2, revision: 2 });
    expect(r.queue.getStatus()).toMatchObject({ state: 'saved', lastSavedRevision: 2 });
  });

  it('after failed, the next ChangeSet starts a fresh cycle over everything pending: no revision is skipped', async () => {
    const { states, changes } = history(2);
    const r = rig({ retryDelaysMs: [] });
    r.script.fail.push(boom());
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(r.queue.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1 });
    await r.queue.enqueue(changes[1] as ChangeSet, states[1] as CanonicalState);
    expect(r.batches[1]).toMatchObject({ revision: 2, count: 2, touched: 2 });
    expect(r.queue.getStatus()).toEqual({ state: 'saved', pendingRevisions: 0, lastSavedRevision: 2 });
  });

  it('flush after failed retries what is pending', async () => {
    const { states, changes } = history(1);
    const r = rig({ retryDelaysMs: [] });
    r.script.fail.push(boom());
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    await r.queue.flush();
    expect(r.queue.getStatus()).toEqual({ state: 'saved', pendingRevisions: 0, lastSavedRevision: 1 });
  });
});

describe('write queue: quota (ADV-040 write-path part)', () => {
  it('a quota error frees space and retries at once, without a timer', async () => {
    const { states, changes } = history(1);
    const r = rig({ quotaFrees: 1 });
    r.script.fail.push(() => quotaError());
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(r.quotaCalls).toBe(1);
    expect(r.scheduler.delays).toEqual([]);
    expect(r.batches).toHaveLength(2);
    expect(r.queue.getStatus()).toEqual({ state: 'saved', pendingRevisions: 0, lastSavedRevision: 1 });
  });

  it('when nothing is left to free the state is failed, quota is named, and the ChangeSet stays pending', async () => {
    const { states, changes } = history(1);
    const r = rig({ quotaFrees: 0 });
    r.script.fail.push(() => quotaError());
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(r.queue.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1, lastError: expect.stringContaining('QuotaExceededError') });
    expect(r.scheduler.delays).toEqual([]);
  });

  it('keeps freeing while it helps, then fails when the cache is empty', async () => {
    const { states, changes } = history(1);
    const r = rig({ quotaFrees: 2 });
    r.script.fail.push(() => quotaError(), () => quotaError(), () => quotaError());
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(r.quotaCalls).toBe(3);
    expect(r.queue.getStatus().state).toBe('failed');
  });

  it('a quota handler that throws counts as nothing freed', async () => {
    const { states, changes } = history(1);
    const r = rig({
      onQuota: async () => {
        throw new Error('cannot evict');
      },
    });
    r.script.fail.push(() => quotaError());
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(r.queue.getStatus().state).toBe('failed');
  });
});

describe('write queue: guards', () => {
  it('a read-only tab has no writer: status read_only and enqueue is refused (INV-28)', () => {
    const { states, changes } = history(1);
    const r = rig({ readOnly: true });
    expect(r.queue.getStatus().state).toBe('read_only');
    expect(() => r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState)).toThrow(/read-only/);
    expect(r.batches).toEqual([]);
  });

  it('a revision gap is refused loudly and the queue reports failed: the database would miss that change for good', async () => {
    const { states, changes } = history(3);
    const r = rig({ initialRevision: 0 });
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(() => r.queue.enqueue(changes[2] as ChangeSet, states[2] as CanonicalState)).toThrow(/does not follow 1/);
    expect(r.queue.getStatus()).toMatchObject({ state: 'failed', lastSavedRevision: 1 });
    expect(() => r.queue.enqueue(changes[1] as ChangeSet, states[1] as CanonicalState)).toThrow(/does not follow/);
    expect(r.batches).toHaveLength(1);
  });

  it('without a known starting revision the first ChangeSet establishes it', async () => {
    const { states, changes } = history(5);
    const r = rig();
    await r.queue.enqueue(changes[4] as ChangeSet, states[4] as CanonicalState);
    expect(r.queue.getStatus().lastSavedRevision).toBe(5);
  });

  it('close makes one last attempt without backoff, keeps what still fails pending, and refuses more', async () => {
    const { states, changes } = history(2);
    const r = rig();
    r.script.fail.push(boom());
    const first = r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    await r.scheduler.waitForTimer();
    r.script.fail.push(boom('still broken'));
    await r.queue.close();
    await first;
    expect(r.scheduler.live()).toBe(0);
    expect(r.queue.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1, lastError: expect.stringContaining('still broken') });
    expect(() => r.queue.enqueue(changes[1] as ChangeSet, states[1] as CanonicalState)).toThrow(/closed/);
  });

  it('close persists what is pending when the last attempt succeeds', async () => {
    const { states, changes } = history(1);
    const r = rig();
    r.script.fail.push(boom());
    const first = r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    await r.scheduler.waitForTimer();
    await r.queue.close();
    await first;
    expect(r.queue.getStatus()).toEqual({ state: 'saved', pendingRevisions: 0, lastSavedRevision: 1 });
  });
});
