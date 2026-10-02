/**
 * What a session-only tab keeps IN MEMORY behind the same ports the persistence adapter satisfies (step 5.1c, decision d): the
 * snapshot bytes (at most `MEMORY_SNAPSHOT_LIMIT`, the oldest dropped and REPORTED through `takeDropped`), the import batch rows
 * and their quarantine rows (same bound, dropped with the oldest). Nothing here is saved anywhere: Undo import works until the
 * tab closes, and every answer says nothing is saved.
 */
import type { IdFactory } from '@/core/dataset/contracts';
import type { DatasetDocument } from '@/core/schema';
import { CURRENT_SCHEMA_VERSION } from '@/core/schema';
import { buildSnapshot, decodeSnapshot, type ImportBatchRow, type PersistenceAdapter, type QuarantineRow, type SnapshotSummary } from '@/persistence';

export const MEMORY_SNAPSHOT_LIMIT = 3;

export type MemoryStore = Pick<
  PersistenceAdapter,
  'createSnapshot' | 'storeSnapshotBytes' | 'listSnapshots' | 'readSnapshot' | 'readSnapshotBytes' | 'deleteSnapshot' | 'saveImportBatch' | 'addQuarantine' | 'listImportBatches'
> & {
  /** What was dropped to stay inside the bound since the last call, oldest first (snapshot IDs and batch IDs). */
  takeDropped(): readonly string[];
};

export interface MemoryStoreOptions {
  readonly ids: Pick<IdFactory, 'now' | 'newId'>;
  /** The live revision (`storeSnapshotBytes` refuses bytes of any other revision, like the adapter does). */
  readonly revision: () => number;
  readonly generator: DatasetDocument['generator'];
  readonly limit?: number;
}

export function createMemoryStore(options: MemoryStoreOptions): MemoryStore {
  const limit = options.limit ?? MEMORY_SNAPSHOT_LIMIT;
  const snapshots: { summary: SnapshotSummary; bytes: Uint8Array }[] = [];
  const batches: ImportBatchRow[] = [];
  const quarantine: QuarantineRow[] = [];
  let dropped: string[] = [];

  const trim = (): void => {
    while (snapshots.length > limit) {
      const gone = snapshots.shift();
      if (gone !== undefined) dropped.push(gone.summary.id);
    }
    while (batches.length > limit) {
      const gone = batches.shift();
      if (gone === undefined) continue;
      dropped.push(gone.id);
      for (let at = quarantine.length - 1; at >= 0; at -= 1) if (quarantine[at]?.importBatchId === gone.id) quarantine.splice(at, 1);
    }
  };
  const keep = (summary: SnapshotSummary, bytes: Uint8Array): SnapshotSummary => {
    snapshots.push({ summary, bytes: bytes.slice() });
    trim();
    return summary;
  };

  return {
    async createSnapshot(reason, state, revision, note) {
      const built = buildSnapshot({
        id: options.ids.newId('snp'),
        createdAt: options.ids.now(),
        reason,
        state,
        revision,
        ...(note === undefined ? {} : { note }),
        generator: options.generator,
      });
      if (!built.ok) throw new Error(`the snapshot could not be serialised (${built.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')})`);
      return keep(built.built.summary, built.built.bytes);
    },

    async storeSnapshotBytes(input) {
      const current = options.revision();
      if (input.revision !== current) {
        return { ok: false, code: 'STALE_REVISION', message: `the snapshot bytes are revision ${input.revision}, the store is at revision ${current}`, current };
      }
      if (input.bytes.length === 0) return { ok: false, code: 'BAD_BYTES', message: 'the snapshot bytes are empty' };
      const summary: SnapshotSummary = {
        id: options.ids.newId('snp'),
        createdAt: options.ids.now(),
        reason: input.reason,
        revision: input.revision,
        schemaVersion: input.schemaVersion || CURRENT_SCHEMA_VERSION,
        byteSize: input.bytes.length,
        ...(input.note === undefined ? {} : { note: input.note }),
      };
      return { ok: true, summary: keep(summary, input.bytes) };
    },

    async listSnapshots() {
      return snapshots.map((entry) => entry.summary).reverse();
    },

    async readSnapshotBytes(id) {
      const found = snapshots.find((entry) => entry.summary.id === id);
      if (found === undefined) return { ok: false, code: 'NOT_FOUND', message: `no snapshot ${id} in memory (it may have been dropped: a session-only tab keeps ${limit})` };
      return { ok: true, summary: found.summary, bytes: found.bytes.slice() };
    },

    async readSnapshot(id) {
      const found = snapshots.find((entry) => entry.summary.id === id);
      if (found === undefined) return { ok: false, code: 'NOT_FOUND', message: `no snapshot ${id} in memory (it may have been dropped: a session-only tab keeps ${limit})` };
      const decoded = decodeSnapshot(found.bytes);
      if (!decoded.ok) return { ok: false, code: 'CORRUPT', message: `snapshot ${id}: ${decoded.message}` };
      return { ok: true, summary: found.summary, doc: decoded.doc };
    },

    async deleteSnapshot(id) {
      const at = snapshots.findIndex((entry) => entry.summary.id === id);
      if (at >= 0) snapshots.splice(at, 1);
    },

    async saveImportBatch(row) {
      batches.push(row);
      trim();
    },

    async addQuarantine(rows) {
      const added: string[] = [];
      for (const row of rows) {
        if (quarantine.some((existing) => existing.id === row.id)) continue;
        quarantine.push(row);
        added.push(row.id);
      }
      return added;
    },

    async listImportBatches() {
      return [...batches].reverse();
    },

    takeDropped() {
      const out = dropped;
      dropped = [];
      return out;
    },
  };
}
