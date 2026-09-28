/** Ordered tasks: markers and snapshot writes run in the write queue's order (SONNET_HANDOFF §18.8). */
import { describe, expect, it } from 'vitest';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState } from '@/core/schema';
import { quotaError } from '@/test-support/persistence-kit';
import { boom, history, rig } from '@/test-support/queue-rig';

describe('write queue: ordered tasks', () => {
  it('a task runs after the ChangeSets pending when it was called', async () => {
    const { states, changes } = history(2);
    const order: string[] = [];
    const r = rig({ onQuota: async () => false });
    r.queue.subscribe((s) => s.state === 'saved' && order.push(`saved ${s.lastSavedRevision}`));
    void r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    const done = r.queue.runOrdered(async () => {
      order.push('task');
      return 42;
    });
    void r.queue.enqueue(changes[1] as ChangeSet, states[1] as CanonicalState);
    expect(await done).toBe(42);
    expect(order[0]).toBe('saved 2');
    expect(order.indexOf('task')).toBeGreaterThan(order.indexOf('saved 2'));
  });

  it('tasks run one at a time, in call order, and never change SaveStatus', async () => {
    const r = rig();
    const order: number[] = [];
    const task = (n: number) => r.queue.runOrdered(async () => void order.push(n));
    await Promise.all([task(1), task(2), task(3)]);
    expect(order).toEqual([1, 2, 3]);
    expect(r.statuses).toEqual([]);
    expect(r.queue.getStatus().state).toBe('saved');
  });

  it('waits out a retry backoff for the write ahead of it, then runs', async () => {
    const { states, changes } = history(1);
    const r = rig();
    r.script.fail.push(boom());
    const write = r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    await r.scheduler.waitForTimer();
    let ran = false;
    const task = r.queue.runOrdered(async () => void (ran = true));
    await Promise.resolve();
    expect(ran).toBe(false);
    r.scheduler.fire();
    await Promise.all([write, task]);
    expect(ran).toBe(true);
    expect(r.queue.getStatus().state).toBe('saved');
  });

  it('still runs when the write ahead of it ended failed (it never stalls behind a failed batch)', async () => {
    const { states, changes } = history(1);
    const r = rig({ retryDelaysMs: [] });
    r.script.fail.push(boom());
    const write = r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    let ran = false;
    await r.queue.runOrdered(async () => void (ran = true));
    await write;
    expect(ran).toBe(true);
    expect(r.queue.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1 });
  });

  it('a failing task rejects its own promise only; the queue carries on', async () => {
    const r = rig();
    await expect(r.queue.runOrdered(async () => Promise.reject(new Error('task broke')))).rejects.toThrow('task broke');
    await expect(r.queue.runOrdered(() => {
      throw new Error('sync throw');
    })).rejects.toThrow('sync throw');
    await expect(r.queue.runOrdered(async () => 'fine')).resolves.toBe('fine');
  });

  it('is refused on a read-only tab (INV-28) and after close', async () => {
    await expect(rig({ readOnly: true }).queue.runOrdered(async () => 1)).rejects.toThrow(/read-only/);
    const r = rig();
    await r.queue.close();
    await expect(r.queue.runOrdered(async () => 1)).rejects.toThrow(/closed/);
  });
});

describe('write queue: a task never restarts a failed batch', () => {
  it('only a new ChangeSet or flush() does', async () => {
    const { states, changes } = history(1);
    const r = rig({ retryDelaysMs: [] });
    r.script.fail.push(boom());
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(r.batches).toHaveLength(1);
    await r.queue.runOrdered(async () => 'task');
    expect(r.batches).toHaveLength(1);
    expect(r.queue.getStatus().state).toBe('failed');
    await r.queue.flush();
    expect(r.batches).toHaveLength(2);
    expect(r.queue.getStatus().state).toBe('saved');
  });
});

describe('write queue: quota stage 2, periodic snapshots offered for deletion (ADV-040 snapshot stage)', () => {
  const failQuota = async (r: ReturnType<typeof rig>) => {
    const { states, changes } = history(1);
    r.script.fail.push(() => quotaError());
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
  };

  it('a quota failure with nothing left to evict lists the deletable snapshots, oldest first, in the failed status', async () => {
    const r = rig({ deletableSnapshotIds: async () => ['snp_old', 'snp_new'] });
    await failQuota(r);
    expect(r.queue.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1, deletablePeriodicSnapshotIds: ['snp_old', 'snp_new'] });
    expect(r.statuses.at(-1)?.deletablePeriodicSnapshotIds).toEqual(['snp_old', 'snp_new']);
  });

  it('without periodic snapshots, or when the lookup itself fails, the field is absent (never an empty promise)', async () => {
    for (const lookup of [async () => [], async () => Promise.reject(new Error('cannot list'))]) {
      const r = rig({ deletableSnapshotIds: lookup });
      await failQuota(r);
      expect(r.queue.getStatus().state).toBe('failed');
      expect('deletablePeriodicSnapshotIds' in r.queue.getStatus()).toBe(false);
    }
  });

  it('a failure that is not quota never offers snapshots', async () => {
    const { states, changes } = history(1);
    const r = rig({ retryDelaysMs: [], deletableSnapshotIds: async () => ['snp_a'] });
    r.script.fail.push(boom());
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect('deletablePeriodicSnapshotIds' in r.queue.getStatus()).toBe(false);
  });

  it('the list is refreshed after a task ran (a snapshot was deleted); an empty list clears the field; flush then saves', async () => {
    let ids = ['snp_a', 'snp_b'];
    const r = rig({ deletableSnapshotIds: async () => ids });
    await failQuota(r);
    await r.queue.runOrdered(async () => {
      ids = ['snp_b'];
    });
    expect(r.queue.getStatus().deletablePeriodicSnapshotIds).toEqual(['snp_b']);
    await r.queue.runOrdered(async () => {
      ids = [];
    });
    expect('deletablePeriodicSnapshotIds' in r.queue.getStatus()).toBe(false);
    expect(r.queue.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1 });
    await r.queue.flush();
    expect(r.queue.getStatus()).toEqual({ state: 'saved', pendingRevisions: 0, lastSavedRevision: 1 });
  });
});
