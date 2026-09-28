/**
 * The Web Locks writer lock and the BroadcastChannel change channel, against a fake `LockManager` (semantics of the
 * spec: exclusive, `ifAvailable`, queued requests, abort) and against the REAL objects Node 24 provides.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ChangeChannel } from './contracts';
import { createBroadcastChangeChannel, createWebLocksWriterLock, type BroadcastChannelLike, type LockManagerLike } from './web-locks';

/** A LockManager with the semantics this module relies on. */
function fakeLockManager(): LockManagerLike & { readonly requests: string[] } {
  let held = false;
  const queue: { grant: () => void; signal?: AbortSignal }[] = [];
  const requests: string[] = [];
  const runHolding = async (callback: (lock: unknown) => Promise<void> | void): Promise<void> => {
    held = true;
    try {
      await callback({ name: 'orn-writer' });
    } finally {
      held = false;
      queue.shift()?.grant();
    }
  };
  return {
    requests,
    request(name, options, callback) {
      requests.push(`${name}:${options.ifAvailable === true ? 'ifAvailable' : 'queued'}`);
      if (!held) return runHolding(callback);
      if (options.ifAvailable === true) return Promise.resolve(callback(null));
      return new Promise((resolve, reject) => {
        const entry = { grant: () => void runHolding(callback).then(resolve, reject), ...(options.signal !== undefined ? { signal: options.signal } : {}) };
        options.signal?.addEventListener('abort', () => {
          const at = queue.indexOf(entry);
          if (at >= 0) queue.splice(at, 1);
          reject(new DOMException('aborted', 'AbortError'));
        });
        queue.push(entry);
      });
    },
  };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('createWebLocksWriterLock (fake LockManager)', () => {
  it('the first tab acquires, the second is held_elsewhere, and is granted when the first releases (promotion)', async () => {
    const locks = fakeLockManager();
    const first = createWebLocksWriterLock(locks);
    const second = createWebLocksWriterLock(locks);
    expect(await first.acquire()).toBe('acquired');
    expect(await second.acquire()).toBe('held_elsewhere');
    let granted = false;
    void second.whenAcquired().then(() => (granted = true));
    await settled();
    expect(granted).toBe(false);
    await first.release();
    await settled();
    expect(granted).toBe(true);
    await second.release();
  });

  it('release() abandons a pending wait: it is never granted, and the next tab is not blocked by it', async () => {
    const locks = fakeLockManager();
    const [a, b, c] = [createWebLocksWriterLock(locks), createWebLocksWriterLock(locks), createWebLocksWriterLock(locks)];
    await a.acquire();
    await b.acquire();
    await c.acquire();
    let bGranted = false;
    let cGranted = false;
    void b.whenAcquired().then(() => (bGranted = true));
    void c.whenAcquired().then(() => (cGranted = true));
    await b.release();
    await a.release();
    await settled();
    expect(bGranted).toBe(false);
    expect(cGranted).toBe(true);
  });

  it('a lock released and taken again works (a tab that closed and reopened)', async () => {
    const locks = fakeLockManager();
    const lock = createWebLocksWriterLock(locks);
    expect(await lock.acquire()).toBe('acquired');
    await lock.release();
    expect(await lock.acquire()).toBe('acquired');
    await lock.release();
  });

  it("no LockManager: 'unsupported', a wait that never ends, and release is harmless", async () => {
    const lock = createWebLocksWriterLock(undefined);
    expect(await lock.acquire()).toBe('unsupported');
    let granted = false;
    void lock.whenAcquired().then(() => (granted = true));
    await settled();
    expect(granted).toBe(false);
    await expect(lock.release()).resolves.toBeUndefined();
  });

  it("a LockManager that throws (a context that refuses locks) is 'unsupported', never a crash", async () => {
    const refusing: LockManagerLike = { request: () => Promise.reject(new DOMException('denied', 'SecurityError')) };
    expect(await createWebLocksWriterLock(refusing).acquire()).toBe('unsupported');
    const throwing: LockManagerLike = { request: () => { throw new DOMException('denied', 'SecurityError'); } };
    expect(await createWebLocksWriterLock(throwing).acquire()).toBe('unsupported');
  });

  it('uses the writer lock name by default', async () => {
    const locks = fakeLockManager();
    const lock = createWebLocksWriterLock(locks);
    await lock.acquire();
    expect(locks.requests).toEqual(['orn-writer:ifAvailable']);
    await lock.release();
  });
});

describe('createWebLocksWriterLock (the real navigator.locks of Node 24)', () => {
  let name = 0;
  const realLocks = () => navigator.locks as unknown as LockManagerLike;
  it('the same promotion protocol against the real Web Locks', async () => {
    name += 1;
    const lockName = `orn-writer-unit-${process.pid}-${name}`;
    const first = createWebLocksWriterLock(realLocks(), lockName);
    const second = createWebLocksWriterLock(realLocks(), lockName);
    expect(await first.acquire()).toBe('acquired');
    expect(await second.acquire()).toBe('held_elsewhere');
    let granted = false;
    const waiting = second.whenAcquired().then(() => (granted = true));
    await settled();
    expect(granted).toBe(false);
    await first.release();
    await waiting;
    expect(granted).toBe(true);
    await second.release();
    // free again
    const third = createWebLocksWriterLock(realLocks(), lockName);
    expect(await third.acquire()).toBe('acquired');
    await third.release();
  });

  it('an abandoned wait on the real Web Locks does not hold the lock', async () => {
    name += 1;
    const lockName = `orn-writer-unit-${process.pid}-${name}`;
    const [a, b] = [createWebLocksWriterLock(realLocks(), lockName), createWebLocksWriterLock(realLocks(), lockName)];
    await a.acquire();
    await b.acquire();
    void b.whenAcquired();
    await b.release();
    await a.release();
    await settled();
    const c = createWebLocksWriterLock(realLocks(), lockName);
    expect(await c.acquire()).toBe('acquired');
    await c.release();
  });
});

describe('createBroadcastChangeChannel', () => {
  /** A minimal in-memory BroadcastChannel: delivers to the other channels of the same name, never to the sender. */
  function fakeBroadcast(): (name: string) => BroadcastChannelLike {
    const all: { name: string; listeners: Set<(event: { data: unknown }) => void>; closed: boolean }[] = [];
    return (name) => {
      const self = { name, listeners: new Set<(event: { data: unknown }) => void>(), closed: false };
      all.push(self);
      return {
        postMessage(message) {
          for (const other of all) if (other !== self && other.name === name && !other.closed) for (const l of other.listeners) l({ data: structuredClone(message) });
        },
        addEventListener: (_type, listener) => void self.listeners.add(listener),
        removeEventListener: (_type, listener) => void self.listeners.delete(listener),
        close: () => void (self.closed = true),
      };
    };
  }

  it('posts to the other tabs (not to itself), unsubscribes, and closes', () => {
    const factory = fakeBroadcast();
    const a = createBroadcastChangeChannel(factory);
    const b = createBroadcastChangeChannel(factory);
    const heardByA: unknown[] = [];
    const heardByB: unknown[] = [];
    a.subscribe((m) => heardByA.push(m));
    const off = b.subscribe((m) => heardByB.push(m));
    a.post({ fromRevision: 1, revision: 2, changedIds: ['spc_a'] });
    expect(heardByA).toEqual([]);
    expect(heardByB).toEqual([{ fromRevision: 1, revision: 2, changedIds: ['spc_a'] }]);
    off();
    a.post({ fromRevision: 2, revision: 3, changedIds: 'all' });
    expect(heardByB).toHaveLength(1);
    b.close();
    a.close();
  });

  const opened: ChangeChannel[] = [];
  afterEach(() => {
    for (const channel of opened.splice(0)) channel.close();
  });

  it('the real BroadcastChannel of Node 24 carries the message between two channel objects', async () => {
    const make = () => {
      const channel = createBroadcastChangeChannel((n) => new BroadcastChannel(n) as never, `orn-changes-unit-${process.pid}`);
      opened.push(channel);
      return channel;
    };
    const writer = make();
    const follower = make();
    const received = new Promise<unknown>((resolve) => follower.subscribe(resolve));
    writer.post({ fromRevision: 7, revision: 9, changedIds: ['rxn_a', 'spc_b'] });
    expect(await received).toEqual({ fromRevision: 7, revision: 9, changedIds: ['rxn_a', 'spc_b'] });
  });
});
