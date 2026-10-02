/**
 * An `AppEnv` for the tests of the app services (step 5.1a): fake-indexeddb, an in-memory Web Locks manager and
 * BroadcastChannel shared by several "tabs", the compute host over an in-memory port pair, a counting clock, a seeded random
 * source and a manual scheduler. Nothing reads a global. Test-only.
 */
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import type { AppEnv } from '@/app/services';
import { createMigrationRunner } from '@/core/migrations';
import type { MigrationRunner } from '@/core/migrations/contracts';
import type { ChangeMessage, BroadcastChannelFactory, LockManagerLike } from '@/persistence';
import { createComputeHandlers } from '@/workers/compute/handlers';
import type { Replica } from '@/workers/compute/replica';
import type { ComputeWorkerApi, WorkerFactory } from '@/workers/rpc/contracts';
import { createRpcHost } from '@/workers/rpc/host';
import { mulberry32 } from './command-kit';
import type { CanonicalState } from '@/core/schema';
import { manualScheduler, savedDatabase, type ManualScheduler } from './persistence-kit';
import { createMemoryWorkers, type MemoryWorker } from './rpc-memory-port';
import { createMemoryChannelHub, type MemoryChannelHub } from './tab-fakes';

/** An exclusive, named lock like `navigator.locks`: `ifAvailable`, queueing and `signal` abort, shared by every tab of a world. */
export interface MemoryLockManager extends LockManagerLike {
  /** Names currently held. */
  held(): string[];
  /** Requests made so far, with or without an answer (a tab that asks again shows here). */
  requests(): number;
  /** Requests waiting in the queue. */
  waiting(): number;
}

export function createMemoryLockManager(): MemoryLockManager {
  const holders = new Set<string>();
  let requested = 0;
  const queues = new Map<string, { grant: () => void }[]>();
  const grantNext = (name: string): void => {
    const next = queues.get(name)?.shift();
    if (next !== undefined) next.grant();
  };
  return {
    held: () => [...holders],
    requests: () => requested,
    waiting: () => [...queues.values()].reduce((sum, queue) => sum + queue.length, 0),
    request(name, options, callback) {
      requested += 1;
      const run = async (): Promise<unknown> => {
        holders.add(name);
        try {
          return await callback({ name });
        } finally {
          holders.delete(name);
          grantNext(name);
        }
      };
      if (!holders.has(name)) return run();
      if (options.ifAvailable === true) return Promise.resolve(callback(null));
      return new Promise((resolve, reject) => {
        const entry = { grant: () => void run().then(resolve, reject) };
        const queue = queues.get(name) ?? [];
        queues.set(name, queue);
        queue.push(entry);
        options.signal?.addEventListener('abort', () => {
          const at = queue.indexOf(entry);
          if (at >= 0) queue.splice(at, 1);
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    },
  };
}

/** What several tabs of one browser share. */
export interface World {
  readonly indexedDB: IDBFactory;
  readonly locks: MemoryLockManager;
  readonly channels: MemoryChannelHub;
}

export const newWorld = (indexedDB: IDBFactory = new IDBFactory()): World => ({ indexedDB, locks: createMemoryLockManager(), channels: createMemoryChannelHub() });

/** A `BroadcastChannel`-shaped factory over the hub (its deliveries stay manual: `world.channels.deliver()`). */
export function memoryBroadcastFactory(hub: MemoryChannelHub): BroadcastChannelFactory {
  return () => {
    const channel = hub.newChannel();
    const unsubscribers = new Map<unknown, () => void>();
    return {
      postMessage: (message) => channel.post(message as ChangeMessage),
      addEventListener(_type, listener) {
        unsubscribers.set(listener, channel.subscribe((data) => listener({ data })));
      },
      removeEventListener(_type, listener) {
        unsubscribers.get(listener)?.();
        unsubscribers.delete(listener);
      },
      close: () => channel.close(),
    };
  };
}

export interface TestEnvOptions {
  readonly world?: World;
  readonly noIndexedDb?: boolean;
  readonly noLocks?: boolean;
  readonly noChannel?: boolean;
  readonly runner?: MigrationRunner;
  /** Wraps the handlers of worker `index` (0 = the first start). */
  readonly wrap?: (index: number, api: ComputeWorkerApi, worker: MemoryWorker) => ComputeWorkerApi;
  /** Replaces the compute worker factory (a start that fails). */
  readonly computeFactory?: WorkerFactory;
  readonly seed?: number;
}

export interface TestEnv {
  readonly env: AppEnv;
  readonly world: World;
  readonly scheduler: ManualScheduler;
  /** Every compute worker the factory made, in order. */
  readonly workers: MemoryWorker[];
  readonly replicas: Replica[];
  /** `index:method` of every call a compute worker received. */
  readonly calls: string[];
  /** Milliseconds the counting clock has handed out (it advances by 1 on every read). */
  readonly clockReads: () => number;
}

export function testEnv(options: TestEnvOptions = {}): TestEnv {
  const world = options.world ?? newWorld();
  const scheduler = manualScheduler();
  const replicas: Replica[] = [];
  const calls: string[] = [];
  const memory = createMemoryWorkers((worker, index) => {
    const { api: real, replica } = createComputeHandlers(options.runner === undefined ? {} : { runner: options.runner });
    replicas.push(replica);
    const api = options.wrap?.(index, real, worker) ?? real;
    const logged = { ...api } as unknown as Record<string, (params: never, ctx: never) => Promise<unknown>>;
    for (const method of Object.keys(api) as (keyof ComputeWorkerApi)[]) {
      const inner = api[method] as (params: never, ctx: never) => Promise<unknown>;
      logged[method] = (params, ctx) => {
        calls.push(`${index}:${method}`);
        return inner(params, ctx);
      };
    }
    createRpcHost(worker.host, logged as unknown as ComputeWorkerApi);
  });
  let ms = 1_790_000_000_000;
  const random = mulberry32(options.seed ?? 7);
  const env: AppEnv = {
    ...(options.noIndexedDb === true ? {} : { indexedDB: world.indexedDB, IDBKeyRange }),
    ...(options.noLocks === true ? {} : { locks: world.locks }),
    ...(options.noChannel === true ? {} : { channel: memoryBroadcastFactory(world.channels) }),
    workers: { compute: options.computeFactory ?? memory.factory },
    clock: { nowMs: () => (ms += 1) },
    random: { next: random },
    timers: scheduler,
    migrationRunner: options.runner ?? createMigrationRunner(),
    generator: { app: 'orn-test', version: '0.0.0' },
  };
  return { env, world, scheduler, workers: memory.workers, replicas, calls, clockReads: () => ms - 1_790_000_000_000 };
}

/** A world whose database already holds `state` at `revision` (what a returning user has), the handle used to seed it closed. */
export async function worldHolding(state: CanonicalState, revision = 1): Promise<World> {
  const saved = await savedDatabase(state, {}, revision);
  saved.db.close();
  return newWorld(saved.indexedDB);
}
