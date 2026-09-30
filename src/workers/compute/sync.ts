/**
 * Main-thread side of the compute replica (step 4.2b, ADR-034, docs/PERSISTENCE.md §12): keeps the worker's replica equal
 * to the canonical store by forwarding every ChangeSet the store announces (commits, undo, redo, replace, remote), in order,
 * ONE AT A TIME, and reloads instead of forwarding whenever forwarding cannot be trusted:
 *
 *  - the worker answers `REPLICA_STALE` (the ChangeSet does not follow the replica), or refuses in any other way;
 *  - more than `maxBacklog` ChangeSets, or `maxBacklogRecords` touched records, are waiting (a burst the worker cannot keep up with: dropping them and sending the
 *    store's current state once is cheaper than applying a long queue, and never loses an edit: the state contains them);
 *  - the worker crashed or timed out: the client restarts it and `onRestart` reloads the replica from the store's CURRENT
 *    state before any other call is sent.
 *
 * A queued ChangeSet whose revision is not after the loaded revision is dropped because the loaded state already contains
 * it, not because it was lost. Status (`in_sync`, `reloading`, `down`) is a value (`status()`) and a `replica_status`
 * WorkerEvent; nothing about the replica is silent. A reload that the worker refuses (not a crash) or a client that gave
 * up ends in `down`: the caller creates a new sync (Phase 5 decides how the app shows it).
 */
import type { CanonicalStore } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset';
import { createRpcClient } from '@/workers/rpc/client';
import type { ComputeWorkerApi, RpcClient, RpcClientOptions, WorkerEvent, WorkerFactory } from '@/workers/rpc/contracts';
import type { ReplicaAdoption } from './boot-port';
import { COMPUTE_SPECS } from './specs';

/**
 * How much may wait for the worker before the replica is reloaded instead: at most 100 ChangeSets AND at most 2,000 touched
 * records (created + updated + deleted; a ChangeSet counts at least 1). Measured at the design tier (docs/PROGRESS.md,
 * step 4.2b bench, two runs, mean): an ordinary edit costs the worker 1.1-2.4 ms (a round trip 1.6-3.5 ms); a hub edit that
 * touches about 1,020 records costs 450-1,040 ms (0.4-1.0 ms per touched record); a reload round trip costs 1.3-3.1 s (clone,
 * index build, `validateAll`). So 100 ordinary edits (well under a second) or 2,000 touched records (0.9-2.0 s) are still
 * cheaper than reloading, and beyond either the reload is cheaper and drops the wait. The queue only holds references to
 * ChangeSets the store keeps anyway, so the bounds are on latency, not memory.
 */
export const DEFAULT_MAX_BACKLOG = 100;
export const DEFAULT_MAX_BACKLOG_RECORDS = 2_000;

export type ReplicaSyncState = 'in_sync' | 'reloading' | 'down';

export interface ReplicaStatus {
  readonly state: ReplicaSyncState;
  /** Why the state last changed. */
  readonly reason: string;
  /** Revision the replica has confirmed; null before the first load and while a reload is under way after a restart. */
  readonly replicaRevision: number | null;
  readonly storeRevision: number;
  /** ChangeSets waiting to be forwarded. */
  readonly queued: number;
  /** Whole-state loads sent so far (the first one included). */
  readonly reloads: number;
}

export interface ReplicaSyncOptions {
  readonly factory: WorkerFactory;
  readonly store: Pick<CanonicalStore, 'getState' | 'getRevision' | 'subscribe'>;
  /** ChangeSets that may wait; default `DEFAULT_MAX_BACKLOG`. */
  readonly maxBacklog?: number;
  /** Touched records that may wait; default `DEFAULT_MAX_BACKLOG_RECORDS`. */
  readonly maxBacklogRecords?: number;
  /** Client options except the two the sync owns (`onRestart`, `onEvent`). */
  readonly client?: Omit<RpcClientOptions<ComputeWorkerApi>, 'onRestart' | 'onEvent'>;
  /** Every WorkerEvent of the client, plus `replica_status`. */
  readonly onEvent?: (event: WorkerEvent) => void;
  /**
   * Boot validated in the worker (step 4.2d, `BootReplica.adoption()`): its client already holds a replica at `revision`, so the
   * sync starts from it without a second `loadReplica`. The store must be at that revision, else the sync reloads (and says so).
   * `factory` and `client` are then not used to make a client.
   */
  readonly adopt?: ReplicaAdoption;
}

export interface ReplicaSync {
  readonly client: RpcClient<ComputeWorkerApi>;
  status(): ReplicaStatus;
  /** Resolves when the replica has caught up with every ChangeSet announced so far, or when the sync is down or stopped. */
  settled(): Promise<ReplicaStatus>;
  /**
   * An import is about to `replaceState` the store to `revision` (step 4.2c): when the sync sees that `replace` ChangeSet it
   * sends `adoptPending` (the worker adopts the state it prepared) instead of forwarding the ChangeSet, so the whole state
   * is not sent twice. A refusal makes the sync reload. Only one adoption is expected at a time.
   */
  expectAdoption(revision: number): void;
  /** The import failed before or instead of the `replace` ChangeSet: forget the expectation. */
  clearAdoption(): void;
  /**
   * The worker's replica was loaded outside the sync at `revision` (a follower's reload or a promotion validated in the worker,
   * step 4.2d) and the store is about to adopt that state with `reload`: the ChangeSet the store then announces for `revision` is
   * dropped instead of forwarded. Any other ChangeSet, a restart or a reload of the sync's own cancels the expectation.
   */
  noteLoaded(revision: number): void;
  /** Stops following the store and terminates the worker. */
  stop(): void;
}

/** What a ChangeSet costs the worker, roughly: the records it touches (at least 1). */
const weightOf = (changes: ChangeSet): number => Math.max(1, changes.created.length + changes.updated.length + changes.deleted.length);

export function createReplicaSync(options: ReplicaSyncOptions): ReplicaSync {
  const { store } = options;
  const maxBacklog = options.maxBacklog ?? DEFAULT_MAX_BACKLOG;
  const maxBacklogRecords = options.maxBacklogRecords ?? DEFAULT_MAX_BACKLOG_RECORDS;
  const queue: ChangeSet[] = [];
  let queuedRecords = 0;
  let state: ReplicaSyncState = 'reloading';
  let reason = 'starting: first load';
  let replicaRevision: number | null = null;
  let reloads = 0;
  let needsReload = true;
  let adoptAt: number | undefined;
  let loadedAhead: number | undefined;
  let running = false;
  let stopped = false;
  let hooksRunning = 0;
  let hookSeq = 0;
  let restarts = 0;
  const restartWaiters: (() => void)[] = [];
  const idleWaiters: (() => void)[] = [];

  const emit = (event: WorkerEvent): void => {
    try {
      options.onEvent?.(event);
    } catch {
      // a sink that throws must not break the sync; the client guards its own sink the same way
    }
  };
  const status = (): ReplicaStatus => ({ state, reason, replicaRevision, storeRevision: store.getRevision(), queued: queue.length, reloads });
  const setState = (next: ReplicaSyncState, why: string): void => {
    if (state === next) {
      reason = why;
      return;
    }
    state = next;
    reason = why;
    emit({ type: 'replica_status', status: next, reason: why, revision: replicaRevision });
  };
  const isDown = (): boolean => state === 'down';
  const isIdle = (): boolean => isDown() || stopped || (!running && hooksRunning === 0 && !needsReload && queue.length === 0 && replicaRevision !== null);
  const wake = (waiters: (() => void)[]): void => {
    for (const resolve of waiters.splice(0)) resolve();
  };
  const checkIdle = (): void => {
    if (isIdle()) wake(idleWaiters);
  };
  const restartDone = (since: number): Promise<void> =>
    restarts > since || isDown() || stopped ? Promise.resolve() : new Promise<void>((resolve) => restartWaiters.push(resolve));

  let unsubscribe: (() => void) | undefined;
  const clearQueue = (): void => {
    queue.length = 0;
    queuedRecords = 0;
  };
  const goDown = (why: string): void => {
    clearQueue();
    unsubscribe?.();
    unsubscribe = undefined;
    setState('down', why);
    wake(restartWaiters);
    wake(idleWaiters);
  };
  const requestReload = (why: string): void => {
    loadedAhead = undefined;
    needsReload = true;
    clearQueue();
    setState('reloading', why);
  };

  const clientOptions: RpcClientOptions<ComputeWorkerApi> & Required<Pick<RpcClientOptions<ComputeWorkerApi>, 'onEvent' | 'onRestart'>> = {
    ...options.client,
    onEvent(event) {
      emit(event);
      if (event.type === 'gave_up') goDown(`the compute worker is down for good (${event.reason} after ${event.restarts} restarts)`);
    },
    /** The worker started over with no replica: load the store's CURRENT state before any other call is sent. */
    async onRestart(raw, info) {
      if (stopped || isDown()) return;
      loadedAhead = undefined;
      const mine = (hookSeq += 1);
      hooksRunning += 1;
      replicaRevision = null;
      setState('reloading', `the worker restarted (${info.reason}); reloading the replica from the store`);
      try {
        const revision = store.getRevision();
        const loaded = await raw.loadReplica({ state: store.getState(), revision });
        if (mine !== hookSeq || stopped || isDown()) return;
        if (loaded.ok) {
          replicaRevision = revision;
          reloads += 1;
          needsReload = false;
          setState('in_sync', `replica reloaded at revision ${revision} after a restart`);
        } else {
          needsReload = true;
          throw new Error(`the replica could not be reloaded after a restart: ${loaded.error.code}: ${loaded.error.message}`);
        }
      } finally {
        hooksRunning -= 1;
        if (mine === hookSeq) restarts += 1;
        wake(restartWaiters);
        void pump();
        checkIdle();
      }
    },
  };
  const client = options.adopt?.client ?? createRpcClient<ComputeWorkerApi>({ factory: options.factory, specs: COMPUTE_SPECS, options: clientOptions });

  /** Sends the store's current state once. A crash or timeout is answered by the restart hook; anything else that fails ends the sync. */
  async function reload(): Promise<void> {
    needsReload = false;
    const revision = store.getRevision();
    const since = restarts;
    const result = await client.loadReplica({ state: store.getState(), revision });
    if (result.ok) {
      replicaRevision = revision;
      reloads += 1;
      setState('in_sync', `replica loaded at revision ${revision}`);
    } else if (result.error.code === 'WORKER_CRASHED' || result.error.code === 'TIMEOUT') {
      await restartDone(since);
    } else {
      goDown(`the worker refused the replica: ${result.error.code}: ${result.error.message}`);
    }
  }

  async function forward(changes: ChangeSet): Promise<void> {
    const since = restarts;
    const result = await client.applyChanges({ changes });
    if (result.ok) {
      const answer = result.value;
      if (answer.ok) replicaRevision = answer.revision;
      else requestReload(`REPLICA_STALE: the worker is at revision ${answer.have}, the ChangeSet is revision ${changes.revision}`);
    } else if (result.error.code === 'WORKER_CRASHED' || result.error.code === 'TIMEOUT') {
      await restartDone(since);
    } else {
      requestReload(`applyChanges failed (${result.error.code}: ${result.error.message})`);
    }
  }

  /** The store took the state the worker prepared: the worker swaps it in. Anything but a clean adoption reloads instead. */
  async function adopt(changes: ChangeSet): Promise<void> {
    adoptAt = undefined;
    const since = restarts;
    const result = await client.adoptPending({ revision: changes.revision });
    if (result.ok) {
      const answer = result.value;
      if (answer.ok) replicaRevision = answer.revision;
      else requestReload(`adoptPending refused (${answer.code}: ${answer.message}); reloading the replica`);
    } else if (result.error.code === 'WORKER_CRASHED' || result.error.code === 'TIMEOUT') {
      await restartDone(since);
    } else {
      requestReload(`adoptPending failed (${result.error.code}: ${result.error.message})`);
    }
  }

  async function pump(): Promise<void> {
    if (running || stopped || isDown()) return;
    running = true;
    try {
      while (!stopped && !isDown()) {
        if (needsReload) {
          await reload();
          continue;
        }
        const next = queue.shift();
        if (next === undefined) break;
        queuedRecords -= weightOf(next);
        // The worker loaded this state outside the sync (a follower's reload, a promotion): its ChangeSet is not forwarded.
        if (loadedAhead !== undefined) {
          const at = loadedAhead;
          if (next.revision <= at) {
            if (next.revision === at) {
              replicaRevision = at;
              loadedAhead = undefined;
            }
            continue;
          }
          loadedAhead = undefined;
        }
        // Already inside the loaded state (a reload or a restart captured the store after this commit).
        if (replicaRevision !== null && next.revision <= replicaRevision) continue;
        if (next.cause === 'replace' && adoptAt === next.revision) await adopt(next);
        else await forward(next);
      }
    } finally {
      running = false;
    }
    checkIdle();
  }

  /** See `ReplicaSync.noteLoaded`. */
  function noteLoaded(revision: number): void {
    if (stopped || isDown()) return;
    loadedAhead = revision;
    reloads += 1;
  }

  if (options.adopt !== undefined) {
    const held = options.adopt.revision;
    if (store.getRevision() === held) {
      replicaRevision = held;
      reloads = 1;
      needsReload = false;
      state = 'in_sync';
      reason = `started from the replica the boot validation loaded at revision ${held}`;
    } else {
      reason = `the boot replica is at revision ${held}, the store at ${store.getRevision()}; reloading`;
    }
    options.adopt.attach({ onRestart: clientOptions.onRestart, onEvent: clientOptions.onEvent, noteLoaded });
  }
  emit({ type: 'replica_status', status: state, reason, revision: replicaRevision });
  unsubscribe = store.subscribe((changes) => {
    if (stopped || isDown()) return;
    queue.push(changes);
    queuedRecords += weightOf(changes);
    if (queue.length > maxBacklog) requestReload(`more than ${maxBacklog} ChangeSets were waiting; reloading instead of applying them`);
    else if (queuedRecords > maxBacklogRecords) requestReload(`more than ${maxBacklogRecords} touched records were waiting; reloading instead of applying them`);
    void pump();
  });
  void pump();

  return {
    client,
    status,
    settled: () => (isIdle() ? Promise.resolve(status()) : new Promise<void>((resolve) => idleWaiters.push(resolve)).then(status)),
    expectAdoption(revision) {
      adoptAt = revision;
    },
    clearAdoption() {
      adoptAt = undefined;
    },
    noteLoaded,
    stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe?.();
      unsubscribe = undefined;
      clearQueue();
      client.terminate();
      wake(restartWaiters);
      wake(idleWaiters);
    },
  };
}
