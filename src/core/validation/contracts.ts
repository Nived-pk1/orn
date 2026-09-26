/**
 * Validation contracts — docs/VALIDATION_RULES.md.
 * L1 structural (Zod) · L2 referential · L3 domain rules (sync, main thread, incremental)
 * L4 chemistry heuristics (async, chem worker). Findings are stored apart from records and never
 * modify data (INV-24). ERROR at L1–L3 blocks a commit; L4 never blocks.
 */
import type { AnyRecord, CanonicalState, JsonValue, RecordByKind, RecordKind, RecordRef } from '../schema';
import type { ReadonlyIndexes } from '../indexes/contracts';

export type Severity = 'error' | 'warning' | 'info' | 'review_required';
export type ValidationLevel = 1 | 2 | 3 | 4;

export interface Finding {
  /** fnd_<stable hash of ruleId + subject id + path>: identical problems keep identical IDs. */
  readonly id: string;
  /** e.g. "RXN-004"; "SCHEMA" for L1 issues. */
  readonly ruleId: string;
  readonly level: ValidationLevel;
  readonly severity: Severity;
  readonly subject: RecordRef;
  /** Concrete path inside the subject, e.g. "outcomes[2].products[0].ref". */
  readonly path?: string;
  /** Plain text. Rendered as text, never as markup. */
  readonly message: string;
  readonly related: readonly RecordRef[];
  readonly data?: Readonly<Record<string, JsonValue>>;
}

export interface FindingDraft {
  readonly path?: string;
  readonly message: string;
  readonly related?: readonly RecordRef[];
  readonly data?: Readonly<Record<string, JsonValue>>;
  /** Overrides the rule's default severity (e.g. lifecycle-dependent rules). */
  readonly severity?: Severity;
}

export interface RuleContext {
  readonly state: CanonicalState;
  readonly indexes: ReadonlyIndexes;
}

export interface ValidationRule<K extends RecordKind = RecordKind> {
  readonly id: string;
  readonly level: 2 | 3;
  readonly kinds: readonly K[];
  readonly defaultSeverity: Severity;
  /**
   * record: depends only on the record itself · neighbourhood: re-run when a referenced or
   * referencing record changes · global: dataset-wide (cycles, duplicates), maintained via indexes.
   */
  readonly scope: 'record' | 'neighbourhood' | 'global';
  readonly description: string;
  check(record: RecordByKind[K], ctx: RuleContext): Iterable<FindingDraft>;
}

export interface Validator {
  /** L1 parse of one unknown value as a record of `kind`; used by commands, import and boot integrity. */
  parseRecord(kind: RecordKind, value: unknown): { ok: true; record: AnyRecord } | { ok: false; findings: readonly Finding[] };
  /** L1–L3 for touched records plus dependents (via reverse index). Must stay within the commit budget. */
  validateTouched(state: CanonicalState, indexes: ReadonlyIndexes, touched: readonly RecordRef[]): readonly Finding[];
  /** Full L1–L3 pass, run in the compute worker. */
  validateAll(state: CanonicalState, indexes: ReadonlyIndexes, signal?: AbortSignal): readonly Finding[];
}

export interface FindingStore {
  replaceForSubjects(subjects: readonly RecordRef[], findings: readonly Finding[], level: ValidationLevel): void;
  bySubject(ref: RecordRef): readonly Finding[];
  all(filter?: { readonly severity?: Severity; readonly level?: ValidationLevel }): readonly Finding[];
  counts(): Readonly<Record<Severity, number>>;
  subscribe(listener: () => void): () => void;
}
