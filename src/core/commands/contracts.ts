/**
 * Canonical store and command contracts — docs/ARCHITECTURE.md §2.4 and §23, docs/PERSISTENCE.md §3.
 * Every canonical change goes through dispatch():
 *   Immer produceWithPatches → validateTouched (L1–L3) → ERROR ⇒ reject, state unchanged
 *   → commit (revision + 1, history entry) → indexes.apply → notify subscribers → persistence queue.
 */
import type { Patch } from 'immer';
import type { AnyRecord, CanonicalState, DatasetMeta, RecordKind, RecordRef } from '../schema';
import type { ChangeSet } from '../dataset/contracts';
import type { DeleteImpact } from '../references/contracts';
import type { Finding } from '../validation/contracts';

export type DomainCommand =
  | { readonly type: 'record.create'; readonly record: AnyRecord }
  /** Full next version of the record. `id` and `kind` are immutable (INV-03). */
  | { readonly type: 'record.update'; readonly record: AnyRecord }
  /** restrict: fail if blocked · apply_cascade: perform cascades and detaches from the dry run. */
  | { readonly type: 'record.delete'; readonly ref: RecordRef; readonly mode: 'restrict' | 'apply_cascade' }
  /** Re-point every reference to `from` at `to` (merge duplicates, replace before delete). Same kind only. */
  | { readonly type: 'record.replaceReferences'; readonly from: RecordRef; readonly to: RecordRef }
  | { readonly type: 'meta.update'; readonly meta: DatasetMeta };

/** Atomic batch. Domain operations (AttachOutcome, ReorderParticipants, …) are builders producing envelopes. */
export interface CommandEnvelope {
  /** Undo-history label, e.g. "Add minor outcome to Hydrobromination of propene". */
  readonly label: string;
  readonly commands: readonly DomainCommand[];
  readonly expectedRevision?: number;
  /** Records to select after undo/redo of this entry. */
  readonly selectionHint?: readonly RecordRef[];
}

export type CommandErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'ID_CONFLICT'
  | 'IMMUTABLE_FIELD'
  | 'DELETE_RESTRICTED'
  | 'STALE_REVISION'
  | 'READ_ONLY'
  /** `applyRemote` / `reload` on a writable store: only a read-only follower may mirror storage (ADR-033, INV-28). */
  | 'NOT_FOLLOWER'
  /** Precomputed findings do not belong to the state being adopted (or, with `verifyPrecomputed`, differ from `validateAll`). */
  | 'FINDINGS_MISMATCH'
  | 'EMPTY_COMMAND'
  | 'INTERNAL';

export interface CommandError {
  readonly code: CommandErrorCode;
  readonly message: string;
  readonly findings?: readonly Finding[];
  readonly impact?: DeleteImpact;
}

export type CommitResult =
  | { readonly ok: true; readonly changes: ChangeSet; readonly findings: readonly Finding[] }
  | { readonly ok: false; readonly error: CommandError };

export interface HistoryEntry {
  readonly label: string;
  readonly revisionBefore: number;
  readonly revisionAfter: number;
  readonly patches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
  readonly selectionHint?: readonly RecordRef[];
}

/**
 * What a follower tab read from storage for one message of the writer (ADR-033): the records the writer changed, as
 * stored at `revision` and already L1-parsed, and the IDs that no longer exist there.
 */
export interface RemoteChange {
  /** Revision the follower must be at for this to apply; anything else is `STALE_REVISION` and the follower reloads. */
  readonly fromRevision: number;
  /** Revision the store is at afterwards. May be several ahead of `fromRevision` (the writer coalesced). */
  readonly revision: number;
  readonly upserts: readonly AnyRecord[];
  readonly deletedIds: readonly string[];
  /** The dataset meta, only when it differs from the follower's. */
  readonly meta?: DatasetMeta;
}

/**
 * L1-L3 findings produced elsewhere (the compute worker) for exactly the state passed to `replaceState` or `reload`
 * (Phase 4 contract decisions, Q3). The store accepts them only if every cheap, exact check holds (`checkPrecomputed`):
 * `ruleSet` is `RULE_SET_ID`; `revision` is the revision the store will adopt; `recordCounts` equal the new state's
 * count per kind; every finding is about a record of the new state, is level 1-3 and of a rule of the rule set; no
 * finding ID is repeated. Otherwise the call is refused as `FINDINGS_MISMATCH` and nothing changes; the store never
 * falls back to recomputing. L4 findings are never passed.
 */
export interface PrecomputedFindings {
  readonly findings: readonly Finding[];
  readonly ruleSet: string;
  readonly revision: number;
  readonly recordCounts: Readonly<Record<RecordKind, number>>;
}

export interface CanonicalStore {
  getState(): CanonicalState;
  getRevision(): number;
  isReadOnly(): boolean;
  subscribe(listener: (changes: ChangeSet) => void): () => void;
  dispatch(envelope: CommandEnvelope): CommitResult;
  deleteImpact(refs: readonly RecordRef[]): DeleteImpact;
  /** Linear history; undo/redo restore exact prior states (INV-27) and produce ChangeSets like any commit. */
  undo(): CommitResult | null;
  redo(): CommitResult | null;
  canUndo(): boolean;
  canRedo(): boolean;
  historyLabels(): { readonly undo: readonly string[]; readonly redo: readonly string[] };
  /**
   * Import, migration or snapshot restore. Validated like a commit; clears undo/redo history. With `precomputed` the
   * findings are not recomputed: they are checked (`PrecomputedFindings`), the ERROR gate runs on them, and a failed
   * check is `FINDINGS_MISMATCH`. Without it the behaviour is unchanged.
   */
  replaceState(next: CanonicalState, reason: 'import' | 'migration' | 'restore', precomputed?: PrecomputedFindings): CommitResult;
  /**
   * FOLLOWER TABS ONLY (ADR-033). Mirrors one transaction the writer persisted: incremental indexes and
   * `validateTouchedByRule` with the previous state, but no ERROR gate (the writer already validated; findings are
   * reported, never a reason to refuse a durable state), no history entry, notifies with `cause: 'remote'`. Refused
   * as a value on a writable store (`NOT_FOLLOWER`: two writers must never exist) and when `fromRevision` is not the
   * current revision (`STALE_REVISION`: the caller reloads fully). On any failure the store is unchanged.
   */
  applyRemote(change: RemoteChange): CommitResult;
  /**
   * FOLLOWER TABS ONLY (ADR-033). Adopts a state read whole from storage AT `revision` (not revision + 1): rebuilds
   * indexes, validates without a gate (or takes `precomputed` findings, checked for `revision`), clears undo/redo
   * history, notifies with `cause: 'remote'`. Refused on a writable store (`NOT_FOLLOWER`). Promotion is `reload`,
   * then the tab becomes writable.
   */
  reload(next: CanonicalState, revision: number, precomputed?: PrecomputedFindings): CommitResult;
}

/** Injected capabilities keep the core deterministic and environment-free. */
export interface CommandContext {
  /** UTC ISO timestamp. */
  now(): string;
  /** New `<prefix>_<lowercase ULID>`. */
  newId(prefix: string): string;
}

/**
 * Authoring workbench drafts. Drafts may be structurally invalid; they never enter the canonical
 * store until they pass L1–L3. Persisted in the editorSessions store for crash recovery.
 */
export interface EditorSession {
  readonly id: string;
  readonly kind: RecordKind;
  /** null while creating a new record. */
  readonly target: RecordRef | null;
  readonly baseRevision: number;
  /** The record as it was when editing began, for conflict display. */
  readonly baseRecord: AnyRecord | null;
  readonly draft: unknown;
  /** Editor-local undo/redo over the draft (separate from the global history). */
  readonly past: readonly (readonly Patch[])[];
  readonly future: readonly (readonly Patch[])[];
  readonly updatedAt: string;
}

export type DraftCommitOutcome =
  | { readonly ok: true; readonly changes: ChangeSet }
  | { readonly ok: false; readonly reason: 'invalid'; readonly findings: readonly Finding[] }
  | { readonly ok: false; readonly reason: 'conflict'; readonly current: AnyRecord | null };
