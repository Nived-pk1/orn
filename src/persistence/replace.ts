/**
 * Whole-database record writes, each ONE transaction over records + meta (INV-20). Asset blobs, snapshots and the
 * other stores are never touched. Callers run these inside an ordered task of the write queue.
 */
import { CURRENT_SCHEMA_VERSION, RECORD_KINDS, type AnyRecord, type CanonicalState, type JsonValue } from '@/core/schema';
import type { MigratableDocument } from '@/core/migrations/contracts';
import type { OrnDb } from './db';

/** Every record of `state` replaces whatever the database held, at `revision`, in the current schema version. */
export async function writeAllRecords(db: OrnDb, state: CanonicalState, revision: number): Promise<void> {
  const rows: AnyRecord[] = [];
  for (const kind of RECORD_KINDS) rows.push(...Object.values(state.records[kind] as Readonly<Record<string, AnyRecord>>));
  await db.transaction('rw', [db.records, db.meta], async () => {
    await db.records.clear();
    await db.records.bulkPut(rows);
    await db.meta.bulkPut([
      { key: 'revision', value: revision },
      { key: 'schemaVersion', value: CURRENT_SCHEMA_VERSION },
      { key: 'datasetMeta', value: state.meta as unknown as JsonValue },
    ]);
  });
}

/**
 * Puts a tolerant document back exactly as it was stored (rows, the schema version it had, its meta), for rolling a
 * failed migration back to its `pre_migration` snapshot. Rows are written as they are: no validation, no upgrade.
 */
export async function writeRawDocument(db: OrnDb, doc: MigratableDocument, revision: number): Promise<void> {
  const rows = Object.values(doc.records)
    .flat()
    .filter((row): row is AnyRecord => typeof row === 'object' && row !== null && typeof (row as { id?: unknown }).id === 'string');
  await db.transaction('rw', [db.records, db.meta], async () => {
    await db.records.clear();
    await db.records.bulkPut(rows);
    await db.meta.bulkPut([
      { key: 'revision', value: revision },
      { key: 'schemaVersion', value: doc.schemaVersion },
      ...(doc['meta'] === undefined ? [] : [{ key: 'datasetMeta' as const, value: doc['meta'] as JsonValue }]),
    ]);
  });
}
