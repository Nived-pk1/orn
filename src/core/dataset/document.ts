/**
 * DatasetDocument ↔ CanonicalState (docs/PERSISTENCE.md §2, §8). Documents list records sorted by ID;
 * state indexes them by kind and ID. Duplicate IDs are reported, never resolved silently (INV-01).
 */
import { freeze } from 'immer';
import {
  CURRENT_SCHEMA_VERSION,
  DATASET_FORMAT,
  RECORD_KINDS,
  type AnyRecord,
  type CanonicalState,
  type DatasetDocument,
  type RecordKind,
} from '../schema';

export type EmbeddedAssets = NonNullable<DatasetDocument['embeddedAssets']>;

/**
 * Embedded asset bytes are not canonical state (they live in the blob store, PERSISTENCE.md), so they
 * are handed back beside the state instead of being dropped (INV-23).
 */
export type DocumentToStateResult =
  | { readonly ok: true; readonly state: CanonicalState; readonly embeddedAssets: EmbeddedAssets }
  | { readonly ok: false; readonly duplicates: readonly { readonly kind: RecordKind; readonly id: string }[] };

export interface ExportOptions {
  readonly exportedAt: string;
  readonly exportScope: DatasetDocument['exportScope'];
  readonly generator: DatasetDocument['generator'];
  /** Written only when present; omitted key, not an empty array, when there are none. */
  readonly embeddedAssets?: EmbeddedAssets;
}

/** Code-unit order: locale-independent, so the same state always yields the same order. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Deep-frozen state, like Immer output. Uniqueness is global across kinds (INV-01). */
export function documentToState(doc: DatasetDocument): DocumentToStateResult {
  const tables = {} as Record<RecordKind, Record<string, AnyRecord>>;
  const duplicates: { kind: RecordKind; id: string }[] = [];
  const seen = new Set<string>();
  for (const kind of RECORD_KINDS) {
    const table: Record<string, AnyRecord> = {};
    for (const record of doc.records[kind] as readonly AnyRecord[]) {
      if (seen.has(record.id)) {
        duplicates.push({ kind, id: record.id });
        continue;
      }
      seen.add(record.id);
      table[record.id] = record;
    }
    tables[kind] = table;
  }
  if (duplicates.length > 0) return { ok: false, duplicates };
  const state = { meta: doc.meta, records: tables } as unknown as CanonicalState;
  return { ok: true, state: freeze(state, true), embeddedAssets: doc.embeddedAssets ?? [] };
}

export function stateToDocument(state: CanonicalState, options: ExportOptions): DatasetDocument {
  const records = {} as Record<RecordKind, AnyRecord[]>;
  for (const kind of RECORD_KINDS) {
    const table = state.records[kind] as Readonly<Record<string, AnyRecord>>;
    records[kind] = Object.keys(table)
      .sort(compareIds)
      .map((id) => table[id] as AnyRecord);
  }
  return {
    format: DATASET_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: options.exportedAt,
    exportScope: options.exportScope,
    generator: options.generator,
    meta: state.meta,
    records: records as unknown as DatasetDocument['records'],
    ...(options.embeddedAssets !== undefined && options.embeddedAssets.length > 0
      ? { embeddedAssets: options.embeddedAssets }
      : {}),
  };
}
