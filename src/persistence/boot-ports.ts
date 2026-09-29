/**
 * What boot needs from the adapter, as one injected object: keeps `boot.ts` testable and the adapter the only
 * place that touches Dexie tables and the write queue.
 */
import type { IdFactory } from '@/core/dataset/contracts';
import type { MigratableDocument, MigrationRunner } from '@/core/migrations/contracts';
import type { CanonicalState, JsonValue } from '@/core/schema';
import type { RejectedRow } from './boot-load';
import type { MetaKey, SnapshotSummary, UnverifiedAssetBlob, WriterLock } from './contracts';
import type { OrnDb, UiStateRow } from './db';
import type { PersistenceEventSink } from './events';

/** Raw rows exactly as stored, read in ONE transaction so records and meta belong to one revision. Not validated. */
export interface CommittedData {
  readonly rows: readonly unknown[];
  readonly meta: Readonly<Partial<Record<MetaKey, JsonValue>>>;
}

export type UiStateValidators = Readonly<Record<string, (value: unknown) => boolean>>;

export interface BootPorts {
  readonly db: OrnDb;
  readonly lock: WriterLock;
  readonly runner: MigrationRunner;
  readonly ids: IdFactory;
  readonly generator: { readonly app: string; readonly version: string };
  readonly uiStateValidators?: UiStateValidators;
  readonly onEvent?: PersistenceEventSink;
  readCommitted(): Promise<CommittedData>;
  /** Moves rows that failed L1 out of `records` into `quarantine` (full raw value), in one transaction. */
  moveToQuarantine(rejected: readonly RejectedRow[]): Promise<number>;
  countQuarantine(): Promise<number>;
  createRawSnapshot(reason: SnapshotSummary['reason'], doc: MigratableDocument, revision: number, note?: string): Promise<SnapshotSummary>;
  /** Puts the rows back exactly as the snapshot holds them (rollback of a failed migration). */
  restoreRawSnapshot(id: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
  replaceAll(state: CanonicalState, revision: number): Promise<void>;
  setCleanShutdown(value: string | null): Promise<void>;
  setIntegrityCheck(at: string): Promise<void>;
  /** Tells the write queue which revision is durable, so its gap guard starts from the right place. */
  continueFrom(revision: number, meta?: object): Promise<void>;
  listEditorSessionIds(): Promise<readonly string[]>;
  listAssetBlobHashes(): Promise<readonly string[]>;
  listUnverifiedAssetBlobs(): Promise<readonly UnverifiedAssetBlob[]>;
  listUiStateRows(): Promise<readonly UiStateRow[]>;
  deleteUiState(keys: readonly string[]): Promise<void>;
  setReadOnly(readOnly: boolean): void;
}
