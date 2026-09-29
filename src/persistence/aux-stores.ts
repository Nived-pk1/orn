/**
 * The small stores around the records (docs/PERSISTENCE.md §2): quarantine, import batches, editor sessions,
 * uiState, and the asset-blob hash lists. Every write goes through the write queue's ordering (`runOrdered`,
 * SONNET_HANDOFF §18.8); reads go straight to IndexedDB. `derivedCache` is the one store outside the queue.
 */
import type { EditorSession } from '@/core/commands/contracts';
import { hash64 } from '@/core/hash';
import type { JsonValue } from '@/core/schema';
import type { RejectedRow } from './boot-load';
import type { ImportBatchRow, MetaKey, PersistenceAdapter, QuarantineRow } from './contracts';
import type { OrnDb, UiStateRow } from './db';
import type { WriteQueue } from './write-queue';

export type AuxStores = Pick<
  PersistenceAdapter,
  | 'addQuarantine'
  | 'listQuarantine'
  | 'deleteQuarantine'
  | 'saveImportBatch'
  | 'listImportBatches'
  | 'listAssetBlobHashes'
  | 'listUnverifiedAssetBlobs'
  | 'saveEditorSession'
  | 'listEditorSessions'
  | 'deleteEditorSession'
  | 'getUiState'
  | 'setUiState'
> & {
  setMeta(key: MetaKey, value: JsonValue): Promise<void>;
  /**
   * Boot only (writer): removes each row from `records` and writes its quarantine row with the full raw value, ALL in
   * one transaction and in the queue's order, so `records` always equals the in-memory state and a crash between the
   * two is impossible. Returns how many quarantine rows were written or kept (one per rejected row).
   */
  moveToQuarantine(rejected: readonly RejectedRow[]): Promise<number>;
  countQuarantine(): Promise<number>;
  listUiStateRows(): Promise<readonly UiStateRow[]>;
  deleteUiState(keys: readonly string[]): Promise<void>;
};

const textOf = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
};

/**
 * The quarantine row to write for `candidate` given a row already stored under its ID, or undefined when the stored
 * one already says the same. Nothing stored is ever lost: a truncated copy is replaced by the full value, and a
 * different value under the same derived ID gets its own ID (the ID carries a hash of the value).
 */
function resolveQuarantine(candidate: QuarantineRow, existing: QuarantineRow | undefined): QuarantineRow | undefined {
  if (existing === undefined || existing.rawTruncated !== undefined) return candidate;
  const text = textOf(candidate.raw);
  if (text !== '' && text === textOf(existing.raw)) return undefined;
  return { ...candidate, id: `${candidate.id}-${hash64(text)}` };
}

const byCreatedAt =<T extends { createdAt: string; id: string }>(a: T, b: T): number =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function createAuxStores(db: OrnDb, queue: Pick<WriteQueue, 'runOrdered'>): AuxStores {
  return {
    setMeta: (key, value) =>
      queue.runOrdered(async () => {
        await db.meta.put({ key, value });
      }),

    moveToQuarantine: (rejected) =>
      queue.runOrdered(() =>
        db.transaction('rw', [db.records, db.quarantine], async () => {
          const existing = await db.quarantine.bulkGet(rejected.map((r) => r.quarantine.id));
          const writes = rejected.flatMap((r, i) => resolveQuarantine(r.quarantine, existing[i]) ?? []);
          await db.quarantine.bulkPut(writes);
          // The key is the row's own `id` as stored (a damaged row may hold a non-string one; IndexedDB accepts it).
          await db.records.bulkDelete(rejected.flatMap((r) => (r.recordKey === undefined ? [] : [r.recordKey as string])));
          return rejected.length;
        }),
      ),

    addQuarantine: (rows: readonly QuarantineRow[]) =>
      queue.runOrdered(() =>
        db.transaction('rw', db.quarantine, async () => {
          const existing = await db.quarantine.bulkGet(rows.map((r) => r.id));
          const fresh = rows.filter((_, i) => existing[i] === undefined);
          await db.quarantine.bulkAdd([...fresh]);
          return fresh.map((r) => r.id);
        }),
      ),
    listQuarantine: async () => (await db.quarantine.toArray()).sort(byCreatedAt),
    countQuarantine: () => db.quarantine.count(),
    deleteQuarantine: (ids) => queue.runOrdered(() => db.quarantine.bulkDelete([...ids])),

    saveImportBatch: (row: ImportBatchRow) =>
      queue.runOrdered(async () => {
        await db.importBatches.put(row);
      }),
    listImportBatches: async () => (await db.importBatches.toArray()).sort((a, b) => byCreatedAt(b, a)),

    listAssetBlobHashes: async () => (await db.assetBlobs.toCollection().primaryKeys()) as string[],
    listUnverifiedAssetBlobs: async () =>
      (await db.assetBlobsUnverified.toArray())
        .map((row) => ({ assetId: row.assetId, recordedSha256: row.recordedSha256, actualSha256: row.actualSha256, byteSize: row.blob.size }))
        .sort((a, b) => (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0)),

    saveEditorSession: (session: EditorSession) =>
      queue.runOrdered(async () => {
        await db.editorSessions.put(session);
      }),
    listEditorSessions: async () => (await db.editorSessions.toArray()).sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0)),
    deleteEditorSession: (id) => queue.runOrdered(() => db.editorSessions.delete(id)),

    getUiState: async (key) => (await db.uiState.get(key))?.value,
    setUiState: (key, value) =>
      queue.runOrdered(async () => {
        await db.uiState.put({ key, value });
      }),
    listUiStateRows: () => db.uiState.toArray(),
    deleteUiState: (keys) => queue.runOrdered(() => db.uiState.bulkDelete([...keys])),
  };
}
