/**
 * Validation contracts — docs/VALIDATION_RULES.md.
 * L1 structural (Zod) · L2 referential · L3 domain rules (sync, main thread, incremental)
 * L4 chemistry heuristics (async, chem worker). Findings are stored apart from records and never
 * modify data (INV-24). ERROR at L1–L3 blocks a commit; L4 never blocks.
 */
import type { AnyRecord, CanonicalState, JsonValue, RecordByKind, RecordKind, RecordRef } from '../schema';
import type { CoreIndexes } from '../indexes/contracts';

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
  /**
   * Rules read only the record-local indexes (`ReadonlyIndexes` extends them, so callers holding the
   * full set pass it unchanged). Amended in step 1.7: the cross-record indexes arrive in Phase 2.
   */
  readonly indexes: CoreIndexes;
}

/**
 * What a rule reads of the records its subject refers to (ADR-031). Keys are the kind of the referenced
 * record, or `'*'` for any kind; the value lists the top-level fields of that record the rule reads.
 * `[]` means the rule reads only whether the record exists; a kind with no key (and no `'*'`) is not read
 * at all. `id` and `kind` are always readable. A record being created or deleted changes everything about it.
 */
export type ReferencedReads = Readonly<Partial<Record<RecordKind | '*', readonly string[]>>>;

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
  /** Kinds, besides `kinds`, whose change can alter this rule's findings on other records (see `peers`). */
  readonly watches?: readonly RecordKind[];
  /**
   * Records, beyond the referrers and referents of `record`, whose findings for this rule can change
   * when `record` changes: name twins, duplicate-ID definers, members of a cycle, rich-text linkers.
   * Called for a touched record of a kind in `kinds` or `watches`, in its new and its previous version.
   * A superset is always safe; a missing peer leaves a stale finding (the incremental ≡ full test).
   */
  peers?(record: AnyRecord, ctx: RuleContext): Iterable<RecordRef>;
  /**
   * Optional (step 2.12). What `check` reads of the records the subject *refers to*, so that a change to a
   * referenced record re-validates a referrer only if some rule of the referrer's kind reads a field that
   * changed. Omitted (the default) means "may read anything": the rule re-runs on any change to a
   * referenced record. Declares only reads made through the subject's own references; text links, name
   * twins, the subject's referrers and transitive walks stay with `peers`/`watches` and are never narrowed.
   * A wrong declaration leaves a stale finding, which the incremental ≡ full tests and the read audit catch.
   */
  readonly referencedReads?: ReferencedReads;
  /**
   * Optional (step 2.13, ADR-032). The mirror of `referencedReads` for `peers`: which fields of a touched record
   * (keys: its kind, or `'*'`) this rule reads of it when validating one of its *other* records — a name twin, a
   * class ancestor, a species listing a class or a descendant — anywhere other than through that record's own
   * references. `peers` is called for a touched record only if a listed field changed, or the record was created
   * or deleted (`[]`: only existence matters); a kind with no key is never called. Omitted (the default) means
   * "may read anything": `peers` is called on every touch, as before. A wrong declaration leaves a stale finding;
   * `reads-audit.test.ts` traces the reads of every declaring rule and the incremental ≡ full tests catch the rest.
   */
  readonly peerReads?: ReferencedReads;
}

export interface Validator {
  /** L1 parse of one unknown value as a record of `kind`; used by commands, import and boot integrity. */
  parseRecord(kind: RecordKind, value: unknown): { ok: true; record: AnyRecord } | { ok: false; findings: readonly Finding[] };
  /**
   * L1–L3 for the records `scopeOf` names. `previous` is the state before the change: it lets the scope
   * include neighbours of what the touched records used to be (old references, old names, old IDs).
   * Must stay within the commit budget.
   */
  validateTouched(
    state: CanonicalState,
    indexes: CoreIndexes,
    touched: readonly RecordRef[],
    previous?: CanonicalState,
  ): readonly Finding[];
  /**
   * The subjects `validateTouched` covers: the touched records, their referrers and referents, and the
   * peers their rules name. Callers pass it to `FindingStore.replaceForSubjects` so records that became
   * clean lose their findings. Sorted, without duplicates; records that no longer exist are included.
   */
  scopeOf(
    state: CanonicalState,
    indexes: CoreIndexes,
    touched: readonly RecordRef[],
    previous?: CanonicalState,
  ): readonly RecordRef[];
  /** Full L1–L3 pass, run in the compute worker. */
  validateAll(state: CanonicalState, indexes: CoreIndexes, signal?: AbortSignal): readonly Finding[];
  /**
   * `validateTouched` + `scopeOf` in one call, with referrers re-validated per rule (ADR-032, step 2.13). The
   * touched records, their referents and their peers are re-validated whole (`scope`/`findings`, replaced with
   * `FindingStore.replaceForSubjects`). A referrer of a touched record only had its rules that read a changed
   * field (`referencedReads`) re-run, and that referrer's other findings must survive: those results come back
   * in `byRule`, to be merged with `FindingStore.replaceForRules`. `commitTouched` does both. `previous` should
   * always be passed: without it nothing can be diffed and every referrer is re-validated whole. `known` is the
   * store the result will be committed to; it says whether a referrer currently has an L1/L2 ERROR (which
   * gates its L3 rules off). The union of `scope` and the `byRule` subjects equals `scopeOf`'s answer, and the
   * committed store equals `validateAll`'s findings (tested).
   */
  validateTouchedByRule(
    state: CanonicalState,
    indexes: CoreIndexes,
    touched: readonly RecordRef[],
    previous: CanonicalState | undefined,
    known: Pick<FindingStore, 'bySubject'>,
  ): TouchedValidation;
}

/** Findings of some rules only, for subjects whose other findings are left alone. */
export interface RuleScopedFindings {
  readonly subjects: readonly RecordRef[];
  readonly ruleIds: readonly string[];
  readonly findings: readonly Finding[];
}

export interface TouchedValidation {
  /** Subjects re-validated whole, sorted. */
  readonly scope: readonly RecordRef[];
  /** Every finding of `scope`, all levels, sorted. */
  readonly findings: readonly Finding[];
  /** Referrers re-validated for the rules that read what changed, grouped by that rule set. */
  readonly byRule: readonly RuleScopedFindings[];
  /** `findings` and every `byRule` finding, sorted: what a commit reports and checks for ERRORs. */
  readonly all: readonly Finding[];
}

export interface FindingStore {
  replaceForSubjects(subjects: readonly RecordRef[], findings: readonly Finding[], level: ValidationLevel): void;
  /**
   * Additive (ADR-032). Replaces, for each of `subjects`, only its findings of the rules in `ruleIds` (at
   * whatever level they are) with `findings`; its findings of every other rule are left untouched. Every
   * finding must be about a listed subject and of a listed rule. No findings clears those rules' findings.
   */
  replaceForRules(subjects: readonly RecordRef[], ruleIds: readonly string[], findings: readonly Finding[]): void;
  bySubject(ref: RecordRef): readonly Finding[];
  all(filter?: { readonly severity?: Severity; readonly level?: ValidationLevel }): readonly Finding[];
  counts(): Readonly<Record<Severity, number>>;
  subscribe(listener: () => void): () => void;
}
