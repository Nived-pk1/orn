/**
 * Ports the import flow needs from the rest of the app (Q9, docs/PROGRESS.md "Phase 3 contract decisions"). `src/io` and
 * `src/persistence` never import each other (Phase 3 note 3): what apply needs from persistence is declared HERE, in the
 * shape the persistence adapter already has, so `adapter.createSnapshot`, `adapter.deleteSnapshot`, `adapter.saveImportBatch`
 * and `adapter.addQuarantine` satisfy them structurally, and `src/app` (Phase 5) or an integration test wires them.
 */
import type { CanonicalStore } from '@/core/commands/contracts';
import type { CanonicalState, JsonValue } from '@/core/schema';
import type { ParsedAsset } from './contracts';

/** The part of the canonical store an import reads and finally replaces. */
export type ImportStorePort = Pick<CanonicalStore, 'getState' | 'getRevision' | 'isReadOnly' | 'replaceState'>;

/** `pre_import` snapshots (mandatory before an apply; restoring one is "Undo import"). */
export interface SnapshotPort {
  createSnapshot(reason: 'pre_import', state: CanonicalState, revision: number, note?: string): Promise<{ readonly id: string }>;
  /** Used only to remove the snapshot of an apply the store then refused. */
  deleteSnapshot(id: string): Promise<void>;
}

/** An import's stored report, as `ImportBatchRow` in persistence (the report is opaque JSON there). */
export interface ImportBatchRowLike {
  readonly id: string;
  readonly createdAt: string;
  readonly report: JsonValue;
}

/** A quarantined import item, as `QuarantineRow` in persistence. */
export interface ImportQuarantineRowLike {
  readonly id: string;
  readonly createdAt: string;
  readonly source: 'import';
  readonly importBatchId: string;
  readonly claimedKind?: string;
  readonly raw: JsonValue;
  readonly rawTruncated?: { readonly originalChars: number };
  readonly issues: readonly string[];
}

/** Where the batch report and the import's quarantine rows go (`importBatches`, `quarantine`). */
export interface ImportBatchSink {
  saveImportBatch(row: ImportBatchRowLike): Promise<void>;
  addQuarantine(rows: readonly ImportQuarantineRowLike[]): Promise<readonly string[]>;
}

/**
 * Hands the verified asset bytes to whatever writes the store's `replace` ChangeSet, BEFORE `replaceState` runs, so the bytes
 * reach IndexedDB in the SAME transaction as their records (Q1, `writeChanges(changes, next, blobs?)`). `replaceState` notifies
 * the write queue synchronously, so the wiring's `blobsFor` (persistence `WriteWiringOptions`) reads what was staged. `clear`
 * runs afterwards, whatever the outcome. `src/app` connects the two (Phase 5); io never sees a Blob or a write queue.
 */
export interface AssetStagePort {
  stage(assets: readonly ParsedAsset[]): void;
  clear(): void;
}
