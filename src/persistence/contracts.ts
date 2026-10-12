/**
 * Persistence contracts — docs/PERSISTENCE.md. IndexedDB (Dexie) is the canonical store on device.
 * One IndexedDB transaction per commit (INV-20); a single writer tab via Web Locks (INV-28).
 */
import type { CanonicalState, JsonValue } from '@/core/schema';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CommandError, EditorSession, PrecomputedFindings } from '@/core/commands/contracts';
import type { MigratableDocument, MigrationError, MigrationStepReport } from '@/core/migrations/contracts';
import type { Finding } from '@/core/validation/contracts';

export const DB_NAME = 'orn';
export const DB_VERSION = 2;
export const WRITER_LOCK_NAME = 'orn-writer';
export const BROADCAST_CHANNEL = 'orn-changes';

/** Dexie store definitions. Any change requires a DB_VERSION bump, an upgrade function and a test. */
export const DB_STORES = {
  records: 'id, kind',
  meta: 'key',
  assetBlobs: 'sha256',
  assetBlobsUnverified: 'assetId',
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

/** Snapshot bytes built elsewhere (the compute worker, step 4.2c): a compressed `full` DatasetDocument, exactly as `buildSnapshot` makes it. */
export interface SnapshotBytesInput {
  readonly bytes: Uint8Array;
  readonly reason: SnapshotReason;
  /** The revision the bytes were built at. */
  readonly revision: number;
  /** The schema version of the document inside. */
  readonly schemaVersion: number;
  readonly note?: string;
}

/** `STALE_REVISION`: the bytes are not of the adapter's current revision. `BAD_BYTES`: not a zlib stream, or empty. Nothing was written in either case. */
export type StoreSnapshotBytesResult =
  | { readonly ok: true; readonly summary: SnapshotSummary }
  | { readonly ok: false; readonly code: 'STALE_REVISION' | 'BAD_BYTES'; readonly message: string; readonly current?: number };

/**
 * A snapshot read back as the TOLERANT document: an older snapshot has to be migrated before it can be parsed
 * strictly, so it is never handed out as a strict `DatasetDocument`. Damage is a value, never an exception.
 */
export type SnapshotReadResult =
  | { readonly ok: true; readonly summary: SnapshotSummary; readonly doc: MigratableDocument }
  | { readonly ok: false; readonly code: 'NOT_FOUND' | 'CORRUPT'; readonly message: string };

/**
 * A stored snapshot's bytes exactly as stored (step 4.2d): the compressed document, not decoded. The compute worker decodes it
 * (`snapshotDecode`); the size check of `readSnapshot` has already been made. Damage is a value.
 */
export type SnapshotBytesReadResult =
  | { readonly ok: true; readonly summary: SnapshotSummary; readonly bytes: Uint8Array }
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

/** Cap on the raw value shown for a quarantined row and kept for import quarantine, in characters of its JSON text (docs/PERSISTENCE.md §7). Boot rows are never capped. */
export const QUARANTINE_RAW_MAX_CHARS = 64 * 1024;

export interface QuarantineRow {
  readonly id: string;
  readonly createdAt: string;
  readonly source: 'boot_integrity' | 'import';
  readonly importBatchId?: string;
  readonly claimedKind?: string;
  /**
   * Boot rows: the row exactly as it was stored, whole (boot MOVES the row here, so this is the only copy; it may
   * hold more than JSON, and the issues then say so). Import rows: the original value when its JSON text fits
   * `QUARANTINE_RAW_MAX_CHARS`, otherwise the first `QUARANTINE_RAW_MAX_CHARS` characters of that text as a string
   * with `rawTruncated` set (the source file still exists).
   */
  readonly raw: JsonValue;
  /** Present only when `raw` is a truncated text (import rows, never boot rows): the length of the full JSON text. */
  readonly rawTruncated?: { readonly originalChars: number };
  readonly issues: readonly string[];
}

/** An import's stored report. The report is opaque JSON here: persistence never imports io (Phase 3 note 3). */
export interface ImportBatchRow {
  readonly id: string;
  readonly createdAt: string;
  readonly report: JsonValue;
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

/**
 * Bytes of an asset record created or updated (different bytes) in the ChangeSet being written; they travel in the same
 * transaction (INV-20). `assetBlobs` is content-addressed: the write hashes the bytes first (a mismatch with `sha256`
 * refuses the write) and stores them under that hash only if no row with it exists. Nothing is ever overwritten or deleted.
 */
export interface AssetBlobWrite {
  readonly assetId: string;
  readonly sha256: string;
  readonly blob: Blob;
}

/** A version-1 blob row the DB upgrade could not verify (kept whole in `assetBlobsUnverified`, never used as the asset's bytes). */
export interface UnverifiedAssetBlob {
  readonly assetId: string;
  readonly recordedSha256: string | null;
  /** What the bytes really hash to; null when they were never hashed. */
  readonly actualSha256: string | null;
  readonly byteSize: number;
}

/** What boot found and did, for the app to show and offer (docs/PERSISTENCE.md §4). */
/** Where boot's L1-L3 pass ran (step 4.2d): `worker` (the injected validation port), `main` (this thread; `reason` says why, for a fallback), or `none` (nothing was stored). */
export interface BootValidationReport {
  readonly where: 'worker' | 'main' | 'none';
  readonly reason: string;
}

export interface BootReport {
  /** One report per migration step applied to an older database; empty when the data was current. */
  readonly migrationSteps: readonly MigrationStepReport[];
  /** L1–L3 findings for the loaded (or migrated) state, so the store need not validate it again. */
  readonly findings: readonly Finding[];
  /** The same findings stamped for the store (`createCanonicalStore({ precomputed })`, `reload`): rule set, revision, record counts. Absent when nothing was stored. */
  readonly precomputed?: PrecomputedFindings;
  /** Where the findings were computed and why (step 4.2d). */
  readonly validation: BootValidationReport;
  /** Asset records whose SHA-256 has no row in `assetBlobs` (AST-002), sorted by asset ID. */
  readonly assetIdsWithoutBlob: readonly string[];
  /** Version-1 blob rows the DB upgrade could not verify and kept aside (sorted by asset ID); empty unless an upgrade found some. */
  readonly unverifiedAssetBlobs: readonly UnverifiedAssetBlob[];
  /** The previous session did not record a clean shutdown. */
  readonly crashSuspected: boolean;
  /** Authoring drafts to offer for restore: only when a crash is suspected. */
  readonly editorSessionIds: readonly string[];
  /** Valid UI state entries; invalid ones are reset (`uiStateReset`), never a reason not to boot. */
  readonly uiState: Readonly<Record<string, JsonValue>>;
  readonly uiStateReset: readonly string[];
  /** Rows this boot moved from `records` to `quarantine` (whole, never truncated). */
  readonly newlyQuarantined: number;
  /**
   * There are no Web Locks in this browser, so nothing can stop a second tab from writing: the app shows a
   * single-tab warning (docs/PERSISTENCE.md §10). The tab runs as the writer.
   */
  readonly singleTab: boolean;
}

export type OpenResult =
  | {
      readonly mode: 'read_write' | 'read_only';
      readonly readOnlyReason?: 'other_tab_is_writer' | 'newer_schema' | 'integrity_failure' | 'migration_failed';
      /** Why boot is read-only, in words (newer schema, failed migration, damaged meta), error detail kept. */
      readonly detail?: string;
      /** null: nothing stored yet, or the stored data could not be interpreted (see `readOnlyReason`). */
      readonly state: CanonicalState | null;
      readonly revision: number;
      /** Schema version found on disk before any migration; null when there was none. */
      readonly storedSchemaVersion: number | null;
      /** Rows in the quarantine store after boot. */
      readonly quarantinedCount: number;
      readonly bootReport?: BootReport;
    }
  | { readonly mode: 'unavailable'; readonly reason: 'indexeddb_blocked' | 'private_mode_quota' | 'blob_storage_refused' | 'unknown'; readonly detail: string };

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
  /**
   * Why the state is `failed`, when it is not just a failing write. `revision_gap`: a ChangeSet arrived that does not
   * follow the previous revision and was refused; `replaceAll` of the in-memory state resyncs the queue.
   */
  readonly failureReason?: 'revision_gap';
}

export interface PersistenceAdapter {
  open(): Promise<OpenResult>;
  /**
   * Serial queue. ChangeSets waiting together are coalesced into one transaction over records + meta
   * (+ `blobs`, the bytes of asset records created or updated in `changes`); any failure writes nothing. Retries with
   * backoff. Resolves when the write cycle holding this ChangeSet ends, durable or `failed`: read `getStatus()`.
   */
  writeChanges(changes: ChangeSet, next: CanonicalState, blobs?: readonly AssetBlobWrite[]): Promise<void>;
  /**
   * Replace everything in ONE transaction, in the write queue's order (after the ChangeSets pending when it was
   * called): boot-time migration, and the user-visible "save everything now" that recovers from a `revision_gap`.
   * On success the queue continues from `revision`, pending ChangeSets are superseded, and the status is `saved`.
   * Rejects on storage failure (nothing written) and refuses (RangeError) a state older than a pending ChangeSet.
   */
  replaceAll(state: CanonicalState, revision: number): Promise<void>;
  /**
   * Builds, compresses and stores a snapshot in the write queue's order (after pending ChangeSets). Rejects only when
   * storage fails or the state cannot be serialised. A periodic snapshot also prunes older periodic ones beyond the
   * newest five, in the same transaction (mandatory reasons and manual snapshots are never pruned).
   */
  createSnapshot(reason: SnapshotReason, state: CanonicalState, revision: number, note?: string): Promise<SnapshotSummary>;
  /**
   * The bytes entry point (step 4.2c, Phase 4 contract decision Q1): stores snapshot bytes built in the compute worker AS
   * THEY ARE (no decode, no re-encode), in the write queue's order like `createSnapshot`. Refused as a value, with nothing
   * written, when `input.revision` is not the adapter's current revision (the newest revision the write queue has been
   * given, or the one boot loaded): a snapshot must never claim a revision the database has not reached, nor a stale one.
   * Rejects only when storage fails.
   */
  storeSnapshotBytes(input: SnapshotBytesInput): Promise<StoreSnapshotBytesResult>;
  /** Newest first. Rows hold the compressed bytes as a Blob, so listing does not load them. */
  listSnapshots(): Promise<readonly SnapshotSummary[]>;
  readSnapshot(id: string): Promise<SnapshotReadResult>;
  /** The stored bytes of a snapshot, not decoded (step 4.2d: the compute worker decodes, migrates and validates them). `NOT_FOUND` / `CORRUPT` as `readSnapshot`. */
  readSnapshotBytes(id: string): Promise<SnapshotBytesReadResult>;
  /** In the write queue's order. Deleting an unknown ID is not an error. */
  deleteSnapshot(id: string): Promise<void>;
  /** The bytes of the asset record's own SHA-256 (looked up through the record); undefined when there is no such record or no such bytes. */
  getAssetBlob(assetId: string): Promise<Blob | undefined>;
  putDerived(row: DerivedCacheInput): Promise<DerivedPutResult>;
  /** Updates `lastUsedAt`. A failing cache read is a miss (undefined), never an error. */
  getDerived(key: string): Promise<DerivedCacheRow | undefined>;
  /**
   * Clean-shutdown and integrity-check markers (meta rows), written in the write queue's order. `null` marks a
   * session as running: boot writes it after reading the previous marker, so a marker still `null` at the next
   * boot means the previous session never shut down cleanly. The caller checks `getStatus()` before writing a time.
   */
  setLastCleanShutdownAt(at: string | null): Promise<void>;
  setLastIntegrityCheckAt(at: string): Promise<void>;
  /** Rows that failed validation at boot or import, kept with their issues. Ordered write; rows whose ID is already there are kept as they are. Returns the IDs that were new. */
  addQuarantine(rows: readonly QuarantineRow[]): Promise<readonly string[]>;
  listQuarantine(): Promise<readonly QuarantineRow[]>;
  deleteQuarantine(ids: readonly string[]): Promise<void>;
  saveImportBatch(row: ImportBatchRow): Promise<void>;
  /** Newest first. */
  listImportBatches(): Promise<readonly ImportBatchRow[]>;
  /** SHA-256 of every stored asset blob (the store's keys), for the boot integrity check (AST-002). */
  listAssetBlobHashes(): Promise<readonly string[]>;
  /** Version-1 rows the DB upgrade could not verify, sorted by asset ID. */
  listUnverifiedAssetBlobs(): Promise<readonly UnverifiedAssetBlob[]>;
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

/**
 * The writer lock (INV-28, PERSISTENCE.md §10), behind a port: the real one wraps Web Locks and is handed its
 * `LockManager` from outside `src/persistence` (`createWebLocksWriterLock`); tests use in-memory fakes.
 */
export interface WriterLock {
  /**
   * One non-blocking attempt. `'held_elsewhere'`: another tab is the writer (this tab is a follower and may wait with
   * `whenAcquired`). `'unsupported'`: there are no Web Locks here, so nothing can stop a second writer: the tab
   * runs as the writer and reports `bootReport.singleTab` (a single-tab warning), never silently.
   */
  acquire(): Promise<'acquired' | 'held_elsewhere' | 'unsupported'>;
  /**
   * Promotion: after `acquire()` answered `'held_elsewhere'`, resolves once this tab has been granted the lock (the
   * writer closed). Never resolves before that, and is abandoned (never resolves) by `release()`.
   */
  whenAcquired(): Promise<void>;
  /** Gives the lock up, or abandons a pending wait. */
  release(): Promise<void>;
}

/**
 * What the writer tells the other tabs after each persisted transaction (PERSISTENCE.md §10, ADR-033).
 * `fromRevision` is the revision the database was at before the transaction and `revision` the one it ended on, so a
 * transaction that coalesced several ChangeSets names the whole span. `changedIds` are the record IDs it created,
 * updated or deleted; `'all'` means "too much to list, or a wholesale replacement (`replaceAll`)": reload fully.
 */
export interface ChangeMessage {
  readonly fromRevision: number;
  readonly revision: number;
  readonly changedIds: readonly string[] | 'all';
}

/** The change channel (BroadcastChannel `orn-changes`) behind a port; a channel never delivers a message to its own sender. */
export interface ChangeChannel {
  post(message: ChangeMessage): void;
  /** Messages from other tabs, as posted (unvalidated: `parseChangeMessage` decides). Returns the unsubscribe function. */
  subscribe(listener: (message: unknown) => void): () => void;
  close(): void;
}
