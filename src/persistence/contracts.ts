/**
 * Persistence contracts — docs/PERSISTENCE.md. IndexedDB (Dexie) is the canonical store on device.
 * One IndexedDB transaction per commit (INV-20); a single writer tab via Web Locks (INV-28).
 */
import type { CanonicalState, JsonValue } from '@/core/schema';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CommandError, EditorSession } from '@/core/commands/contracts';
import type { MigratableDocument, MigrationError, MigrationStepReport } from '@/core/migrations/contracts';

export const DB_NAME = 'orn';
export const DB_VERSION = 1;
export const WRITER_LOCK_NAME = 'orn-writer';
export const BROADCAST_CHANNEL = 'orn-changes';

/** Dexie store definitions. Any change requires a DB_VERSION bump, an upgrade function and a test. */
export const DB_STORES = {
  records: 'id, kind',
  meta: 'key',
  assetBlobs: 'assetId, sha256',
  snapshots: 'id, createdAt, reason',
  editorSessions: 'id, updatedAt',
  derivedCache: 'key, cacheKind, lastUsedAt',
  uiState: 'key',
  importBatches: 'id, createdAt',
  quarantine: 'id, source, createdAt',
} as const;

export type MetaKey = 'schemaVersion' | 'datasetMeta' | 'revision' | 'lastCleanShutdownAt' | 'lastIntegrityCheckAt';
export interface MetaRow {
  readonly key: MetaKey;
  readonly value: JsonValue;
}

export type SnapshotReason = 'pre_import' | 'pre_migration' | 'pre_restore' | 'periodic' | 'manual';
export interface SnapshotSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly reason: SnapshotReason;
  readonly revision: number;
  readonly schemaVersion: number;
  readonly byteSize: number;
  readonly note?: string;
}

/**
 * A snapshot read back as the TOLERANT document: an older snapshot has to be migrated before it can be parsed
 * strictly, so it is never handed out as a strict `DatasetDocument`. Damage is a value, never an exception.
 */
export type SnapshotReadResult =
  | { readonly ok: true; readonly summary: SnapshotSummary; readonly doc: MigratableDocument }
  | { readonly ok: false; readonly code: 'NOT_FOUND' | 'CORRUPT'; readonly message: string };

/** Outcome of `restoreSnapshot`. Every `ok: false` leaves the live state, the history and the stored data as they were. */
export type RestoreSnapshotResult =
  | {
      readonly ok: true;
      /** The mandatory snapshot of what was live just before the restore ("undo restore" restores it). */
      readonly preRestore: SnapshotSummary;
      /** One report per migration step applied to an older snapshot; empty when it was current. */
      readonly migrationSteps: readonly MigrationStepReport[];
      readonly revision: number;
    }
  | {
      readonly ok: false;
      readonly code: 'READ_ONLY' | 'NOT_FOUND' | 'CORRUPT' | 'MIGRATION_FAILED' | 'INVALID' | 'REJECTED' | 'SNAPSHOT_FAILED';
      readonly message: string;
      readonly migration?: MigrationError;
      /** L1 issues (bounded) for INVALID. */
      readonly issues?: readonly { readonly path: string; readonly message: string }[];
      /** The store's refusal for REJECTED (L1–L3 findings of the restored state). */
      readonly error?: CommandError;
    };

export interface QuarantineRow {
  readonly id: string;
  readonly createdAt: string;
  readonly source: 'boot_integrity' | 'import';
  readonly importBatchId?: string;
  readonly claimedKind?: string;
  /** Original value, truncated to the quarantine cap. */
  readonly raw: JsonValue;
  readonly issues: readonly string[];
}

export type DerivedCacheKind = 'depiction' | 'layout' | 'search_index' | 'structure_facts';

/** A disposable derived value (docs/PERSISTENCE.md §2, §11). Never canonical; evicted least recently used first. */
export interface DerivedCacheRow {
  readonly key: string;
  readonly cacheKind: DerivedCacheKind;
  readonly value: JsonValue;
  /** Approximate stored size in bytes, supplied by the caller; drives the soft cap. */
  readonly byteSize: number;
  /** Injected-clock milliseconds of the last put or get. */
  readonly lastUsedAt: number;
}
/** What a caller supplies; the adapter stamps `lastUsedAt`. */
export type DerivedCacheInput = Omit<DerivedCacheRow, 'lastUsedAt'>;
/** A cache write never throws and never touches SaveStatus: the cache is disposable, so a failure is a value. */
export type DerivedPutResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'quota' | 'error'; readonly message: string };

/** Bytes of an asset record created in the ChangeSet being written; they travel in the same transaction (INV-20). */
export interface AssetBlobWrite {
  readonly assetId: string;
  readonly sha256: string;
  readonly blob: Blob;
}

export type OpenResult =
  | {
      readonly mode: 'read_write' | 'read_only';
      readonly readOnlyReason?: 'other_tab_is_writer' | 'newer_schema' | 'integrity_failure';
      readonly state: CanonicalState | null;
      readonly revision: number;
      readonly storedSchemaVersion: number | null;
      readonly quarantinedCount: number;
    }
  | { readonly mode: 'unavailable'; readonly reason: 'indexeddb_blocked' | 'private_mode_quota' | 'unknown'; readonly detail: string };

export interface SaveStatus {
  readonly state: 'saved' | 'saving' | 'retrying' | 'failed' | 'read_only';
  readonly lastSavedRevision: number;
  /** ChangeSets accepted but not yet durable. Kept while `failed`: nothing is dropped, memory stays authoritative. */
  readonly pendingRevisions: number;
  readonly lastError?: string;
  /**
   * Set with `failed` after a quota error once the derived cache had nothing left to evict (PERSISTENCE.md §11,
   * stage 2): the periodic snapshots the user may delete to make room, oldest first. Mandatory and manual
   * snapshots are never listed. Absent when there are none.
   */
  readonly deletablePeriodicSnapshotIds?: readonly string[];
}

export interface PersistenceAdapter {
  open(): Promise<OpenResult>;
  /**
   * Serial queue. ChangeSets waiting together are coalesced into one transaction over records + meta
   * (+ `blobs`, the bytes of asset records created in `changes`); any failure writes nothing. Retries with
   * backoff. Resolves when the write cycle holding this ChangeSet ends, durable or `failed`: read `getStatus()`.
   */
  writeChanges(changes: ChangeSet, next: CanonicalState, blobs?: readonly AssetBlobWrite[]): Promise<void>;
  /** Replace everything (import/migration/restore) in one transaction, after a snapshot. */
  replaceAll(state: CanonicalState, revision: number): Promise<void>;
  /**
   * Builds, compresses and stores a snapshot in the write queue's order (after pending ChangeSets). Rejects only when
   * storage fails or the state cannot be serialised. A periodic snapshot also prunes older periodic ones beyond the
   * newest five, in the same transaction (mandatory reasons and manual snapshots are never pruned).
   */
  createSnapshot(reason: SnapshotReason, state: CanonicalState, revision: number, note?: string): Promise<SnapshotSummary>;
  /** Newest first. Rows hold the compressed bytes as a Blob, so listing does not load them. */
  listSnapshots(): Promise<readonly SnapshotSummary[]>;
  readSnapshot(id: string): Promise<SnapshotReadResult>;
  /** In the write queue's order. Deleting an unknown ID is not an error. */
  deleteSnapshot(id: string): Promise<void>;
  getAssetBlob(assetId: string): Promise<Blob | undefined>;
  putDerived(row: DerivedCacheInput): Promise<DerivedPutResult>;
  /** Updates `lastUsedAt`. A failing cache read is a miss (undefined), never an error. */
  getDerived(key: string): Promise<DerivedCacheRow | undefined>;
  /** Clean-shutdown and integrity-check markers (meta rows). The caller checks `getStatus()` first. */
  setLastCleanShutdownAt(at: string): Promise<void>;
  setLastIntegrityCheckAt(at: string): Promise<void>;
  saveEditorSession(session: EditorSession): Promise<void>;
  listEditorSessions(): Promise<readonly EditorSession[]>;
  deleteEditorSession(id: string): Promise<void>;
  getUiState(key: string): Promise<unknown>;
  setUiState(key: string, value: JsonValue): Promise<void>;
  storageEstimate(): Promise<{ readonly usage: number; readonly quota: number; readonly persisted: boolean }>;
  requestPersistentStorage(): Promise<boolean>;
  /** Synchronous. Pending writes (for `beforeunload`): `pendingRevisions > 0` or state saving, retrying or failed. */
  getStatus(): SaveStatus;
  subscribeStatus(listener: (status: SaveStatus) => void): () => void;
  close(): Promise<void>;
}

export interface WriterLock {
  acquire(): Promise<'acquired' | 'held_elsewhere'>;
  release(): Promise<void>;
}
