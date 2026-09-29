/**
 * The Dexie database for docs/PERSISTENCE.md §2. `indexedDB` and `IDBKeyRange` are injected: nothing in
 * this module reads a global, so tests run against fake-indexeddb and the app passes the browser's.
 */
import Dexie, { type DexieOptions, type PromiseExtended, type Table, type Transaction } from 'dexie';
import type { AnyRecord } from '@/core/schema';
import type { EditorSession } from '@/core/commands/contracts';
import { finishRekeyStep, rekeyStep, verifyStoredAssetBlobs } from './asset-rekey';
import type { AssetBlobRow, AssetVerdict, UnverifiedAssetBlobRow } from './asset-rows';
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

export type { AssetBlobRow, UnverifiedAssetBlobRow } from './asset-rows';

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

/** The stores as version 1 released them (frozen: the upgrade tests build a version-1 database from it). */
export const DB_STORES_V1 = {
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

/**
 * Every released version, ascending. A DB_STORES change adds a step here (and bumps DB_VERSION). Dexie cannot change
 * a primary key in place, so version 2 (`assetBlobs` keyed by SHA-256) goes through a holding store in two Dexie
 * steps (1.5, then 2): docs/PERSISTENCE.md §5, `asset-rekey.ts`. Both run inside ONE versionchange transaction.
 */
export const DB_VERSION_STEPS: readonly DbVersionStep[] = [
  { version: 1, stores: DB_STORES_V1 },
  { version: 1.5, stores: { assetBlobsRekey: 'sha256', assetBlobsUnverified: 'assetId', assetBlobs: null }, upgrade: rekeyStep },
  { version: DB_VERSION, stores: { ...DB_STORES, assetBlobsRekey: null }, upgrade: finishRekeyStep },
];

export interface OrnDbOptions {
  readonly indexedDB: NonNullable<DexieOptions['indexedDB']>;
  readonly IDBKeyRange: NonNullable<DexieOptions['IDBKeyRange']>;
  readonly name?: string;
  /** Test scaffold for upgrade tests; production code uses the default. */
  readonly versions?: readonly DbVersionStep[];
}

export class OrnDb extends Dexie {
  /** Hashes of the version-1 `assetBlobs` rows, taken before the upgrade (see `asset-rekey.ts`); cleared by it. */
  assetVerdicts: ReadonlyMap<string, AssetVerdict> | undefined;
  private preflight: Promise<void> | undefined;
  private readonly preflightOptions: Pick<OrnDbOptions, 'indexedDB' | 'IDBKeyRange'> & { readonly name: string };
  // `declare`: with useDefineForClassFields a plain field would overwrite the table Dexie installs.
  declare records: Table<AnyRecord, string>;
  declare meta: Table<MetaRow, string>;
  declare assetBlobs: Table<AssetBlobRow, string>;
  declare assetBlobsUnverified: Table<UnverifiedAssetBlobRow, string>;
  declare derivedCache: Table<DerivedCacheRow, string>;
  declare snapshots: Table<SnapshotRow, string>;
  declare editorSessions: Table<EditorSession, string>;
  declare uiState: Table<UiStateRow, string>;
  declare importBatches: Table<ImportBatchRow, string>;
  declare quarantine: Table<QuarantineRow, string>;

  constructor(name: string, options: Pick<OrnDbOptions, 'indexedDB' | 'IDBKeyRange'>) {
    super(name, { indexedDB: options.indexedDB, IDBKeyRange: options.IDBKeyRange });
    this.preflightOptions = { name, indexedDB: options.indexedDB, IDBKeyRange: options.IDBKeyRange };
  }

  /** Every way in (boot, auto-open on first use) hashes an old database's asset rows first: hashing cannot happen inside the upgrade. */
  override open(): PromiseExtended<Dexie> {
    this.preflight ??= verifyStoredAssetBlobs(this.preflightOptions).then((verdicts) => {
      this.assetVerdicts = verdicts;
    });
    return Dexie.Promise.resolve(this.preflight).then(() => super.open());
  }
}

export function createOrnDb(options: OrnDbOptions): OrnDb {
  const db = new OrnDb(options.name ?? DB_NAME, options);
  for (const step of options.versions ?? DB_VERSION_STEPS) {
    const version = db.version(step.version).stores({ ...step.stores });
    if (step.upgrade !== undefined) version.upgrade(step.upgrade);
  }
  return db;
}
