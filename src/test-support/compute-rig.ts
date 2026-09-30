/**
 * A rig for the compute replica sync tests (step 4.2b): in-memory port pair per worker start (every message cloned with
 * `structuredClone`), the real host and the real handlers behind it, a log of the calls each worker received (logged
 * outside the wrapper, so a call that crashes the worker is on record too), and the events the sync emitted. Test-only.
 */
import type { StoreHandle } from '@/core/commands';
import type { MigrationRunner } from '@/core/migrations/contracts';
import { makeStore } from './command-kit';
import { createMemoryWorkers, type MemoryWorker } from './rpc-memory-port';
import { loadFixtureState } from './state-fixture';
import { createComputeHandlers } from '@/workers/compute/handlers';
import type { Replica } from '@/workers/compute/replica';
import { createReplicaSync, type ReplicaSync } from '@/workers/compute/sync';
import type { ComputeWorkerApi, WorkerEvent } from '@/workers/rpc/contracts';
import { createRpcHost } from '@/workers/rpc/host';

export interface Call {
  readonly worker: number;
  readonly method: keyof ComputeWorkerApi;
  readonly revision?: number;
}

export interface Rig {
  readonly store: StoreHandle;
  readonly sync: ReplicaSync;
  readonly events: WorkerEvent[];
  readonly replicas: Replica[];
  readonly calls: Call[];
  readonly workers: MemoryWorker[];
  /** Applies of one worker in flight right now, and the most there ever were at once. */
  readonly concurrency: { current: number; max: number };
  readonly statuses: () => string[];
}

export interface RigOptions {
  readonly store?: StoreHandle;
  readonly maxBacklog?: number;
  readonly maxBacklogRecords?: number;
  readonly maxRestarts?: number;
  /** The instant the workers' handlers report as their monotonic clock (the route budget's). */
  readonly nowMs?: () => number;
  /** The migration runner of the workers' `snapshotDecode` (default: the app's). */
  readonly runner?: MigrationRunner;
  /** Wraps the handlers of worker `index` (0 = the first start, 1 = after the first restart, ...). */
  readonly wrap?: (index: number, api: ComputeWorkerApi, worker: MemoryWorker) => ComputeWorkerApi;
}

export function rig(options: RigOptions = {}): Rig {
  const store = options.store ?? makeStore(loadFixtureState('maximal-valid'));
  const events: WorkerEvent[] = [];
  const replicas: Replica[] = [];
  const calls: Call[] = [];
  const concurrency = { current: 0, max: 0 };
  const memory = createMemoryWorkers((worker, index) => {
    const { api: real, replica } = createComputeHandlers({ ...(options.nowMs === undefined ? {} : { nowMs: options.nowMs }), ...(options.runner === undefined ? {} : { runner: options.runner }) });
    replicas.push(replica);
    const api = options.wrap?.(index, real, worker) ?? real;
    // Logged outside the wrapper, so a call that crashes the worker is on record too.
    const logged: ComputeWorkerApi = {
      ...api,
      loadReplica: async (params, ctx) => {
        calls.push({ worker: index, method: 'loadReplica', revision: params.revision });
        return api.loadReplica(params, ctx);
      },
      applyChanges: async (params, ctx) => {
        calls.push({ worker: index, method: 'applyChanges', revision: params.changes.revision });
        concurrency.current += 1;
        concurrency.max = Math.max(concurrency.max, concurrency.current);
        try {
          return await api.applyChanges(params, ctx);
        } finally {
          concurrency.current -= 1;
        }
      },
      validateAll: async (params, ctx) => {
        calls.push({ worker: index, method: 'validateAll', revision: params.revision });
        return api.validateAll(params, ctx);
      },
    };
    // The import-related calls (step 4.2c) are on record too, by name.
    for (const method of ['importPreview', 'importRevise', 'importCancel', 'importPrepareApply', 'snapshotBuild', 'snapshotDecode', 'adoptPending', 'dropPending', 'exportPlan', 'exportBuild'] as const) {
      const inner = logged[method] as (params: never, ctx: never) => Promise<unknown>;
      (logged as unknown as Record<string, unknown>)[method] = (params: never, ctx: never) => {
        calls.push({ worker: index, method });
        return inner(params, ctx);
      };
    }
    createRpcHost(worker.host, logged);
  });
  const sync = createReplicaSync({
    factory: memory.factory,
    store,
    ...(options.maxBacklog === undefined ? {} : { maxBacklog: options.maxBacklog }),
    ...(options.maxBacklogRecords === undefined ? {} : { maxBacklogRecords: options.maxBacklogRecords }),
    ...(options.maxRestarts === undefined ? {} : { client: { maxRestarts: options.maxRestarts } }),
    onEvent: (event) => events.push(event),
  });
  const statuses = (): string[] => events.flatMap((event) => (event.type === 'replica_status' ? [event.status] : []));
  return { store, sync, events, replicas, calls, workers: memory.workers, concurrency, statuses };
}
