/**
 * The production `AppEnv` (step 5.1d, E1): the only place that reads the browser's globals (`indexedDB`, `navigator.locks`,
 * `BroadcastChannel`, `navigator.storage`, `crypto`) and creates the four workers. Every one that does not exist is left out, so the
 * services report a status instead (session-only, single tab, no change notices, an unknown storage state).
 */
import { migrationRunner } from '@/core/migrations';
import type { LockManagerLike } from '@/persistence';
import type { AppEnv } from './services';
import { createCryptoRandom, systemClock, systemTimers } from './providers';
import { createWorkerFactories } from './worker-factories';

export const APP_NAME = 'organic-reaction-navigator';
export const APP_VERSION = '0.1.0';

/** The browser objects `createBrowserEnv` reads, so a test can pass fakes. */
export interface BrowserGlobals {
  readonly indexedDB?: IDBFactory;
  readonly IDBKeyRange?: typeof IDBKeyRange;
  readonly locks?: LockManagerLike;
  readonly BroadcastChannel?: typeof BroadcastChannel;
  readonly storage?: { persist(): Promise<boolean> };
  readonly crypto: Crypto;
}

export function browserGlobals(): BrowserGlobals {
  return {
    ...(typeof indexedDB === 'undefined' ? {} : { indexedDB }),
    ...(typeof IDBKeyRange === 'undefined' ? {} : { IDBKeyRange }),
    ...(typeof navigator === 'undefined' || navigator.locks === undefined ? {} : { locks: navigator.locks as unknown as LockManagerLike }),
    ...(typeof BroadcastChannel === 'undefined' ? {} : { BroadcastChannel }),
    ...(typeof navigator === 'undefined' || navigator.storage === undefined ? {} : { storage: navigator.storage }),
    crypto,
  };
}

export function createBrowserEnv(globals: BrowserGlobals = browserGlobals()): AppEnv {
  const Channel = globals.BroadcastChannel;
  return {
    ...(globals.indexedDB === undefined ? {} : { indexedDB: globals.indexedDB }),
    ...(globals.IDBKeyRange === undefined ? {} : { IDBKeyRange: globals.IDBKeyRange }),
    ...(globals.locks === undefined ? {} : { locks: globals.locks }),
    ...(Channel === undefined ? {} : { channel: (name: string) => new Channel(name) }),
    workers: createWorkerFactories(),
    clock: systemClock,
    random: createCryptoRandom(globals.crypto),
    timers: systemTimers,
    migrationRunner,
    generator: { app: APP_NAME, version: APP_VERSION },
    ...(globals.storage === undefined ? {} : { storage: globals.storage }),
  };
}
