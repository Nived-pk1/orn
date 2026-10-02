/**
 * Step 5.1a, retryReplica() and dispose() (plan row 5.1a): a replica that is down gets a new client and a new sync loaded from
 * the store as it is NOW and the old ones are terminated; dispose() leaves no timer and no listener behind and is safe twice.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppServices } from '@/app/services';
import { createBooter, demoState, editNote } from '@/test-support/app-boot-kit';
import { testEnv, worldHolding } from '@/test-support/app-env-kit';
import { expectReplicaEqualsStore } from '@/test-support/replica-kit';
import type { Replica } from '@/workers/compute/replica';

const booter = createBooter();
afterEach(async () => {
  vi.useRealTimers();
  await booter.disposeAll();
});

const replicaAt = (replicas: readonly Replica[], index: number): Replica => replicas[index] as Replica;

describe('retryReplica: a new client and a new sync, loaded from the store as it is now', () => {
  it('after a worker that could not start', async () => {
    const t = testEnv({ world: await worldHolding(demoState(), 2) });
    const memory = t.env.workers.compute;
    let starts = 0;
    const services = await booter.bootEnv(t, {
      ...t.env,
      workers: {
        compute: () => {
          starts += 1;
          if (starts <= 2) throw new Error('no workers yet');
          return memory();
        },
      },
    });
    await vi.waitFor(() => expect(services.status.get().replica.state).toBe('down'));
    editNote(services, 'while the replica was down');
    expect(t.workers).toHaveLength(0);
    expect(await services.retryReplica()).toEqual({ ok: true });
    expect(services.status.get().replica).toMatchObject({ state: 'in_sync', revision: 3 });
    expect(t.workers).toHaveLength(1);
    expectReplicaEqualsStore(replicaAt(t.replicas, 0), services.store, 'after retry');
  });

  it('a healthy replica is replaced: the old worker is terminated, the new one holds the current state and follows', async () => {
    const { services, t } = await booter.boot({ world: await worldHolding(demoState(), 2) });
    const first = services.replicaSync();
    editNote(services, 'one');
    expect(await services.retryReplica()).toEqual({ ok: true });
    expect(services.replicaSync()).not.toBe(first);
    expect(t.workers.map((worker) => worker.alive())).toEqual([false, true]);
    expectReplicaEqualsStore(replicaAt(t.replicas, 1), services.store, 'new replica');
    editNote(services, 'two');
    await services.replicaSync()?.settled();
    expectReplicaEqualsStore(replicaAt(t.replicas, 1), services.store, 'new replica follows');
  });

  it('answers a value when the worker still cannot start, and the status says down', async () => {
    const t = testEnv({ world: await worldHolding(demoState(), 2) });
    const services = await booter.bootEnv(t, {
      ...t.env,
      workers: {
        compute: () => {
          throw new Error('never');
        },
      },
    });
    const result = await services.retryReplica();
    expect(result.ok).toBe(false);
    expect(services.status.get().replica.state).toBe('down');
  });
});

describe('dispose', () => {
  it('terminates the clients, stops the sync, releases the lock, closes the adapter; twice is fine', async () => {
    const { services, t } = await booter.boot({ world: await worldHolding(demoState(), 2) });
    const close = vi.spyOn(services.persistence as NonNullable<typeof services.persistence>, 'close');
    expect(t.world.locks.held()).toEqual(['orn-writer']);
    const first = services.dispose();
    expect(services.dispose()).toBe(first);
    await first;
    await services.dispose();
    expect(t.workers.every((worker) => !worker.alive())).toBe(true);
    expect(t.world.locks.held()).toEqual([]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(services.status.get().stage).toBe('disposed');
  });

  it('leaves no timer and no listener: a commit afterwards reaches nothing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const { services, t } = await booter.boot({ world: await worldHolding(demoState(), 2) });
    const statusSeen = vi.fn();
    services.status.subscribe(statusSeen);
    services.indexes.current();
    await services.replicaSync()?.settled();
    const writes = vi.spyOn(services.persistence as NonNullable<typeof services.persistence>, 'writeChanges');
    const callsBefore = t.calls.length;
    await services.dispose();
    statusSeen.mockClear();
    editNote(services, 'after dispose');
    expect(writes).not.toHaveBeenCalled();
    expect(services.indexes.stats().queued).toBe(0);
    expect(t.calls.length).toBe(callsBefore);
    expect(statusSeen).not.toHaveBeenCalled();
    expect(t.scheduler.live()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('createAppServices never throws for the environment', () => {
  it('an env with nothing but a worker factory boots session-only', async () => {
    const t = testEnv({ noIndexedDb: true, noLocks: true, noChannel: true });
    const services = await createAppServices({ ...t.env });
    expect(services.status.get()).toMatchObject({ mode: 'session_only', stage: 'ready' });
    await services.dispose();
  });
});
