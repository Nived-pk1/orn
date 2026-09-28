/**
 * Coalescing of queued ChangeSets (docs/PERSISTENCE.md §3). A batch remembers only WHICH records were touched
 * and the newest state: the latest value wins, so a delete followed by a create is a put, a create followed by
 * a delete is a delete, and the one transaction moves the store from one committed revision straight to the
 * newest (INV-20). Memory stays authoritative; a batch never holds a value memory no longer has.
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import type { AnyRecord, CanonicalState, RecordKind } from '@/core/schema';
import type { AssetBlobWrite } from './contracts';

export interface PendingBatch {
  /** id → kind of every record any queued ChangeSet created, updated or deleted, in first-touch order. */
  readonly touched: Map<string, RecordKind>;
  /** Blobs by asset ID (same asset, same bytes: the hash is the identity). Kept even if the record is deleted (undo). */
  readonly blobs: Map<string, AssetBlobWrite>;
  latest: CanonicalState;
  /** Revision of `latest`. */
  revision: number;
  /** ChangeSets folded into this batch. */
  count: number;
}

export interface BatchWrites {
  readonly puts: readonly AnyRecord[];
  readonly deleteIds: readonly string[];
  readonly blobs: readonly AssetBlobWrite[];
}

/** Blobs are only accepted for asset records the ChangeSet created, with the record's own hash. */
function checkBlobs(changes: ChangeSet, next: CanonicalState, blobs: readonly AssetBlobWrite[]): void {
  for (const blob of blobs) {
    if (!changes.created.some((ref) => ref.kind === 'asset' && ref.id === blob.assetId)) {
      throw new RangeError(`blob for ${blob.assetId}: no asset record with that ID was created in revision ${changes.revision}`);
    }
    const record = next.records.asset[blob.assetId];
    if (record === undefined || record.sha256 !== blob.sha256) {
      throw new RangeError(`blob for ${blob.assetId}: sha256 does not match the asset record`);
    }
  }
}

export function startBatch(changes: ChangeSet, next: CanonicalState, blobs: readonly AssetBlobWrite[] = []): PendingBatch {
  checkBlobs(changes, next, blobs);
  const batch: PendingBatch = { touched: new Map(), blobs: new Map(), latest: next, revision: changes.revision, count: 1 };
  for (const list of [changes.created, changes.updated, changes.deleted]) {
    for (const ref of list) batch.touched.set(ref.id, ref.kind);
  }
  for (const blob of blobs) batch.blobs.set(blob.assetId, blob);
  return batch;
}

/** Folds `newer` into `older` (which is mutated and returned); `newer` must not be used afterwards. */
export function mergeBatches(older: PendingBatch, newer: PendingBatch): PendingBatch {
  for (const [id, kind] of newer.touched) older.touched.set(id, kind);
  for (const [id, blob] of newer.blobs) older.blobs.set(id, blob);
  older.latest = newer.latest;
  older.revision = newer.revision;
  older.count += newer.count;
  return older;
}

/** What one transaction has to write: each touched record's newest value, or its deletion. */
export function resolveWrites(batch: PendingBatch): BatchWrites {
  const puts: AnyRecord[] = [];
  const deleteIds: string[] = [];
  for (const [id, kind] of batch.touched) {
    const table = batch.latest.records[kind] as Readonly<Record<string, AnyRecord>>;
    const record = table[id];
    if (record === undefined) deleteIds.push(id);
    else puts.push(record);
  }
  return { puts, deleteIds, blobs: [...batch.blobs.values()] };
}
