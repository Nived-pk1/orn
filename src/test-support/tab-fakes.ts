/**
 * In-memory fakes for the multi-tab ports (step 3.4): a Web Locks-like exclusive lock shared by several "tabs" and a
 * BroadcastChannel-like hub whose deliveries the test controls (deliver now, drop, duplicate, inject junk). Test-only.
 */
import type { ChangeChannel, ChangeMessage, WriterLock } from '@/persistence/contracts';

export interface FakeLock extends WriterLock {
  readonly calls: string[];
  /** True while this tab holds the lock. */
  holds(): boolean;
}

export interface MemoryLockHub {
  /** A new tab's view of the one exclusive lock. */
  newLock(): FakeLock;
  /** How many tabs are waiting for the lock. */
  waiting(): number;
}

export function createMemoryLockHub(): MemoryLockHub {
  let holder: FakeLock | undefined;
  const waiters: { readonly lock: FakeLock; readonly grant: () => void }[] = [];
  const grantNext = (): void => {
    const next = waiters.shift();
    if (next === undefined) return;
    holder = next.lock;
    next.grant();
  };
  return {
    waiting: () => waiters.length,
    newLock() {
      const calls: string[] = [];
      const lock: FakeLock = {
        calls,
        holds: () => holder === lock,
        acquire() {
          calls.push('acquire');
          if (holder === undefined || holder === lock) {
            holder = lock;
            return Promise.resolve('acquired');
          }
          return Promise.resolve('held_elsewhere');
        },
        whenAcquired() {
          calls.push('whenAcquired');
          if (holder === lock) return Promise.resolve();
          return new Promise<void>((resolve) => {
            if (holder === undefined) {
              holder = lock;
              resolve();
            } else waiters.push({ lock, grant: resolve });
          });
        },
        release() {
          calls.push('release');
          if (holder === lock) {
            holder = undefined;
            grantNext();
          } else {
            const at = waiters.findIndex((w) => w.lock === lock);
            if (at >= 0) waiters.splice(at, 1); // abandoned wait: never resolves
          }
          return Promise.resolve();
        },
      };
      return lock;
    },
  };
}

export interface FakeChannel extends ChangeChannel {
  /** Every message this tab posted, in order. */
  readonly sent: ChangeMessage[];
}

export interface MemoryChannelHub {
  newChannel(): FakeChannel;
  /** Messages posted and not yet delivered. */
  pending(): number;
  /** Delivers everything pending to every OTHER open channel (structured clones, like the real thing); returns how many. */
  deliver(): number;
  /** Throws the oldest `count` pending messages away (a tab that was not listening). */
  drop(count?: number): void;
  /** Queues the oldest pending message again (a duplicate delivery). */
  duplicateOldest(): void;
  /** Delivers an arbitrary value to every channel except `from`, as if another tab had posted it. */
  inject(value: unknown, from?: FakeChannel): void;
}

export function createMemoryChannelHub(): MemoryChannelHub {
  interface Open {
    readonly channel: FakeChannel;
    readonly listeners: Set<(message: unknown) => void>;
    closed: boolean;
  }
  const opened: Open[] = [];
  const queue: { readonly from: FakeChannel; readonly data: unknown }[] = [];
  const toOthers = (from: FakeChannel | undefined, data: unknown): void => {
    for (const other of opened) {
      if (other.channel === from || other.closed) continue;
      for (const listener of [...other.listeners]) listener(structuredClone(data));
    }
  };
  return {
    pending: () => queue.length,
    newChannel() {
      const sent: ChangeMessage[] = [];
      const self: Open = {
        listeners: new Set(),
        closed: false,
        channel: {
          sent,
          post(message) {
            if (self.closed) throw new Error('the channel is closed');
            sent.push(message);
            queue.push({ from: self.channel, data: message });
          },
          subscribe(listener) {
            self.listeners.add(listener);
            return () => void self.listeners.delete(listener);
          },
          close() {
            self.closed = true;
          },
        },
      };
      opened.push(self);
      return self.channel;
    },
    deliver() {
      const batch = queue.splice(0, queue.length);
      for (const { from, data } of batch) toOthers(from, data);
      return batch.length;
    },
    drop: (count = queue.length) => void queue.splice(0, count),
    duplicateOldest() {
      const first = queue[0];
      if (first !== undefined) queue.unshift(first);
    },
    inject: (value, from) => toOthers(from, value),
  };
}
