/**
 * 7.3b A1: the import batch id on the records an import writes. Done AFTER the merge and the validation (the id is made once the
 * plan is known, and the id factory's call order stays what it was); `provenance` is not part of any validation rule. Pure: a new
 * state, the old one is untouched; records the import did not write are the same objects.
 */
import { freeze } from 'immer';
import type { AnyRecord, CanonicalState, ImportBatchId, RecordKind } from '@/core/schema';

export function stampImportBatch(state: CanonicalState, written: readonly { readonly kind: RecordKind; readonly id: string }[], batchId: string): CanonicalState {
  if (written.length === 0) return state;
  const tables = { ...state.records } as Record<RecordKind, Record<string, AnyRecord>>;
  const copied = new Set<RecordKind>();
  for (const { kind, id } of written) {
    const record = (tables[kind] as Record<string, AnyRecord> | undefined)?.[id];
    if (record === undefined) continue;
    if (!copied.has(kind)) {
      tables[kind] = { ...tables[kind] };
      copied.add(kind);
    }
    tables[kind][id] = { ...record, provenance: { ...record.provenance, importBatchId: batchId as ImportBatchId } } as AnyRecord;
  }
  return freeze({ meta: state.meta, records: tables } as unknown as CanonicalState, true);
}
