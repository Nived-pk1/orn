/**
 * When to take a periodic snapshot (docs/PERSISTENCE.md §9): after 30 minutes of activity or 200 revisions,
 * whichever comes first. "Activity" starts with the first ChangeSet after the previous snapshot, so a long idle gap
 * followed by one edit does not fire at once. Pure state machine over an injected clock.
 */
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
