/**
 * The serial write queue and SaveStatus (docs/PERSISTENCE.md §3, §11). Storage-agnostic: it is handed a
 * `persist(batch)` that performs ONE transaction and rejects on any failure.
 *
 * - One writer at a time. ChangeSets that arrive while a write is running coalesce into the next batch.
 * - A failed write is retried after 250 ms, 1 s, 4 s, then the state is `failed`. The batch is KEPT: the next
 *   ChangeSet or `flush()` starts a fresh cycle over everything pending, so the database only ever moves from
 *   one committed revision to a later one and never skips a ChangeSet (INV-20). Memory is never touched.
 * - A quota error is not retried on a timer: `onQuota` frees space (derivedCache, LRU) and the write is
 *   retried at once, until nothing is left to free; then `failed`, with the periodic snapshots the user may delete
 *   reported in the status (stage 2, PERSISTENCE.md §11).
 * - Other IndexedDB writes (markers, snapshots) run as ordered tasks: after the ChangeSets pending when they were
 *   requested, one at a time. A task never restarts a failed batch: only a new ChangeSet or `flush()` does.
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState } from '@/core/schema';
import { mergeBatches, startBatch, type PendingBatch } from './coalesce';
import type { AssetBlobWrite, SaveStatus } from './contracts';
import { describeError, isQuotaError, type PersistenceEventSink, type Scheduler } from './events';

export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [250, 1000, 4000];
/** Each round frees at least one cache row, so this only guards against a cache refilled as fast as it is emptied. */
const MAX_QUOTA_ROUNDS = 64;

export interface WriteQueueOptions {
  /** One transaction over the batch. Rejects, writing nothing, on any failure. */
  readonly persist: (batch: PendingBatch) => Promise<void>;
  /** Frees space after a quota error; true if it freed something and a retry is worthwhile. */
  readonly onQuota: () => Promise<boolean>;
  /** Periodic snapshots the user may delete to make room, oldest first (quota stage 2); reported in the status. */
  readonly deletableSnapshotIds?: () => Promise<readonly string[]>;
  readonly scheduler: Scheduler;
  readonly onEvent?: PersistenceEventSink;
  readonly retryDelaysMs?: readonly number[];
  /** Revision already durable when the queue starts (boot). Unknown: the first ChangeSet establishes it. */
  readonly initialRevision?: number;
  /** A read-only tab has no writer (INV-28): status `read_only`, and enqueueing is refused. Switchable: `setReadOnly`. */
  readonly readOnly?: boolean;
}

export interface WriteQueue {
  /** Accepts one ChangeSet; resolves when the write cycle holding it ends (durable or `failed`). */
  enqueue(changes: ChangeSet, next: CanonicalState, blobs?: readonly AssetBlobWrite[]): Promise<void>;
  /** Attempts everything pending now (a fresh retry cycle if `failed`) and resolves when the cycle ends. */
  flush(): Promise<void>;
  getStatus(): SaveStatus;
  subscribe(listener: (status: SaveStatus) => void): () => void;
  /**
   * Runs `task` (any other IndexedDB write: a marker, a snapshot) in the queue's order: after every ChangeSet
   * pending when it was called, never in parallel with a write cycle. It runs whether those writes ended durable
   * or `failed` (a task never stalls behind a failed batch, and never changes SaveStatus). Refused when the tab is
   * read-only or the queue is closed. The promise carries the task's own outcome. It does not restart a failed
   * batch (deleting a snapshot to make room must not trigger a doomed retry); `flush()` does.
   */
  runOrdered<T>(task: () => Promise<T>): Promise<T>;
  /** Boot decides read-only after the queue exists; promotion (step 3.4) makes a follower writable. */
  setReadOnly(readOnly: boolean): void;
  /** Revision of the newest ChangeSet waiting to be written, if any. */
  pendingRevision(): number | undefined;
  /** The newest revision the queue has been given (or started from); undefined when it does not know one yet. */
  currentRevision(): number | undefined;
  /**
   * Continues from `revision` after a full re-save of the state at that revision (`replaceAll`). Only call it from
   * inside an ordered task, after the write succeeded: it supersedes pending ChangeSets up to `revision` (newer ones
   * that arrived meanwhile are kept), clears a `revision_gap`, and reports `saved`.
   */
  resync(revision: number): void;
  /** Cancels a waiting retry, makes one last attempt without backoff, and refuses further ChangeSets. */
  close(): Promise<void>;
}

export function createWriteQueue(options: WriteQueueOptions): WriteQueue {
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const listeners = new Set<(status: SaveStatus) => void>();
  let pending: PendingBatch | undefined;
  let inFlight: PendingBatch | undefined;
  let draining: Promise<void> | undefined;
  /** Each runs its task and returns the function that settles the caller's promise (after the status refresh). */
  const tasks: (() => Promise<() => void>)[] = [];
  let cancelWait: (() => void) | undefined;
  let closing = false;
  let lastEnqueued = options.initialRevision;
  let desynced = false;
  let readOnly = options.readOnly === true;
  /** False after a failed cycle until a new ChangeSet or `flush()` asks for a fresh one. */
  let retryAllowed = true;
  let status: SaveStatus = {
    state: readOnly ? 'read_only' : 'saved',
    lastSavedRevision: options.initialRevision ?? 0,
    pendingRevisions: 0,
  };

  const pendingCount = (): number => (inFlight?.count ?? 0) + (pending?.count ?? 0);

  function setStatus(
    state: SaveStatus['state'],
    lastError?: string,
    lastSavedRevision = status.lastSavedRevision,
    deletable: readonly string[] = [],
    failureReason?: SaveStatus['failureReason'],
  ): void {
    status = {
      state,
      lastSavedRevision,
      pendingRevisions: pendingCount(),
      ...(lastError !== undefined ? { lastError } : {}),
      ...(deletable.length > 0 ? { deletablePeriodicSnapshotIds: deletable } : {}),
      ...(failureReason !== undefined ? { failureReason } : {}),
    };
    for (const listener of [...listeners]) {
      try {
        listener(status);
      } catch (error) {
        options.onEvent?.({ type: 'status_listener_error', message: describeError(error) });
      }
    }
  }

  const take = (): PendingBatch => {
    const batch = pending as PendingBatch;
    pending = undefined;
    inFlight = batch;
    return batch;
  };

  const absorbPending = (batch: PendingBatch): PendingBatch => {
    if (pending === undefined) return batch;
    const merged = mergeBatches(batch, pending);
    pending = undefined;
    inFlight = merged;
    return merged;
  };

  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const cancel = options.scheduler.after(ms, () => {
        cancelWait = undefined;
        resolve();
      });
      cancelWait = () => {
        cancel();
        cancelWait = undefined;
        resolve();
      };
    });

  const deletableNow = (): Promise<readonly string[]> =>
    (options.deletableSnapshotIds?.() ?? Promise.resolve([])).catch(() => []);

  /** Writes what is pending; true when durable, false when the cycle ended `failed` (batch kept in `pending`). */
  async function writeCycle(): Promise<boolean> {
    let batch = take();
    let quotaRounds = 0;
    for (let attempt = 0; ; ) {
      try {
        await options.persist(batch);
        inFlight = undefined;
        setStatus(pending === undefined ? 'saved' : 'saving', undefined, batch.revision);
        return true;
      } catch (error) {
        const message = describeError(error);
        let retry = false;
        const quota = isQuotaError(error);
        if (quota) {
          quotaRounds += 1;
          retry = quotaRounds <= MAX_QUOTA_ROUNDS && (await options.onQuota().catch(() => false));
        } else {
          const delay = closing ? undefined : retryDelays[attempt];
          attempt += 1;
          if (delay !== undefined) {
            setStatus('retrying', message);
            await wait(delay);
            retry = true;
          }
        }
        if (!retry) {
          pending = pending === undefined ? batch : mergeBatches(batch, pending);
          inFlight = undefined;
          setStatus('failed', message, undefined, quota ? await deletableNow() : []);
          return false;
        }
        batch = absorbPending(batch);
      }
    }
  }

  async function drain(): Promise<void> {
    // One microtask of grace: ChangeSets committed in the same tick (a command loop) share one transaction, and
    // `draining` is always assigned before this function can finish.
    await Promise.resolve();
    try {
      for (;;) {
        if (retryAllowed && pending !== undefined) {
          retryAllowed = await writeCycle();
          continue;
        }
        const task = tasks.shift();
        if (task === undefined) return;
        const settle = await task();
        // A task may have freed room (deleted snapshots): keep the list the user is offered current.
        if (status.state === 'failed' && status.deletablePeriodicSnapshotIds !== undefined) {
          setStatus('failed', status.lastError, undefined, await deletableNow());
        }
        settle();
      }
    } finally {
      draining = undefined;
    }
  }

  const startDrain = (): Promise<void> => {
    if (draining === undefined && (pending !== undefined || tasks.length > 0)) draining = drain();
    return draining ?? Promise.resolve();
  };

  const flush = (): Promise<void> => {
    retryAllowed = true;
    return startDrain();
  };

  return {
    enqueue(changes, next, blobs) {
      if (readOnly) throw new Error('persistence is read-only: this tab is not the writer');
      if (closing) throw new Error('persistence is closed');
      if (desynced || (lastEnqueued !== undefined && changes.revision !== lastEnqueued + 1)) {
        // A ChangeSet the queue never saw would leave the database missing that record change for good.
        desynced = true;
        setStatus(
          'failed',
          `ChangeSet revision ${changes.revision} does not follow ${lastEnqueued ?? 'the persisted revision'}; save everything now (replaceAll) to resync`,
          undefined,
          [],
          'revision_gap',
        );
        throw new RangeError(status.lastError);
      }
      const batch = startBatch(changes, next, blobs);
      pending = pending === undefined ? batch : mergeBatches(pending, batch);
      lastEnqueued = changes.revision;
      setStatus(status.state === 'retrying' ? 'retrying' : 'saving', status.lastError);
      return flush();
    },
    flush,
    runOrdered<T>(task: () => Promise<T>): Promise<T> {
      if (readOnly) return Promise.reject(new Error('persistence is read-only: this tab is not the writer'));
      if (closing) return Promise.reject(new Error('persistence is closed'));
      return new Promise<T>((resolve, reject) => {
        tasks.push(() =>
          Promise.resolve()
            .then(task)
            .then(
              (value) => () => resolve(value),
              (error: unknown) => () => reject(error),
            ),
        );
        void startDrain();
      });
    },
    setReadOnly(next) {
      readOnly = next;
      if (next) setStatus('read_only');
      else if (status.state === 'read_only') setStatus(pendingCount() > 0 ? 'saving' : 'saved');
    },
    pendingRevision: () => pending?.revision,
    currentRevision: () => lastEnqueued,
    resync(revision) {
      if (pending !== undefined && pending.revision <= revision) pending = undefined;
      if (pending === undefined) lastEnqueued = revision;
      desynced = false;
      retryAllowed = true;
      setStatus(pending === undefined ? 'saved' : 'saving', undefined, revision);
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      closing = true;
      cancelWait?.();
      await flush();
    },
  };
}
