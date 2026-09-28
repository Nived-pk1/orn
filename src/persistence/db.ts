/**
 * The Dexie database for docs/PERSISTENCE.md §2. `indexedDB` and `IDBKeyRange` are injected: nothing in
 * this module reads a global, so tests run against fake-indexeddb and the app passes the browser's.
 */
import Dexie, { type DexieOptions, type Table, type Transaction } from 'dexie';
import type { AnyRecord } from '@/core/schema';
import type { EditorSession } from '@/core/commands/contracts';
import {
  DB_NAME,
  DB_STORES,
  DB_VERSION,
  type DerivedCacheRow,
  type ImportBatchRow,
  type MetaRow,
  type QuarantineRow,
  type SnapshotSummary,
} from './contracts';

export interface AssetBlobRow {
  readonly assetId: string;
  readonly sha256: string;
  readonly blob: Blob;
}

export interface UiStateRow {
  readonly key: string;
  readonly value: unknown;
}

/** A snapshot row: the summary fields plus the compressed document as a Blob, so listing rows does not load the bytes. */
export interface SnapshotRow extends SnapshotSummary {
  readonly blob: Blob;
}

/** One Dexie version. `stores` may add, change or (with `null`) drop stores; `upgrade` migrates rows. */
export interface DbVersionStep {
  readonly version: number;
  readonly stores: Readonly<Record<string, string | null>>;
  readonly upgrade?: (tx: Transaction) => void | Promise<void>;
}

/** Every released version, ascending. A DB_STORES change adds a step here (and bumps DB_VERSION). */
export const DB_VERSION_STEPS: readonly DbVersionStep[] = [{ version: DB_VERSION, stores: DB_STORES }];

export interface OrnDbOptions {
  readonly indexedDB: NonNullable<DexieOptions['indexedDB']>;
  readonly IDBKeyRange: NonNullable<DexieOptions['IDBKeyRange']>;
  readonly name?: string;
  /** Test scaffold for upgrade tests; production code uses the default. */
  readonly versions?: readonly DbVersionStep[];
}

export class OrnDb extends Dexie {
  // `declare`: with useDefineForClassFields a plain field would overwrite the table Dexie installs.
  declare records: Table<AnyRecord, string>;
  declare meta: Table<MetaRow, string>;
  declare assetBlobs: Table<AssetBlobRow, string>;
  declare derivedCache: Table<DerivedCacheRow, string>;
  declare snapshots: Table<SnapshotRow, string>;
  declare editorSessions: Table<EditorSession, string>;
  declare uiState: Table<UiStateRow, string>;
  declare importBatches: Table<ImportBatchRow, string>;
  declare quarantine: Table<QuarantineRow, string>;
}

export function createOrnDb(options: OrnDbOptions): OrnDb {
  const db = new OrnDb(options.name ?? DB_NAME, { indexedDB: options.indexedDB, IDBKeyRange: options.IDBKeyRange });
  for (const step of options.versions ?? DB_VERSION_STEPS) {
    const version = db.version(step.version).stores({ ...step.stores });
    if (step.upgrade !== undefined) version.upgrade(step.upgrade);
  }
  return db;
}
