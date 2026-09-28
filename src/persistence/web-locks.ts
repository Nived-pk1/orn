/**
 * The Web Locks implementation of the writer lock (INV-28) and the BroadcastChannel implementation of the change
 * channel (docs/PERSISTENCE.md §10). Neither reads a global: the app hands in `navigator.locks` and a
 * `BroadcastChannel` constructor from outside `src/persistence`, tests hand in fakes (and, once, the real ones).
 */
import { BROADCAST_CHANNEL, WRITER_LOCK_NAME, type ChangeChannel, type WriterLock } from './contracts';

/** The part of `LockManager` this module uses (structurally what `navigator.locks` is). */
export interface LockManagerLike {
  request(
    name: string,
    options: { readonly mode?: 'exclusive'; readonly ifAvailable?: boolean; readonly signal?: AbortSignal },
    callback: (lock: unknown) => Promise<void> | void,
  ): Promise<unknown>;
}

/** No `locks`: every acquire answers `'unsupported'` (the tab runs as a single-tab writer, with a warning). */
export function createWebLocksWriterLock(locks: LockManagerLike | undefined, name: string = WRITER_LOCK_NAME): WriterLock {
  /** Settles the callback that holds the lock; the lock is released when it does. */
  let releaseHeld: (() => void) | undefined;
  let waiting: AbortController | undefined;
  /** The `request` promise: settles when the lock has really been released (or the wait aborted). */
  let requested: Promise<unknown> | undefined;

  const hold = (): Promise<void> =>
    new Promise<void>((resolve) => {
      releaseHeld = resolve;
    });

  return {
    async acquire() {
      if (locks === undefined) return 'unsupported';
      try {
        return await new Promise<'acquired' | 'held_elsewhere'>((resolve, reject) => {
          requested = locks.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => {
            if (lock === null) {
              resolve('held_elsewhere');
              return undefined;
            }
            resolve('acquired');
            return hold();
          });
          requested.catch(reject);
        });
      } catch {
        // A context that refuses locks (opaque origin, policy) cannot coordinate tabs: same as no Web Locks.
        return 'unsupported';
      }
    },

    whenAcquired() {
      if (locks === undefined) return new Promise<void>(() => undefined);
      return new Promise<void>((resolve) => {
        const controller = new AbortController();
        waiting = controller;
        // Queued behind the current holder; granted when it releases (or its tab closes).
        requested = locks.request(name, { mode: 'exclusive', signal: controller.signal }, () => {
          waiting = undefined;
          resolve();
          return hold();
        });
        requested.catch(() => undefined); // aborted by release(): the promise simply never resolves
      });
    },

    /** Resolves once the lock is really free (Web Locks release a moment after the holder's callback settles). */
    async release() {
      waiting?.abort();
      waiting = undefined;
      releaseHeld?.();
      releaseHeld = undefined;
      const pending = requested;
      requested = undefined;
      await pending?.catch(() => undefined);
    },
  };
}

/** The part of a `BroadcastChannel` this module uses. */
export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
  close(): void;
}

export type BroadcastChannelFactory = (name: string) => BroadcastChannelLike;

export function createBroadcastChangeChannel(factory: BroadcastChannelFactory, name: string = BROADCAST_CHANNEL): ChangeChannel {
  const channel = factory(name);
  return {
    post: (message) => channel.postMessage({ fromRevision: message.fromRevision, revision: message.revision, changedIds: message.changedIds }),
    subscribe(listener) {
      const onMessage = (event: { readonly data: unknown }): void => listener(event.data);
      channel.addEventListener('message', onMessage);
      return () => channel.removeEventListener('message', onMessage);
    },
    close: () => channel.close(),
  };
}
