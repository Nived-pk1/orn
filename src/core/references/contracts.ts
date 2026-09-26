/**
 * Generic reference engine driven by REFERENCE_SPECS (src/core/schema/references.ts).
 * No reference-handling code may be written per field or per record kind.
 */
import type { AnyRecord, OnDelete, RecordKind, RecordRef, ReferenceSpec } from '../schema';

export interface ExtractedReference {
  readonly spec: ReferenceSpec;
  /** Concrete path, e.g. "participants[1].ref". */
  readonly path: string;
  readonly targetId: string;
  /** Kind of the referenced record for id/ref targets; undefined for local/nested targets. */
  readonly targetKind?: RecordKind;
  /** For nested targets: the record that must contain `targetId` (resolved via the spec's `via`). */
  readonly containerRecordId?: string;
}

export interface Referrer {
  readonly owner: RecordRef;
  readonly path: string;
  readonly targetId: string;
  readonly onDelete: OnDelete;
}

/** Result of a delete dry run; shown to the user before any destructive command. */
export interface DeleteImpact {
  readonly targets: readonly RecordRef[];
  /** Restrict references that block the delete unless their owners are deleted in the same batch. */
  readonly blockedBy: readonly Referrer[];
  /** Records that will be deleted as a consequence (transitive). */
  readonly cascades: readonly RecordRef[];
  /** References that will be removed from surviving records. */
  readonly detaches: readonly Referrer[];
}

export interface ReferenceEngine {
  extract(record: AnyRecord): readonly ExtractedReference[];
  /** Nested IDs defined by a record (NESTED_ID_SPECS), for global uniqueness checks. */
  nestedIds(record: AnyRecord): readonly { readonly path: string; readonly id: string }[];
  /** Rewrites record and nested IDs (import-as-copy, duplicate). Unmapped IDs are left unchanged. */
  remap(record: AnyRecord, idMap: ReadonlyMap<string, string>): AnyRecord;
  /** Applies 'detach' semantics for the given deleted IDs; returns the record unchanged if unaffected. */
  detach(record: AnyRecord, deletedIds: ReadonlySet<string>): AnyRecord;
}
