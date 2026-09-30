/**
 * Helpers for the tests of boot and follower validation in the compute worker (step 4.2d): a `BootReplica` over in-memory
 * workers (real handlers behind a port pair that clones every message), with hooks to make the worker fail, and a way to count
 * index builds on either side of the port. Test-only.
 */
import { coreIndexEngine } from '@/core/indexes/engine';
import type { MigrationRunner } from '@/core/migrations/contracts';
import { createBootReplica, type BootReplica } from '@/workers/compute/boot-port';
import { createComputeHandlers } from '@/workers/compute/handlers';
import type { Replica } from '@/workers/compute/replica';
import type { ComputeWorkerApi, RpcClientOptions, WorkerEvent, WorkerFactory } from '@/workers/rpc/contracts';
import { createRpcHost } from '@/workers/rpc/host';
import { createMemoryWorkers, type MemoryWorker } from './rpc-memory-port';

export interface BootRigOptions {
  readonly runner?: MigrationRunner;
  /** Wraps the handlers of worker `index` (0 = the first start, 1 = after the first restart, ...). */
  readonly wrap?: (index: number, api: ComputeWorkerApi, worker: MemoryWorker) => ComputeWorkerApi;
  /** Replaces the worker factory (a start that fails). */
  readonly factory?: WorkerFactory;
  readonly client?: Omit<RpcClientOptions<ComputeWorkerApi>, 'onRestart' | 'onEvent'>;
}

export interface BootRig {
  readonly boot: BootReplica;
  readonly events: WorkerEvent[];
  readonly replicas: Replica[];
  readonly workers: MemoryWorker[];
  readonly factory: WorkerFactory;
  /** Calls each worker received, by method name (logged outside the wrapper). */
  readonly calls: string[];
  /** `coreIndexEngine.build` calls made while the boot replica's `validate` was running (the worker's, in this process). */
  readonly workerBuilds: () => number;
}

export function bootRig(options: BootRigOptions = {}): BootRig {
  const events: WorkerEvent[] = [];
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
  const factory = options.factory ?? memory.factory;
  const boot = createBootReplica({ factory, ...(options.client === undefined ? {} : { client: options.client }), onEvent: (event) => events.push(event) });
  // Builds are counted around the worker side only: everything `validate` awaits is the worker's work (main waits). The test
  // installs the spy (`vi.spyOn(coreIndexEngine, 'build')`); without one the count stays 0.
  const builds = (): number => (coreIndexEngine.build as unknown as { mock?: { calls: unknown[] } }).mock?.calls.length ?? 0;
  let inside = 0;
  const validate = boot.validate;
  const counted: BootReplica = {
    ...boot,
    validate: async (state, revision) => {
      const before = builds();
      try {
        return await validate(state, revision);
      } finally {
        inside += builds() - before;
      }
    },
  };
  return { boot: counted, events, replicas, workers: memory.workers, factory, calls, workerBuilds: () => inside };
}
