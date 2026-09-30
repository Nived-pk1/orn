/**
 * The canonical store (docs/ARCHITECTURE.md §2.4 and §23). Every change goes through one commit path:
 *
 *   plan + Immer patches → ChangeSet → indexes.apply → L1–L3 validateTouched
 *     → any ERROR ⇒ reject, state, indexes and findings unchanged (INV-12)
 *     → commit: revision + 1, history entry, finding store, subscribers.
 *
 * Undo, redo and replaceState use the same commit step, so they are validated and announced like any
 * other change. A follower tab (read-only) mirrors the writer through `applyRemote` and `reload` (ADR-033). The core is environment-free: time and IDs are injected by the callers that need them.
 */
import { applyPatches, enablePatches, freeze, type Patch } from 'immer';
import { assembleChangeSet } from '../dataset/changeset';
import type { ChangeSet } from '../dataset/contracts';
import type { CoreIndexes } from '../indexes/contracts';
import { coreIndexEngine } from '../indexes/engine';
import type { CanonicalState, RecordRef } from '../schema';
import { createFindingStore } from '../validation/store';
import { commitFindings, commitTouched, validator as defaultValidator } from '../validation/validator';
import type { Finding, FindingStore, Validator } from '../validation/contracts';
import { runBatch } from './batch';
import type { CanonicalStore, CommandEnvelope, CommandError, CommitResult, HistoryEntry, PrecomputedFindings, RemoteChange } from './contracts';
import { createHistory, DEFAULT_HISTORY_LIMITS, type HistoryLimits } from './history';
import { computeDeleteImpact } from './impact';
import { allRefs } from './lookup';
import { checkPrecomputed, differsFrom } from './precomputed';
import { planRemote } from './remote';
import { replacementPatches, shapeProblem } from './replace';

enablePatches();

export interface StoreOptions {
  readonly initial: CanonicalState;
  /** Revision of `initial` (from persistence); default 0. */
  readonly revision?: number;
  /** Read-only tabs (another tab holds the write lock). Consulted on every call; a follower is read-only until promoted. */
  readonly readOnly?: () => boolean;
  readonly validator?: Validator;
  readonly findings?: FindingStore;
  readonly historyLimits?: HistoryLimits;
  /** Run `validateAll` on `initial` to fill the finding store (default true). Errors do not stop construction. */
  readonly validateInitial?: boolean;
  /** Tests only, default false: `replaceState`/`reload` with precomputed findings also run `validateAll` and refuse `FINDINGS_MISMATCH` if they differ. */
  readonly verifyPrecomputed?: boolean;
  /** Called when a subscriber throws; the others still run. Default: rethrow from a microtask so it stays visible. */
  readonly onListenerError?: (error: unknown) => void;
}

/** The contract plus what the app shell needs to read: findings, the index handle, the next history entries. */
export interface StoreHandle extends CanonicalStore {
  readonly findings: FindingStore;
  /** The indexes of the current revision. Stale after the next commit: fetch again, do not cache. */
  getIndexes(): CoreIndexes;
  /** Entries the next undo / redo would act on (their `selectionHint` says what to select afterwards). */
  peekHistory(): { readonly undo?: HistoryEntry; readonly redo?: HistoryEntry };
}

const rethrowLater = (error: unknown): void => queueMicrotask(() => {
  throw error;
});

const failure = (error: CommandError): CommitResult => ({ ok: false, error });

const notFollower = (method: string): CommandError => ({
  code: 'NOT_FOLLOWER',
  message: `${method} is for a read-only follower tab; this store is writable, and two tabs must never write (INV-28).`,
});

interface Commit {
  readonly label: string;
  readonly cause: ChangeSet['cause'];
  readonly next: CanonicalState;
  readonly patches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
}

export function createCanonicalStore(options: StoreOptions): StoreHandle {
  const validator = options.validator ?? defaultValidator;
  const findings = options.findings ?? createFindingStore();
  const history = createHistory(options.historyLimits ?? DEFAULT_HISTORY_LIMITS);
  const listeners = new Set<(changes: ChangeSet) => void>();
  const onListenerError = options.onListenerError ?? rethrowLater;
  const isReadOnly = (): boolean => options.readOnly?.() ?? false;

  let state = freeze(options.initial, true);
  let revision = options.revision ?? 0;
  let indexes: CoreIndexes = coreIndexEngine.build(state, revision);
  if (options.validateInitial !== false) commitFindings(findings, allRefs(state), validator.validateAll(state, indexes));

  // Notifications are queued so a subscriber that dispatches sees commits announced in order.
  const pending: ChangeSet[] = [];
  let notifying = false;
  const notify = (changes: ChangeSet): void => {
    pending.push(changes);
    if (notifying) return;
    notifying = true;
    try {
      for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
        for (const listener of [...listeners]) {
          try {
            listener(next);
          } catch (error) {
            onListenerError(error);
          }
        }
      }
    } finally {
      notifying = false;
    }
  };

  /** The shared commit step. On any failure the store is exactly as before the call. */
  function commit(input: Commit): { readonly result: CommitResult; readonly changes?: ChangeSet } {
    const changes = assembleChangeSet({
      revision: revision + 1,
      label: input.label,
      cause: input.cause,
      before: state,
      after: input.next,
      patches: input.patches,
      inversePatches: input.inversePatches,
    });
    try {
      const nextIndexes = coreIndexEngine.apply(indexes, changes, input.next);
      const touched: RecordRef[] = [...changes.created, ...changes.updated, ...changes.deleted];
      // One call (ADR-032): whole subjects for what the commit touched, per-rule results for referrers whose
      // rules read what changed; `state` is always the previous state, so nothing is re-run needlessly.
      const validation = validator.validateTouchedByRule(input.next, nextIndexes, touched, state, findings);
      const found: readonly Finding[] = validation.all;
      const errors = found.filter((finding) => finding.severity === 'error');
      if (errors.length > 0) {
        // Roll the indexes back incrementally instead of an O(dataset) rebuild
        // (docs/PERFORMANCE_ARCHITECTURE.md §4): `apply` consumed the old handle, but the inverse
        // ChangeSet undoes exactly what it did, through the same apply path (engine.ts's `rollback`
        // case), landing back on `revision` with a fresh, non-stale handle (INV-18 still holds).
        const rollback = assembleChangeSet({
          revision,
          label: input.label,
          cause: input.cause,
          before: input.next,
          after: state,
          patches: input.inversePatches,
          inversePatches: input.patches,
        });
        indexes = coreIndexEngine.apply(nextIndexes, rollback, state);
        return {
          result: failure({
            code: 'VALIDATION_FAILED',
            message: `${errors.length} validation error(s); nothing was changed.`,
            findings: errors,
          }),
        };
      }
      state = input.next;
      revision = changes.revision;
      indexes = nextIndexes;
      commitTouched(findings, validation);
      return { result: { ok: true, changes, findings: found }, changes };
    } catch (error) {
      indexes = coreIndexEngine.build(state, revision);
      return { result: failure({ code: 'INTERNAL', message: `Commit failed: ${String(error)}` }) };
    }
  }

  /** The findings a whole-state adoption uses: recomputed, or the checked precomputed ones. Refusal is a value. */
  function findingsOf(replacement: CanonicalState, nextIndexes: CoreIndexes, precomputed: PrecomputedFindings | undefined): readonly Finding[] | CommandError {
    if (precomputed === undefined) return validator.validateAll(replacement, nextIndexes);
    return (options.verifyPrecomputed === true ? differsFrom(precomputed.findings, validator.validateAll(replacement, nextIndexes)) : undefined) ?? precomputed.findings;
  }

  function travel(direction: 'undo' | 'redo'): CommitResult | null {
    const entry = direction === 'undo' ? history.peekUndo() : history.peekRedo();
    if (entry === undefined) return null;
    if (isReadOnly()) return failure({ code: 'READ_ONLY', message: 'This tab is read-only.' });
    const patches = direction === 'undo' ? entry.inversePatches : entry.patches;
    const inversePatches = direction === 'undo' ? entry.patches : entry.inversePatches;
    let next: CanonicalState;
    try {
      next = applyPatches(state, patches as Patch[]);
    } catch (error) {
      return failure({ code: 'INTERNAL', message: `Could not ${direction}: ${String(error)}` });
    }
    const { result, changes } = commit({ label: entry.label, cause: direction, next, patches, inversePatches });
    if (changes === undefined) return result;
    if (direction === 'undo') history.markUndone();
    else history.markRedone();
    notify(changes);
    return result;
  }

  return {
    findings,
    getIndexes: () => indexes,
    peekHistory() {
      const undo = history.peekUndo();
      const redo = history.peekRedo();
      return { ...(undo === undefined ? {} : { undo }), ...(redo === undefined ? {} : { redo }) };
    },

    getState: () => state,
    getRevision: () => revision,
    isReadOnly,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispatch(envelope: CommandEnvelope): CommitResult {
      if (isReadOnly()) return failure({ code: 'READ_ONLY', message: 'This tab is read-only.' });
      if (envelope.commands.length === 0) return failure({ code: 'EMPTY_COMMAND', message: 'The envelope has no commands.' });
      if (envelope.expectedRevision !== undefined && envelope.expectedRevision !== revision) {
        return failure({
          code: 'STALE_REVISION',
          message: `Expected revision ${envelope.expectedRevision} but the store is at ${revision}.`,
        });
      }
      const batch = runBatch(state, indexes, envelope.commands);
      if (!batch.ok) return failure(batch.error);
      if (batch.patches.length === 0) {
        return failure({ code: 'EMPTY_COMMAND', message: 'The commands change nothing.' });
      }
      const { result, changes } = commit({
        label: envelope.label,
        cause: 'command',
        next: batch.next,
        patches: batch.patches,
        inversePatches: batch.inversePatches,
      });
      if (changes === undefined) return result;
      history.record({
        label: envelope.label,
        revisionBefore: changes.revision - 1,
        revisionAfter: changes.revision,
        patches: batch.patches,
        inversePatches: batch.inversePatches,
        ...(envelope.selectionHint === undefined ? {} : { selectionHint: envelope.selectionHint }),
      });
      notify(changes);
      return result;
    },

    deleteImpact: (refs) => computeDeleteImpact(state, indexes, refs),

    undo: () => travel('undo'),
    redo: () => travel('redo'),
    canUndo: () => !isReadOnly() && history.peekUndo() !== undefined,
    canRedo: () => !isReadOnly() && history.peekRedo() !== undefined,
    historyLabels: () => history.labels(),

    applyRemote(change: RemoteChange): CommitResult {
      if (!isReadOnly()) return failure(notFollower('applyRemote'));
      if (change.fromRevision !== revision) {
        return failure({ code: 'STALE_REVISION', message: `The change continues from revision ${change.fromRevision} but this store is at ${revision}; reload.` });
      }
      if (!Number.isInteger(change.revision) || change.revision <= revision) {
        return failure({ code: 'STALE_REVISION', message: `The change ends at revision ${change.revision}, not after ${revision}; nothing to apply.` });
      }
      const plan = planRemote(state, change);
      const changes = assembleChangeSet({
        revision: change.revision,
        label: 'Change from the writer tab',
        cause: 'remote',
        before: state,
        after: plan.next,
        patches: plan.patches,
        inversePatches: plan.inversePatches,
      });
      try {
        const nextIndexes = coreIndexEngine.apply(indexes, changes, plan.next);
        const touched: RecordRef[] = [...changes.created, ...changes.updated, ...changes.deleted];
        // No ERROR gate: the writer already accepted this state and it is durable. Errors become findings, visibly.
        const validation = validator.validateTouchedByRule(plan.next, nextIndexes, touched, state, findings);
        state = plan.next;
        revision = changes.revision;
        indexes = nextIndexes;
        commitTouched(findings, validation);
        history.clear();
        notify(changes);
        return { ok: true, changes, findings: validation.all };
      } catch (error) {
        indexes = coreIndexEngine.build(state, revision);
        return failure({ code: 'INTERNAL', message: `Could not apply the writer's change: ${String(error)}` });
      }
    },

    reload(next, adoptedRevision, precomputed): CommitResult {
      if (!isReadOnly()) return failure(notFollower('reload'));
      if (!Number.isInteger(adoptedRevision) || adoptedRevision < 0) {
        return failure({ code: 'STALE_REVISION', message: `Revision ${String(adoptedRevision)} is not a non-negative integer.` });
      }
      const problem = shapeProblem(next) ?? (precomputed === undefined ? undefined : checkPrecomputed(next, adoptedRevision, precomputed));
      if (problem !== undefined) return failure(problem);
      const replacement = freeze(next, true);
      const nextIndexes = coreIndexEngine.build(replacement, adoptedRevision);
      const found = findingsOf(replacement, nextIndexes, precomputed);
      if ('code' in found) return failure(found);
      const changes = assembleChangeSet({
        revision: adoptedRevision,
        label: 'Reload from storage',
        cause: 'remote',
        before: state,
        after: replacement,
        patches: replacementPatches(state, replacement),
        inversePatches: replacementPatches(replacement, state),
      });
      const scope = [...allRefs(state), ...allRefs(replacement)];
      state = replacement;
      revision = adoptedRevision;
      indexes = nextIndexes;
      commitFindings(findings, [...new Map(scope.map((ref) => [`${ref.kind}:${ref.id}`, ref] as const)).values()], found);
      history.clear();
      notify(changes);
      return { ok: true, changes, findings: found };
    },

    replaceState(next, reason, precomputed): CommitResult {
      if (isReadOnly()) return failure({ code: 'READ_ONLY', message: 'This tab is read-only.' });
      const problem = shapeProblem(next) ?? (precomputed === undefined ? undefined : checkPrecomputed(next, revision + 1, precomputed));
      if (problem !== undefined) return failure(problem);
      const replacement = freeze(next, true);
      const nextIndexes = coreIndexEngine.build(replacement, revision + 1);
      const found = findingsOf(replacement, nextIndexes, precomputed);
      if ('code' in found) return failure(found);
      const errors = found.filter((finding) => finding.severity === 'error');
      if (errors.length > 0) {
        return failure({
          code: 'VALIDATION_FAILED',
          message: `The ${reason} has ${errors.length} validation error(s); nothing was changed.`,
          findings: errors,
        });
      }
      const changes = assembleChangeSet({
        revision: revision + 1,
        label: `Replace state (${reason})`,
        cause: 'replace',
        before: state,
        after: replacement,
        patches: replacementPatches(state, replacement),
        inversePatches: replacementPatches(replacement, state),
      });
      const scope = [...allRefs(state), ...allRefs(replacement)];
      state = replacement;
      revision = changes.revision;
      indexes = nextIndexes;
      commitFindings(findings, [...new Map(scope.map((ref) => [`${ref.kind}:${ref.id}`, ref] as const)).values()], found);
      history.clear();
      notify(changes);
      return { ok: true, changes, findings: found };
    },
  };
}
