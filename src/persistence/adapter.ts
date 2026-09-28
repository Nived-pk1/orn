/**
 * The Dexie implementation of the write side of PersistenceAdapter (steps 3.1, 3.2): the serial queue with
 * SaveStatus, one transaction per write over records + meta + asset blobs (INV-20), the derived cache, the
 * meta markers, snapshots and the committed read. Boot (`open`), `replaceAll`, editor sessions, uiState,
 * quarantine and import batches land in the steps docs/PROGRESS.md names.
 */
import type { Clock, IdFactory } from '@/core/dataset/contracts';
import type { JsonValue } from '@/core/schema';
import type { PendingBatch } from './coalesce';
import type { MetaKey, PersistenceAdapter } from './contracts';
import { createDerivedCache } from './derived-cache';
import type { OrnDb } from './db';
import { prepareTransactionRows } from './rows';
import { realScheduler, type PersistenceEventSink, type Scheduler } from './events';
import { createSnapshotStore } from './snapshot-store';
import { createWriteQueue } from './write-queue';

const DEFAULT_GENERATOR = { app: 'organic-reaction-navigator', version: '0.1.0' } as const;

export interface DexieAdapterOptions {
  readonly db: OrnDb;
  readonly clock: Clock;
  /** Snapshot IDs (`snp_<ulid>`) and timestamps. */
  readonly ids: IdFactory;
  /** Written into every snapshot document. */
  readonly generator?: { readonly app: string; readonly version: string };
  readonly scheduler?: Scheduler;
  readonly onEvent?: PersistenceEventSink;
  readonly retryDelaysMs?: readonly number[];
  readonly derivedCacheSoftCapBytes?: number;
  /** Revision already durable when the adapter starts (boot supplies it). */
  readonly initialRevision?: number;
  readonly readOnly?: boolean;
}

/** Raw rows exactly as stored, read in ONE transaction so records and meta belong to one revision. Not validated. */
export interface CommittedData {
  readonly rows: readonly unknown[];
  readonly meta: Readonly<Partial<Record<MetaKey, JsonValue>>>;
}

type Implemented =
  | 'writeChanges'
  | 'getAssetBlob'
  | 'putDerived'
  | 'getDerived'
  | 'setLastCleanShutdownAt'
  | 'setLastIntegrityCheckAt'
  | 'createSnapshot'
  | 'listSnapshots'
  | 'readSnapshot'
  | 'deleteSnapshot'
  | 'getStatus'
  | 'subscribeStatus'
  | 'close';

export interface DexieAdapter extends Pick<PersistenceAdapter, Implemented> {
  /** Attempts everything pending now and resolves when that write cycle ends; read `getStatus()` for the outcome. */
  flush(): Promise<void>;
  /** Bulk read for boot (step 3.3 validates each row) and for P-01. */
  readCommitted(): Promise<CommittedData>;
}

export function createDexieAdapter(options: DexieAdapterOptions): DexieAdapter {
  const { db } = options;
  const cache = createDerivedCache({
    db,
    clock: options.clock,
    ...(options.derivedCacheSoftCapBytes !== undefined ? { softCapBytes: options.derivedCacheSoftCapBytes } : {}),
    ...(options.onEvent !== undefined ? { onEvent: options.onEvent } : {}),
  });
  /** The dataset meta last written; a new reference means it changed (Immer keeps unchanged objects identical). */
  let persistedMeta: object | undefined;

  async function persist(batch: PendingBatch): Promise<void> {
    const writesMeta = batch.latest.meta !== persistedMeta;
    const { puts, deleteIds, blobRows, metaRows } = prepareTransactionRows(batch, writesMeta);
    await db.transaction('rw', [db.records, db.meta, db.assetBlobs], async () => {
      await db.records.bulkPut([...puts]);
      await db.records.bulkDelete([...deleteIds]);
      await db.assetBlobs.bulkPut([...blobRows]);
      await db.meta.bulkPut([...metaRows]);
    });
    if (writesMeta) persistedMeta = batch.latest.meta;
  }

  const queue = createWriteQueue({
    persist,
    onQuota: async () => (await cache.evictForQuota()) > 0,
    deletableSnapshotIds: () => snapshots.deletablePeriodicIds(),
    scheduler: options.scheduler ?? realScheduler,
    ...(options.onEvent !== undefined ? { onEvent: options.onEvent } : {}),
    ...(options.retryDelaysMs !== undefined ? { retryDelaysMs: options.retryDelaysMs } : {}),
    ...(options.initialRevision !== undefined ? { initialRevision: options.initialRevision } : {}),
    ...(options.readOnly !== undefined ? { readOnly: options.readOnly } : {}),
  });

  /** Markers are writes like any other: ordered after the ChangeSets pending when they are set (SONNET_HANDOFF §18.8). */
  const snapshots = createSnapshotStore({
    db,
    queue,
    ids: options.ids,
    generator: options.generator ?? DEFAULT_GENERATOR,
    ...(options.onEvent !== undefined ? { onEvent: options.onEvent } : {}),
  });

  const setMeta = (key: MetaKey, value: JsonValue): Promise<void> =>
    queue.runOrdered(async () => {
      await db.meta.put({ key, value });
    });

  return {
    writeChanges: (changes, next, blobs) => queue.enqueue(changes, next, blobs),
    flush: () => queue.flush(),
    getStatus: () => queue.getStatus(),
    subscribeStatus: (listener) => queue.subscribe(listener),
    createSnapshot: (reason, state, revision, note) => snapshots.createSnapshot(reason, state, revision, note),
    listSnapshots: () => snapshots.listSnapshots(),
    readSnapshot: (id) => snapshots.readSnapshot(id),
    deleteSnapshot: (id) => snapshots.deleteSnapshot(id),
    putDerived: (row) => cache.put(row),
    getDerived: (key) => cache.get(key),
    async getAssetBlob(assetId) {
      return (await db.assetBlobs.get(assetId))?.blob;
    },
    setLastCleanShutdownAt: (at) => setMeta('lastCleanShutdownAt', at),
    setLastIntegrityCheckAt: (at) => setMeta('lastIntegrityCheckAt', at),
    async readCommitted() {
      return db.transaction('r', [db.records, db.meta], async () => {
        const rows: unknown[] = await db.records.toArray();
        const meta: Partial<Record<MetaKey, JsonValue>> = {};
        for (const row of await db.meta.toArray()) meta[row.key] = row.value;
        return { rows, meta };
      });
    },
    async close() {
      await queue.close();
      db.close();
    },
  };
}
