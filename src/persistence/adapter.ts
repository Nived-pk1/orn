/**
 * The Dexie implementation of PersistenceAdapter (steps 3.1 to 3.3): the serial queue with SaveStatus, one
 * transaction per write over records + meta + asset blobs (INV-20), the derived cache, markers, snapshots, the
 * small stores (quarantine, import batches, editor sessions, uiState), `replaceAll` and the boot sequence
 * (`open`), the change message after each persisted transaction and the follower side of ADR-033 (`readChanged`,
 * `loadForFollower`, `promote`). Every write except `derivedCache` runs in the queue's order. Not yet:
 * `storageEstimate` and `requestPersistentStorage` (Phase 5/9 wiring).
 */
import type { Clock, IdFactory } from '@/core/dataset/contracts';
import type { MigrationRunner } from '@/core/migrations/contracts';
import type { JsonValue } from '@/core/schema';
import { createAuxStores } from './aux-stores';
import { sha256OfBlob } from './blob-hash';
import { runBoot } from './boot';
import { changeMessageFor } from './change-message';
import { interpretCommitted, type ChangedRows, type FollowerLoad } from './follower-read';
import type { BootPorts, CommittedData, UiStateValidators } from './boot-ports';
import type { PendingBatch } from './coalesce';
import type { ChangeChannel, MetaKey, OpenResult, PersistenceAdapter, WriterLock } from './contracts';
import { createDerivedCache } from './derived-cache';
import type { AssetBlobRow, OrnDb } from './db';
import { realScheduler, type PersistenceEventSink, type Scheduler } from './events';
import { writeAllRecords, writeRawDocument } from './replace';
import { prepareTransactionRows } from './rows';
import { createSnapshotStore } from './snapshot-store';
import { createWriteQueue } from './write-queue';

const DEFAULT_GENERATOR = { app: 'organic-reaction-navigator', version: '0.1.0' } as const;

/** Blobs whose bytes were hashed and matched; a retried write does not hash them again. */
const verifiedBlobs = new WeakSet<Blob>();

async function verifyBlobRows(rows: readonly AssetBlobRow[]): Promise<void> {
  for (const row of rows) {
    if (verifiedBlobs.has(row.blob)) continue;
    const actual = await sha256OfBlob(row.blob);
    if (actual !== row.sha256) throw new RangeError(`asset bytes refused: they hash to ${actual}, not the recorded SHA-256 ${row.sha256}; nothing was written`);
    verifiedBlobs.add(row.blob);
  }
}

export interface DexieAdapterOptions {
  readonly db: OrnDb;
  readonly clock: Clock;
  /** Snapshot IDs (`snp_<ulid>`) and timestamps. */
  readonly ids: IdFactory;
  /** The writer lock boot takes (INV-28): `createWebLocksWriterLock` in the app, a fake in tests. */
  readonly lock: WriterLock;
  /** Where the writer announces each persisted transaction (`orn-changes`). Absent: nobody is told (a single tab). */
  readonly channel?: ChangeChannel;
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
  /** Boot decides read-only after the adapter exists; promotion of a follower makes it writable (only `promote` does). */
  setReadOnly(readOnly: boolean): void;
  /** FOLLOWER (ADR-033): the rows named by a change message, with the revision and meta, in ONE read transaction. */
  readChanged(ids: readonly string[]): Promise<ChangedRows>;
  /** FOLLOWER (ADR-033): a full read, L1 per row (rejects are reported, never quarantined: a follower never writes). */
  loadForFollower(): Promise<FollowerLoad>;
  /**
   * PROMOTION (ADR-033), after the lock was granted: makes the write queue writable and runs boot again as the
   * writer (migration, quarantine, markers, crash check). The caller reloads its store from the result, then becomes
   * writable. A refusal (newer schema, failed migration, damaged meta) makes the queue read-only again.
   */
  promote(): Promise<OpenResult>;
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
  /** The revision the database is at (what a message calls `fromRevision`); undefined until boot or the first write says. */
  let durableRevision: number | undefined = options.initialRevision;

  /** Tells the other tabs; a failing channel is reported and never fails the write (they catch up at the next message). */
  function announce(fromRevision: number, revision: number, ids: Iterable<string> | 'all'): void {
    if (options.channel === undefined) return;
    try {
      options.channel.post(ids === 'all' ? { fromRevision, revision, changedIds: 'all' } : changeMessageFor(fromRevision, revision, ids));
    } catch (error) {
      options.onEvent?.({ type: 'channel_error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function persist(batch: PendingBatch): Promise<void> {
    const writesMeta = batch.latest.meta !== persistedMeta;
    const { puts, deleteIds, blobRows, metaRows } = prepareTransactionRows(batch, writesMeta);
    // Hashing cannot happen inside a transaction (awaiting it would end the transaction), so verify first: bytes that
    // do not hash to their key are refused, and nothing is written.
    await verifyBlobRows(blobRows);
    await db.transaction('rw', [db.records, db.meta, db.assetBlobs], async () => {
      await db.records.bulkPut([...puts]);
      await db.records.bulkDelete([...deleteIds]);
      // Content-addressed: a row is only ever added. Bytes already stored under their hash are left as they are.
      const stored = await db.assetBlobs.bulkGet(blobRows.map((row) => row.sha256));
      const missing = blobRows.filter((_, i) => stored[i] === undefined);
      if (missing.length > 0) await db.assetBlobs.bulkAdd(missing);
      await db.meta.bulkPut([...metaRows]);
    });
    if (writesMeta) persistedMeta = batch.latest.meta;
    // `batch.count` ChangeSets, one revision each: an unknown start (no boot) is the span they cover.
    announce(durableRevision ?? batch.revision - batch.count, batch.revision, batch.touched.keys());
    durableRevision = batch.revision;
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
      // Everything may differ (migration, recovery): followers reload rather than trust a list of IDs.
      announce(durableRevision ?? revision, revision, 'all');
      durableRevision = revision;
    });

  let holdsLock = false;
  const lock: WriterLock = {
    async acquire() {
      const result = await options.lock.acquire();
      holdsLock = result === 'acquired';
      return result;
    },
    whenAcquired: () => options.lock.whenAcquired(),
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
        durableRevision = revision;
        queue.resync(revision);
      }),
    listEditorSessionIds: async () => (await aux.listEditorSessions()).map((s) => s.id),
    listAssetBlobHashes: aux.listAssetBlobHashes,
    listUnverifiedAssetBlobs: aux.listUnverifiedAssetBlobs,
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
    readChanged: (ids) =>
      db.transaction('r', [db.records, db.meta], async (): Promise<ChangedRows> => ({
        rows: await db.records.bulkGet([...ids]),
        revision: (await db.meta.get('revision'))?.value,
        schemaVersion: (await db.meta.get('schemaVersion'))?.value,
        datasetMeta: (await db.meta.get('datasetMeta'))?.value,
      })),
    async loadForFollower() {
      return interpretCommitted(await readCommitted(), options.runner.target, options.ids.now());
    },
    async promote() {
      holdsLock = true;
      queue.setReadOnly(false);
      return runBoot(ports, { promotion: true });
    },
    createSnapshot: (reason, state, revision, note) => snapshots.createSnapshot(reason, state, revision, note),
    storeSnapshotBytes: (input) => snapshots.storeSnapshotBytes(input),
    listSnapshots: () => snapshots.listSnapshots(),
    readSnapshot: (id) => snapshots.readSnapshot(id),
    deleteSnapshot: (id) => snapshots.deleteSnapshot(id),
    putDerived: (row) => cache.put(row),
    getDerived: (key) => cache.get(key),
    async getAssetBlob(assetId) {
      return db.transaction('r', [db.records, db.assetBlobs], async () => {
        const record = await db.records.get(assetId);
        const sha256 = record?.kind === 'asset' ? record.sha256 : undefined;
        return sha256 === undefined ? undefined : (await db.assetBlobs.get(sha256))?.blob;
      });
    },
    setLastCleanShutdownAt: (at) => aux.setMeta('lastCleanShutdownAt', at),
    setLastIntegrityCheckAt: (at) => aux.setMeta('lastIntegrityCheckAt', at),
    addQuarantine: aux.addQuarantine,
    listQuarantine: aux.listQuarantine,
    deleteQuarantine: aux.deleteQuarantine,
    saveImportBatch: aux.saveImportBatch,
    listImportBatches: aux.listImportBatches,
    listAssetBlobHashes: aux.listAssetBlobHashes,
    listUnverifiedAssetBlobs: aux.listUnverifiedAssetBlobs,
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
