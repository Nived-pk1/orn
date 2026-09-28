/**
 * The rows one write transaction stores for a pending batch (docs/PERSISTENCE.md §2, §3). Pure: this is the
 * part of a flush that is ORN code rather than IndexedDB, and what tests/perf/persist.bench.ts measures on its own.
 */
import { CURRENT_SCHEMA_VERSION, type AnyRecord, type JsonValue } from '@/core/schema';
import { resolveWrites, type PendingBatch } from './coalesce';
import type { MetaRow } from './contracts';
import type { AssetBlobRow } from './db';

export interface TransactionRows {
  readonly puts: readonly AnyRecord[];
  readonly deleteIds: readonly string[];
  readonly blobRows: readonly AssetBlobRow[];
  readonly metaRows: readonly MetaRow[];
}

/** `writesMeta`: the dataset meta changed since the last successful write, so it (and the schema version) is stored again. */
export function prepareTransactionRows(batch: PendingBatch, writesMeta: boolean): TransactionRows {
  const { puts, deleteIds, blobs } = resolveWrites(batch);
  const metaRows: MetaRow[] = [{ key: 'revision', value: batch.revision }];
  if (writesMeta) {
    metaRows.push({ key: 'schemaVersion', value: CURRENT_SCHEMA_VERSION }, { key: 'datasetMeta', value: batch.latest.meta as unknown as JsonValue });
  }
  return { puts, deleteIds, blobRows: blobs.map((b) => ({ assetId: b.assetId, sha256: b.sha256, blob: b.blob })), metaRows };
}
