/**
 * Boot and follower validation in the compute worker (step 4.2d, Phase 4 contract decision Q4). `createBootReplica` makes the
 * `validate` function `BootPorts.validate` (boot and promotion) and `FollowerOptions.validate` (a follower's full reload) take:
 * it sends the state to the worker (`loadReplica`, which validates it and returns the findings stamped for the store), checks the
 * answer with the store's own `checkPrecomputed` rules, and REMEMBERS that the worker's replica now holds that revision. So the
 * replica sync does not load it a second time: `adoption()` hands the client and the revision to `createReplicaSync({ adopt })`,
 * and after that every later validation (a follower's reload, promotion) tells the sync what the worker holds (`noteLoaded`), so
 * the ChangeSet the store's `reload` announces is not forwarded to a replica that already contains it.
 *
 * A worker that cannot validate (did not start, gave up, timed out, answered wrongly) is reported as a `validation_fallback`
 * WorkerEvent and by throwing: boot then validates in this thread and its report says so. Nothing is silent, and the data always
 * opens. A ports-only module: it never imports persistence.
 */
import { checkPrecomputed, type PrecomputedFindings } from '@/core/commands';
import type { CanonicalState } from '@/core/schema';
import { createRpcClient } from '@/workers/rpc/client';
import type { ComputeWorkerApi, RestartInfo, RpcClient, RpcClientOptions, WorkerEvent, WorkerFactory } from '@/workers/rpc/contracts';
import { COMPUTE_SPECS } from './specs';

/** What a replica sync installs on a client it did not create (`ReplicaSyncOptions.adopt`). */
export interface AdoptedClientHooks {
  /** The client's restart hook: reload the replica from the store, before other calls. */
  readonly onRestart: (raw: RpcClient<ComputeWorkerApi>, info: RestartInfo) => void | Promise<void>;
  /** Every WorkerEvent of the client. */
  readonly onEvent: (event: WorkerEvent) => void;
  /** The worker's replica now holds `revision` (loaded outside the sync); the store is about to adopt that state. */
  readonly noteLoaded: (revision: number) => void;
}

/** A client whose worker already holds a replica at `revision`. */
export interface ReplicaAdoption {
  readonly client: RpcClient<ComputeWorkerApi>;
  /** The revision the worker holds; null for a worker `prewarm` started that was never sent anything (the sync loads it). */
  readonly revision: number | null;
  attach(hooks: AdoptedClientHooks): void;
}

export interface BootReplicaOptions {
  readonly factory: WorkerFactory;
  /** Client options except the two the boot replica owns (`onRestart`, `onEvent`). */
  readonly client?: Omit<RpcClientOptions<ComputeWorkerApi>, 'onRestart' | 'onEvent'>;
  /** Every WorkerEvent of the client, plus `validation_fallback`. */
  readonly onEvent?: (event: WorkerEvent) => void;
}

export interface BootReplica {
  /** `BootPorts.validate` / `FollowerOptions.validate`: findings stamped for the store, or a rejection (boot then validates in process). */
  readonly validate: (state: CanonicalState, revision: number) => Promise<PrecomputedFindings>;
  /**
   * The client and revision for `createReplicaSync({ adopt })`, once; undefined when the worker holds no replica (it never loaded
   * one, restarted since, or gave up): the sync then creates its own client, and this one is terminated.
   */
  adoption(): ReplicaAdoption | undefined;
  /**
   * Starts the worker now, without sending it anything, so its start overlaps the caller's other work (the IndexedDB read at boot,
   * step 5.11a). Never throws: a start that fails is reported as a `validation_fallback` and the later `validate` fails the same way.
   */
  prewarm(): void;
  /** Terminates the worker if it was not handed to a sync. */
  stop(): void;
}

export function createBootReplica(options: BootReplicaOptions): BootReplica {
  let client: RpcClient<ComputeWorkerApi> | undefined;
  let hooks: AdoptedClientHooks | undefined;
  /** The revision the worker's replica holds, when this object is the only one that knows. */
  let loaded: number | undefined;
  let dead = false;
  let handedOver = false;
  /** True once `validate` has been called: a worker that was asked and holds nothing is not handed on. */
  let asked = false;

  const emit = (event: WorkerEvent): void => {
    try {
      options.onEvent?.(event);
    } catch {
      // a sink that throws must not break boot
    }
  };
  const forward = (event: WorkerEvent): void => {
    // A restart or a crash empties the worker: whatever it held is gone until the next load.
    if (event.type === 'restart' || event.type === 'crash') loaded = undefined;
    if (event.type === 'gave_up') dead = true;
    emit(event);
    hooks?.onEvent(event);
  };
  const fail = (reason: string): never => {
    emit({ type: 'validation_fallback', reason });
    throw new Error(reason);
  };

  function clientOf(): RpcClient<ComputeWorkerApi> {
    if (client !== undefined) return client;
    try {
      client = createRpcClient<ComputeWorkerApi>({
        factory: options.factory,
        specs: COMPUTE_SPECS,
        options: {
          ...options.client,
          onEvent: forward,
          onRestart: async (raw, info) => {
            loaded = undefined;
            await hooks?.onRestart(raw, info);
          },
        },
      });
    } catch (error) {
      dead = true;
      return fail(`the compute worker could not be started (${error instanceof Error ? error.message : String(error)})`);
    }
    return client;
  }

  return {
    async validate(state, revision) {
      asked = true;
      if (dead) return fail('the compute worker is down for good');
      const answer = await clientOf().loadReplica({ state, revision });
      if (!answer.ok) return fail(`the compute worker could not validate (${answer.error.code}: ${answer.error.message})`);
      const problem = checkPrecomputed(state, revision, answer.value);
      if (problem !== undefined) return fail(`the compute worker's findings were refused (${problem.message})`);
      loaded = revision;
      hooks?.noteLoaded(revision);
      return answer.value;
    },

    prewarm() {
      if (dead || handedOver) return;
      try {
        clientOf();
      } catch {
        // clientOf already emitted the validation_fallback; validate meets the same dead worker
      }
    },

    adoption() {
      if (handedOver) return undefined;
      const held = client;
      // A worker `prewarm` started and boot never used (nothing stored, so nothing to validate) is handed on idle: the sync loads it,
      // instead of this one being terminated and the sync starting a second thread.
      const idle = held !== undefined && !dead && loaded === undefined && !asked;
      if (held === undefined || dead || (loaded === undefined && !idle)) {
        held?.terminate();
        return undefined;
      }
      handedOver = true;
      return {
        client: held,
        revision: loaded ?? null,
        attach(next) {
          hooks = next;
        },
      };
    },

    stop() {
      if (!handedOver) client?.terminate();
    },
  };
}
