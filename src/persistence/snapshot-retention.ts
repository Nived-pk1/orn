/**
 * Snapshot retention (docs/PERSISTENCE.md §9): mandatory reasons (before import, migration, restore) are kept, manual
 * snapshots are kept until the user deletes them, and only the newest five periodic snapshots are kept.
 */
import type { SnapshotSummary } from './contracts';

export const PERIODIC_SNAPSHOTS_KEPT = 5;

/** Oldest first; equal timestamps break on the ID, which is a ULID and so also time-ordered. */
export const oldestFirst = (a: SnapshotSummary, b: SnapshotSummary): number =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Every periodic snapshot, oldest first: what the user may be offered to delete when storage is full. */
export function periodicIdsOldestFirst(summaries: readonly SnapshotSummary[]): string[] {
  return summaries
    .filter((s) => s.reason === 'periodic')
    .sort(oldestFirst)
    .map((s) => s.id);
}

/** Periodic snapshots beyond the newest `keep`: what a new periodic snapshot prunes. */
export function expiredPeriodicIds(summaries: readonly SnapshotSummary[], keep = PERIODIC_SNAPSHOTS_KEPT): string[] {
  const all = periodicIdsOldestFirst(summaries);
  return all.slice(0, Math.max(0, all.length - keep));
}
