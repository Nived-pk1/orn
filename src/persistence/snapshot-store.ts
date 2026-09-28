/**
 * Snapshots in IndexedDB (docs/PERSISTENCE.md §9). Building is synchronous and pure (`buildSnapshot`); every write
 * (create, prune, delete) runs in the write queue's order, after the ChangeSets pending when it was requested, so
 * a snapshot never claims a revision the database has not reached.
 */
import type { IdFactory } from '@/core/dataset/contracts';
import type { PersistenceAdapter, SnapshotSummary } from './contracts';
import type { OrnDb, SnapshotRow } from './db';
import type { PersistenceEventSink } from './events';
import { buildSnapshot, decodeSnapshot } from './snapshot-codec';
import { expiredPeriodicIds, oldestFirst, periodicIdsOldestFirst } from './snapshot-retention';
import type { WriteQueue } from './write-queue';

export interface SnapshotStoreOptions {
  readonly db: OrnDb;
  readonly queue: Pick<WriteQueue, 'runOrdered'>;
  readonly ids: IdFactory;
  readonly generator: { readonly app: string; readonly version: string };
  readonly onEvent?: PersistenceEventSink;
}

export type SnapshotStore = Pick<PersistenceAdapter, 'createSnapshot' | 'listSnapshots' | 'readSnapshot' | 'deleteSnapshot'> & {
  /** Periodic snapshots, oldest first: what the quota status offers for deletion. */
  deletablePeriodicIds(): Promise<readonly string[]>;
};

const summaryOf = (row: SnapshotRow): SnapshotSummary => {
  const { blob: _blob, ...summary } = row;
  return summary;
};

export function createSnapshotStore(options: SnapshotStoreOptions): SnapshotStore {
  const { db, queue, ids, onEvent } = options;

  async function summaries(): Promise<SnapshotSummary[]> {
    return (await db.snapshots.toArray()).map(summaryOf);
  }

  return {
    async createSnapshot(reason, state, revision, note) {
      const built = buildSnapshot({
        id: ids.newId('snp'),
        createdAt: ids.now(),
        reason,
        state,
        revision,
        ...(note !== undefined ? { note } : {}),
        generator: options.generator,
      });
      if (!built.ok) {
        const first = built.issues[0];
        throw new Error(`cannot snapshot revision ${revision}: the state does not serialise (${first?.path ?? ''} ${first?.message ?? ''})`);
      }
      const { summary, bytes } = built.built;
      const row: SnapshotRow = { ...summary, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zlib' }) };
      const pruned = await queue.runOrdered(() =>
        db.transaction('rw', db.snapshots, async () => {
          await db.snapshots.put(row);
          if (reason !== 'periodic') return [];
          const expired = expiredPeriodicIds(await summaries());
          await db.snapshots.bulkDelete(expired);
          return expired;
        }),
      );
      if (pruned.length > 0) onEvent?.({ type: 'snapshots_pruned', ids: pruned });
      return summary;
    },

    async listSnapshots() {
      return (await summaries()).sort((a, b) => oldestFirst(b, a));
    },

    async readSnapshot(id) {
      const row = await db.snapshots.get(id);
      if (row === undefined) return { ok: false, code: 'NOT_FOUND', message: `there is no snapshot ${id}` };
      const summary = summaryOf(row);
      if (row.blob.size !== row.byteSize) {
        return { ok: false, code: 'CORRUPT', message: `snapshot ${id} holds ${row.blob.size} bytes but was written with ${row.byteSize}` };
      }
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await row.blob.arrayBuffer());
      } catch (error) {
        return { ok: false, code: 'CORRUPT', message: `snapshot ${id} could not be read (${error instanceof Error ? error.message : String(error)})` };
      }
      const decoded = decodeSnapshot(bytes);
      if (!decoded.ok) return { ok: false, code: 'CORRUPT', message: `snapshot ${id}: ${decoded.message}` };
      if (decoded.doc.schemaVersion !== summary.schemaVersion) {
        return {
          ok: false,
          code: 'CORRUPT',
          message: `snapshot ${id} says schema version ${summary.schemaVersion} but its document says ${String(decoded.doc.schemaVersion)}`,
        };
      }
      return { ok: true, summary, doc: decoded.doc };
    },

    deleteSnapshot: (id) => queue.runOrdered(() => db.snapshots.delete(id)),

    async deletablePeriodicIds() {
      return periodicIdsOldestFirst(await summaries());
    },
  };
}
