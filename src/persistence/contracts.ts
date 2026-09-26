/**
 * Persistence contracts — docs/PERSISTENCE.md. IndexedDB (Dexie) is the canonical store on device.
 * One IndexedDB transaction per commit (INV-20); a single writer tab via Web Locks (INV-28).
 */
import type { CanonicalState, DatasetDocument, JsonValue } from '@/core/schema';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { EditorSession } from '@/core/commands/contracts';

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
  readonly pendingRevisions: number;
  readonly lastError?: string;
}

export interface PersistenceAdapter {
  open(): Promise<OpenResult>;
  /** Serial queue; each call is one transaction over records + meta. Retries with backoff. */
  writeChanges(changes: ChangeSet, next: CanonicalState): Promise<void>;
  /** Replace everything (import/migration/restore) in one transaction, after a snapshot. */
  replaceAll(state: CanonicalState, revision: number): Promise<void>;
  createSnapshot(reason: SnapshotReason, state: CanonicalState, revision: number, note?: string): Promise<SnapshotSummary>;
  listSnapshots(): Promise<readonly SnapshotSummary[]>;
  readSnapshot(id: string): Promise<DatasetDocument>;
  deleteSnapshot(id: string): Promise<void>;
  putAssetBlob(assetId: string, sha256: string, blob: Blob): Promise<void>;
  getAssetBlob(assetId: string): Promise<Blob | undefined>;
  saveEditorSession(session: EditorSession): Promise<void>;
  listEditorSessions(): Promise<readonly EditorSession[]>;
  deleteEditorSession(id: string): Promise<void>;
  getUiState(key: string): Promise<unknown>;
  setUiState(key: string, value: JsonValue): Promise<void>;
  storageEstimate(): Promise<{ readonly usage: number; readonly quota: number; readonly persisted: boolean }>;
  requestPersistentStorage(): Promise<boolean>;
  subscribeStatus(listener: (status: SaveStatus) => void): () => void;
  close(): Promise<void>;
}

export interface WriterLock {
  acquire(): Promise<'acquired' | 'held_elsewhere'>;
  release(): Promise<void>;
}
