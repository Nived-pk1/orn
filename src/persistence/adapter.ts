/**
 * The Dexie implementation of PersistenceAdapter (steps 3.1 to 3.3): the serial queue with SaveStatus, one
 * transaction per write over records + meta + asset blobs (INV-20), the derived cache, markers, snapshots, the
 * small stores (quarantine, import batches, editor sessions, uiState), `replaceAll` and the boot sequence
 * (`open`). Every write except `derivedCache` runs in the queue's order. Not yet: `storageEstimate` and
 * `requestPersistentStorage` (Phase 5/9 wiring).
 */
import type { Clock, IdFactory } from '@/core/dataset/contracts';
import type { MigrationRunner } from '@/core/migrations/contracts';
import type { JsonValue } from '@/core/schema';
import { createAuxStores } from './aux-stores';
import { runBoot } from './boot';
import type { BootPorts, CommittedData, UiStateValidators } from './boot-ports';
import type { PendingBatch } from './coalesce';
import type { MetaKey, OpenResult, PersistenceAdapter, WriterLock } from './contracts';
import { createDerivedCache } from './derived-cache';
import type { OrnDb } from './db';
import { realScheduler, type PersistenceEventSink, type Scheduler } from './events';
import { writeAllRecords, writeRawDocument } from './replace';
import { prepareTransactionRows } from './rows';
import { createSnapshotStore } from './snapshot-store';
import { createWriteQueue } from './write-queue';

const DEFAULT_GENERATOR = { app: 'organic-reaction-navigator', version: '0.1.0' } as const;

export interface DexieAdapterOptions {
  readonly db: OrnDb;
  readonly clock: Clock;
  /** Snapshot IDs (`snp_<ulid>`) and timestamps. */
  readonly ids: IdFactory;
  /** The writer lock boot takes (INV-28). Step 3.4 supplies the Web Locks one; `alwaysGrantedLock` until then. */
  readonly lock: WriterLock;
  /** Migrates an older database at boot (and is the arbiter of which stored versions are acceptable). */
  readonly runner: MigrationRunner;
  /** Optional per-key checks for the tolerant uiState restore; an entry that fails is reset and reported. */
  readonly uiStateValidators?: UiStateValidators;
  /** Written into every snapshot document. */
  readonly generator?: { readonly app: string; readonly version: string };
  readonly scheduler?: Scheduler;
  readonly onEvent?: PersistenceEventSink;
  readonly retryDelaysMs?: readonly number[];
  readonly derivedCacheSoftCapBytes?: number;
  /** Revision already durable when the adapter starts. Boot sets it itself; tests that skip boot may pass it. */
  readonly initialRevision?: number;
  readonly readOnly?: boolean;
}

export type { CommittedData };

export interface DexieAdapter extends Omit<PersistenceAdapter, 'storageEstimate' | 'requestPersistentStorage'> {
  /** Attempts everything pending now and resolves when that write cycle ends; read `getStatus()` for the outcome. */
  flush(): Promise<void>;
  /** Bulk read used by boot (which validates each row) and by P-01. */
  readCommitted(): Promise<CommittedData>;
  /** Boot decides read-only after the adapter exists; promotion of a follower (step 3.4) makes it writable. */
  setReadOnly(readOnly: boolean): void;
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

  const snapshots = createSnapshotStore({
    db,
    queue,
    ids: options.ids,
    generator: options.generator ?? DEFAULT_GENERATOR,
    ...(options.onEvent !== undefined ? { onEvent: options.onEvent } : {}),
  });
  const aux = createAuxStores(db, queue);

  const readCommitted = (): Promise<CommittedData> =>
    db.transaction('r', [db.records, db.meta], async () => {
      const rows: unknown[] = await db.records.toArray();
      const meta: Partial<Record<MetaKey, JsonValue>> = {};
      for (const row of await db.meta.toArray()) meta[row.key] = row.value;
      return { rows, meta };
    });

  const replaceAll: PersistenceAdapter['replaceAll'] = (state, revision) =>
    queue.runOrdered(async () => {
      const newest = queue.pendingRevision();
      if (newest !== undefined && newest > revision) {
        throw new RangeError(`cannot replace everything at revision ${revision}: revision ${newest} is already waiting to be written`);
      }
      await writeAllRecords(db, state, revision);
      persistedMeta = state.meta;
      queue.resync(revision);
    });

  let holdsLock = false;
  const lock: WriterLock = {
    async acquire() {
      const result = await options.lock.acquire();
      holdsLock = result === 'acquired';
      return result;
    },
    async release() {
      holdsLock = false;
      await options.lock.release();
    },
  };

  const ports: BootPorts = {
    db,
    lock,
    runner: options.runner,
    ids: options.ids,
    generator: options.generator ?? DEFAULT_GENERATOR,
    ...(options.uiStateValidators !== undefined ? { uiStateValidators: options.uiStateValidators } : {}),
    ...(options.onEvent !== undefined ? { onEvent: options.onEvent } : {}),
    readCommitted,
    moveToQuarantine: aux.moveToQuarantine,
    countQuarantine: aux.countQuarantine,
    createRawSnapshot: snapshots.createRawSnapshot,
    async restoreRawSnapshot(id) {
      const read = await snapshots.readSnapshot(id);
      if (!read.ok) return { ok: false, message: read.message };
      try {
        await queue.runOrdered(() => writeRawDocument(db, read.doc, read.summary.revision));
        return { ok: true };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    replaceAll,
    setCleanShutdown: (value) => aux.setMeta('lastCleanShutdownAt', value),
    setIntegrityCheck: (at) => aux.setMeta('lastIntegrityCheckAt', at),
    continueFrom: (revision, meta) =>
      queue.runOrdered(async () => {
        if (meta !== undefined) persistedMeta = meta;
        queue.resync(revision);
      }),
    listEditorSessionIds: async () => (await aux.listEditorSessions()).map((s) => s.id),
    listAssetBlobIds: aux.listAssetBlobIds,
    listUiStateRows: aux.listUiStateRows,
    deleteUiState: aux.deleteUiState,
    setReadOnly: (readOnly) => queue.setReadOnly(readOnly),
  };
  let opened: Promise<OpenResult> | undefined;

  return {
    open: () => (opened ??= runBoot(ports)),
    writeChanges: (changes, next, blobs) => queue.enqueue(changes, next, blobs),
    replaceAll,
    flush: () => queue.flush(),
    getStatus: () => queue.getStatus(),
    subscribeStatus: (listener) => queue.subscribe(listener),
    setReadOnly: (readOnly) => queue.setReadOnly(readOnly),
    createSnapshot: (reason, state, revision, note) => snapshots.createSnapshot(reason, state, revision, note),
    listSnapshots: () => snapshots.listSnapshots(),
    readSnapshot: (id) => snapshots.readSnapshot(id),
    deleteSnapshot: (id) => snapshots.deleteSnapshot(id),
    putDerived: (row) => cache.put(row),
    getDerived: (key) => cache.get(key),
    async getAssetBlob(assetId) {
      return (await db.assetBlobs.get(assetId))?.blob;
    },
    setLastCleanShutdownAt: (at) => aux.setMeta('lastCleanShutdownAt', at),
    setLastIntegrityCheckAt: (at) => aux.setMeta('lastIntegrityCheckAt', at),
    addQuarantine: aux.addQuarantine,
    listQuarantine: aux.listQuarantine,
    deleteQuarantine: aux.deleteQuarantine,
    saveImportBatch: aux.saveImportBatch,
    listImportBatches: aux.listImportBatches,
    listAssetBlobIds: aux.listAssetBlobIds,
    saveEditorSession: aux.saveEditorSession,
    listEditorSessions: aux.listEditorSessions,
    deleteEditorSession: aux.deleteEditorSession,
    getUiState: aux.getUiState,
    setUiState: aux.setUiState,
    readCommitted,
    async close() {
      await queue.close();
      if (holdsLock) await lock.release();
      db.close();
    },
  };
}
