/** Ordered tasks: markers and snapshot writes run in the write queue's order (SONNET_HANDOFF §18.8). */
import { describe, expect, it } from 'vitest';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState } from '@/core/schema';
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
