/**
 * The small stores around the records (docs/PERSISTENCE.md §2): quarantine, import batches, editor sessions,
 * uiState, and the asset-blob ID list. Every write goes through the write queue's ordering (`runOrdered`,
 * SONNET_HANDOFF §18.8); reads go straight to IndexedDB. `derivedCache` is the one store outside the queue.
 */
import type { EditorSession } from '@/core/commands/contracts';
import type { JsonValue } from '@/core/schema';
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
  | 'listAssetBlobIds'
  | 'saveEditorSession'
  | 'listEditorSessions'
  | 'deleteEditorSession'
  | 'getUiState'
  | 'setUiState'
> & {
  setMeta(key: MetaKey, value: JsonValue): Promise<void>;
  countQuarantine(): Promise<number>;
  listUiStateRows(): Promise<readonly UiStateRow[]>;
  deleteUiState(keys: readonly string[]): Promise<void>;
};

const byCreatedAt = <T extends { createdAt: string; id: string }>(a: T, b: T): number =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function createAuxStores(db: OrnDb, queue: Pick<WriteQueue, 'runOrdered'>): AuxStores {
  return {
    setMeta: (key, value) =>
      queue.runOrdered(async () => {
        await db.meta.put({ key, value });
      }),

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

    listAssetBlobIds: async () => (await db.assetBlobs.toCollection().primaryKeys()) as string[],

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
