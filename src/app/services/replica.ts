/**
 * The compute side of the app services (step 5.1a): the boot replica (boot, promotion and a follower's reload validate in the
 * compute worker through it), the replica sync that keeps the worker's replica equal to the store, and `retry()` (a new client
 * and a new sync loaded from the store's current state). The replica is loaded ONCE: the sync adopts the client the boot
 * validation already loaded (`createReplicaSync({ adopt })`). A worker that cannot start or has given up is a status, never an
 * exception: boot validates in this thread and says so.
 */
import { checkPrecomputed, type CanonicalStore, type PrecomputedFindings } from '@/core/commands';
import type { CanonicalState } from '@/core/schema';
import { createBootReplica, createReplicaSync, type BootReplica, type ReplicaSync } from '@/workers/compute';
import type { WorkerEvent, WorkerFactory } from '@/workers/rpc/contracts';
import type { RetryReplicaResult } from './contracts';
import type { EventLogWriter, StatusWriter } from './status';

export type ValidatePort = (state: CanonicalState, revision: number) => Promise<PrecomputedFindings>;

export interface ReplicaPart {
  /** `BootPorts.validate` and `FollowerOptions.validate`: the boot replica until a retry, then the current sync's client. */
  readonly validate: ValidatePort;
  /** Creates the sync over the store (adopting the boot replica's client when it holds one). Never throws. */
  start(store: Pick<CanonicalStore, 'getState' | 'getRevision' | 'subscribe'>): void;
  sync(): ReplicaSync | undefined;
  retry(): Promise<RetryReplicaResult>;
  /** Stops the sync and terminates every client this part made. */
  stop(): void;
}

export interface ReplicaPartOptions {
  readonly factory: WorkerFactory;
  readonly status: StatusWriter;
  readonly log: EventLogWriter;
}

const describe = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

export function createReplicaPart(options: ReplicaPartOptions): ReplicaPart {
  const { factory, status, log } = options;
  let sync: ReplicaSync | undefined;
  let store: Pick<CanonicalStore, 'getState' | 'getRevision' | 'subscribe'> | undefined;
  /** True once the sync owns the boot replica's client: that client's events then also arrive through the sync. */
  let adopted = false;
  let retried = false;
  let stopped = false;

  const handle = (event: WorkerEvent): void => {
    log.add({ source: 'worker', event });
    if (event.type === 'replica_status') status.update({ replica: { state: event.status, reason: event.reason, revision: event.revision } });
    else if (event.type === 'validation_fallback') status.update({ validation: { where: 'main', reason: event.reason } });
  };
  const bootReplica: BootReplica = createBootReplica({
    factory,
    // After adoption the sync forwards the client's events itself; only the boot replica's own fallback notes are new.
    onEvent: (event) => {
      if (adopted && event.type !== 'validation_fallback') return;
      handle(event);
    },
  });

  const syncValidate: ValidatePort = async (state, revision) => {
    const current = sync;
    if (current === undefined || current.status().state === 'down') throw new Error('the compute worker is down; validating in this thread');
    const answer = await current.client.loadReplica({ state, revision });
    if (!answer.ok) throw new Error(`the compute worker could not validate (${answer.error.code}: ${answer.error.message})`);
    const problem = checkPrecomputed(state, revision, answer.value);
    if (problem !== undefined) throw new Error(`the compute worker's findings were refused (${problem.message})`);
    current.noteLoaded(revision);
    return answer.value;
  };

  const create = (target: Pick<CanonicalStore, 'getState' | 'getRevision' | 'subscribe'>, useAdoption: boolean): void => {
    const adoption = useAdoption ? bootReplica.adoption() : undefined;
    adopted = adoption !== undefined;
    try {
      sync = createReplicaSync({ factory, store: target, onEvent: handle, ...(adoption === undefined ? {} : { adopt: adoption }) });
    } catch (error) {
      sync = undefined;
      const reason = `the replica sync could not be created (${describe(error)})`;
      log.add({ source: 'app', event: { type: 'replica_unavailable', message: reason } });
      status.update({ replica: { state: 'down', reason, revision: null } });
    }
  };

  return {
    validate: (state, revision) => (retried ? syncValidate(state, revision) : bootReplica.validate(state, revision)),

    start(target) {
      store = target;
      create(target, true);
    },

    sync: () => sync,

    async retry() {
      if (stopped || store === undefined) return { ok: false, message: 'the services are not running' };
      sync?.stop();
      sync = undefined;
      bootReplica.stop();
      retried = true;
      status.update({ replica: { state: 'reloading', reason: 'retrying: a new worker and a new replica', revision: null } });
      create(store, false);
      if (sync === undefined) return { ok: false, message: status.get().replica.reason };
      const settled = await (sync as ReplicaSync).settled();
      return settled.state === 'in_sync' ? { ok: true } : { ok: false, message: settled.reason };
    },

    stop() {
      stopped = true;
      sync?.stop();
      sync = undefined;
      bootReplica.stop();
    },
  };
}
