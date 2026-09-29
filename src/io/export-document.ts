/**
 * A scoped `DatasetDocument`: `selectScope`'s included IDs, applied to the state, then serialised the same
 * deterministic way as a full export (docs/PERSISTENCE.md §8, INV-19: records sorted by ID, keys in schema
 * order — `stateToDocument`/`serializeDocument` already give byte-identical output for the same state).
 */
import { stateToDocument, type ExportOptions as StateExportOptions } from '@/core/dataset';
import { RECORD_KINDS, type AnyRecord, type CanonicalState, type DatasetDocument, type RecordKind } from '@/core/schema';
import type { ExportOptions, MissingReference } from './contracts';
import { selectScope } from './export-scope';

export interface ScopedDocumentBuildInfo {
  readonly exportedAt: string;
  readonly generator: DatasetDocument['generator'];
}

export interface ScopedDocumentResult {
  readonly document: DatasetDocument;
  readonly counts: Readonly<Partial<Record<RecordKind, number>>>;
  readonly missingReferences: readonly MissingReference[];
}

function filteredState(state: CanonicalState, included: ReadonlySet<string>): CanonicalState {
  const tables = {} as Record<RecordKind, Record<string, AnyRecord>>;
  for (const kind of RECORD_KINDS) {
    const table: Record<string, AnyRecord> = {};
    for (const [id, record] of Object.entries(state.records[kind] as Record<string, AnyRecord>)) {
      if (included.has(id)) table[id] = record as AnyRecord;
    }
    tables[kind] = table;
  }
  return { meta: state.meta, records: tables as unknown as CanonicalState['records'] };
}

function countsOf(state: CanonicalState): Readonly<Partial<Record<RecordKind, number>>> {
  const counts: Partial<Record<RecordKind, number>> = {};
  for (const kind of RECORD_KINDS) {
    const n = Object.keys(state.records[kind] as Record<string, unknown>).length;
    if (n > 0) counts[kind] = n;
  }
  return counts;
}

export function buildScopedDocument(state: CanonicalState, options: ExportOptions, build: ScopedDocumentBuildInfo): ScopedDocumentResult {
  const scope = selectScope(state, options);
  const sub = filteredState(state, scope.included);
  const exportOptions: StateExportOptions = { exportedAt: build.exportedAt, exportScope: options.scope, generator: build.generator };
  return { document: stateToDocument(sub, exportOptions), counts: countsOf(sub), missingReferences: scope.missingReferences };
}
