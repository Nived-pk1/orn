/**
 * Type-level (step 4.2d): the compute worker's restore flow cannot import persistence, so it declares its own result and port
 * types; the adapter's (`RestoreSnapshotResult`, `SnapshotSummary`) must stay assignable to them (theirs are looser only in `reason`,
 * a plain string) and the adapter must satisfy the flow's snapshot port. A drift is a compile error here.
 */
import { expect, it } from 'vitest';
import type { PersistenceAdapter, RestoreSnapshotResult, SnapshotSummary } from '@/persistence/contracts';
import type { ComputeRestoreResult, RestoreSnapshotsPort, SnapshotSummaryLike } from '@/workers/compute/restore-flow';

const toFlow = (result: RestoreSnapshotResult): ComputeRestoreResult => result;
const summary = (value: SnapshotSummary): SnapshotSummaryLike => value;
const port = (adapter: Pick<PersistenceAdapter, 'readSnapshotBytes' | 'storeSnapshotBytes' | 'deleteSnapshot'>): RestoreSnapshotsPort => adapter;

it('type: the flow\'s restore result and summary are the adapter\'s, and the adapter satisfies the flow\'s snapshot port', () => {
  expect([toFlow, summary, port]).toHaveLength(3);
});
