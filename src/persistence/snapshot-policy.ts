/**
 * When to take a periodic snapshot (docs/PERSISTENCE.md §9): after 30 minutes of activity or 200 revisions,
 * whichever comes first. "Activity" starts with the first ChangeSet after the previous snapshot, so a long idle gap
 * followed by one edit does not fire at once. Pure state machine over an injected clock.
 */
import type { CanonicalStore } from '@/core/commands/contracts';
import type { PersistenceAdapter } from './contracts';
import { describeError, type PersistenceEventSink } from './events';

export const PERIODIC_ACTIVITY_MS = 30 * 60 * 1000;
export const PERIODIC_REVISIONS = 200;

export interface PeriodicPolicy {
  /** Call once per committed ChangeSet. True when a periodic snapshot is due now. */
  noteChange(): boolean;
  /** Call after a periodic snapshot was stored: the window and the count start over. */
  markSnapshotTaken(): void;
}

export interface PeriodicPolicyOptions {
  readonly clock: { nowMs(): number };
  readonly activityMs?: number;
  readonly revisions?: number;
}

export function createPeriodicPolicy(options: PeriodicPolicyOptions): PeriodicPolicy {
  const activityMs = options.activityMs ?? PERIODIC_ACTIVITY_MS;
  const revisions = options.revisions ?? PERIODIC_REVISIONS;
  let windowStartMs: number | undefined;
  let changes = 0;
  return {
    noteChange() {
      const now = options.clock.nowMs();
      windowStartMs ??= now;
      changes += 1;
      return changes >= revisions || now - windowStartMs >= activityMs;
    },
    markSnapshotTaken() {
      windowStartMs = undefined;
      changes = 0;
    },
  };
}

export interface PeriodicSnapshots {
  stop(): void;
  /** Resolves when no snapshot is being written. */
  whenIdle(): Promise<void>;
}

/**
 * Takes a periodic snapshot of the live state whenever the policy says one is due. One at a time; a failed
 * snapshot is reported and tried again at the next ChangeSet (the policy stays due). Stops with `stop()`.
 */
export function startPeriodicSnapshots(options: {
  readonly store: Pick<CanonicalStore, 'subscribe' | 'getState' | 'getRevision' | 'isReadOnly'>;
  readonly snapshots: Pick<PersistenceAdapter, 'createSnapshot'>;
  readonly policy: PeriodicPolicy;
  readonly onEvent?: PersistenceEventSink;
}): PeriodicSnapshots {
  let running: Promise<void> | undefined;
  const unsubscribe = options.store.subscribe(() => {
    if (options.store.isReadOnly() || !options.policy.noteChange() || running !== undefined) return;
    const state = options.store.getState();
    const revision = options.store.getRevision();
    running = options.snapshots
      .createSnapshot('periodic', state, revision)
      .then(() => options.policy.markSnapshotTaken())
      .catch((error: unknown) => options.onEvent?.({ type: 'periodic_snapshot_failed', message: describeError(error) }))
      .finally(() => {
        running = undefined;
      });
  });
  return { stop: unsubscribe, whenIdle: async () => void (await running) };
}
