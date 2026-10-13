/**
 * The import session (docs/PERSISTENCE.md §6, IMPLEMENTATION_PLAN.md step 3.7): preview → (revise) → apply | cancel.
 *
 * Pending batch (Q12): at most ONE. A successful `preview` or `revise` replaces it, `cancel` discards it, apply consumes it.
 * The merged replica lives here, behind the `batchId`, in-process now and in the compute worker from Phase 4; `apply` takes the
 * `batchId` plus the plan the user confirmed and refuses as a value when the batch is unknown, when the plan differs from the
 * previewed one, or when the live revision is no longer the one the preview was built on. Preview, revise and cancel never
 * change live state, the snapshot store or the batch store (INV-21): only `apply` writes, and only after its snapshot.
 *
 * Determinism: IDs (the batch, `import_as_copy` copies) and the report time come from the injected `IdFactory`. Legacy formats
 * are detected by step 3.6 and converted here (step 3.11c, `import-legacy.ts`) on every preview and revise, so preview and revise are async.
 */
import type { IdFactory } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { canonicalJson } from './canonical-json';
import { convertLegacy } from './import-legacy';
import type { ImportDecision, ImportParseResult, LegacyImportReport, ImportPlan, ImportPlanRequest, ImportPreviewOutcome, ImportApplyResult, TaskOptions } from './contracts';
import { applyImport, type ApplyBatch, type ImportApplyDeps } from './import-apply';
import { prepareImportApply, type PrepareApplyOutcome } from './import-prepare';
import { analyzeConflicts } from './import-conflicts';
import { buildMergedReplica } from './import-merge';
import { assemblePlan } from './import-preview';
import type { AssetStagePort, ImportBatchSink, ImportStorePort, SnapshotPort } from './import-ports';
import { resolveRequest } from './import-request';
import { validateMerged } from './import-validate';

export interface ImportSessionDeps {
  /** A session that only previews needs `getState` and `getRevision`; `apply` needs the whole port. */
  readonly store: Pick<ImportStorePort, 'getState' | 'getRevision'> & Partial<ImportStorePort>;
  readonly ids: IdFactory;
  /**
   * The write ports of `apply`. A session without them (the compute worker's, step 4.2c) previews, revises, cancels and
   * `prepareApply`s; its `apply` answers `REJECTED` as a value. Give all three or none.
   */
  readonly snapshots?: SnapshotPort;
  readonly batches?: ImportBatchSink;
  readonly assetStage?: AssetStagePort;
}

export interface PreviewInput {
  readonly parsed: ImportParseResult;
  readonly fileName: string;
  readonly request?: ImportPlanRequest;
}

export interface ImportSession {
  /** Builds a preview and plan for a parsed file; on success it becomes THE pending batch (an earlier one is discarded). */
  preview(input: PreviewInput, task?: TaskOptions): Promise<ImportPreviewOutcome>;
  /** A new plan for the pending batch with the FULL desired request (not a delta); a new `batchId`, the old one is discarded. */
  revise(batchId: string, request: ImportPlanRequest, task?: TaskOptions): Promise<ImportPreviewOutcome>;
  apply(batchId: string, plan: ImportPlan): Promise<ImportApplyResult>;
  /**
   * The pure half of `apply` (step 4.2c): the refusals and the payload, nothing written. `liveRevision` is the caller's
   * current revision; the batch is valid only while it equals the revision the preview was built on (a stale one is
   * consumed, as in `apply`). A success leaves the batch pending: call `consume` once the apply succeeded.
   */
  prepareApply(batchId: string, plan: ImportPlan, liveRevision: number): PrepareApplyOutcome;
  /** The batch is used up (an apply the caller carried out succeeded). False for an unknown batch. */
  consume(batchId: string): boolean;
  /** Discards the pending batch if it is `batchId`; false for an unknown batch. Changes nothing else. */
  cancel(batchId: string): boolean;
  pendingBatchId(): string | undefined;
  /** The revision the pending batch was built on. */
  pendingBaseRevision(): number | undefined;
}

interface Pending extends ApplyBatch {
  readonly parsed: ImportParseResult;
  /** old → new IDs already handed out for `import_as_copy`, kept across revisions so a plan's copy IDs do not shuffle. */
  readonly copyIds: Map<string, string>;
}

/** Only what apply does; `preview` inside the plan is derived from it, so it is not compared field by field. */
function planIdentity(plan: ImportPlan): string | undefined {
  return canonicalJson({
    batchId: plan.preview.batchId,
    mode: plan.mode,
    decisions: plan.decisions,
    conflicts: plan.conflicts,
    excluded: plan.excluded,
    copyIdMap: plan.copyIdMap,
  });
}

const isAborted = (signal: AbortSignal | undefined): boolean => signal?.aborted === true;

const UNKNOWN = 'no such pending import: it was cancelled, replaced by a newer preview, or already applied';

export function createImportSession(deps: ImportSessionDeps): ImportSession {
  let pending: Pending | undefined;

  async function build(source: ImportParseResult, fileName: string, copyIds: Map<string, string>, request: ImportPlanRequest | undefined, task: TaskOptions): Promise<{ readonly ok: true; readonly batch: Pending } | Extract<ImportPreviewOutcome, { ok: false }>> {
    const aborted = { ok: false, code: 'CANCELLED', message: 'import preview aborted' } as const;
    const live: CanonicalState = deps.store.getState();
    const baseRevision = deps.store.getRevision();
    if (isAborted(task.signal)) return aborted;

    const legacyFormat = source.format === 'legacy_v6' || source.format === 'legacy_v4';
    if (!legacyFormat && request?.decisions !== undefined && request.decisions.length > 0) return { ok: false, code: 'INVALID_REQUEST', message: 'preview decisions exist only for legacy imports' };
    let parsed = source;
    let legacy: { readonly report: LegacyImportReport; readonly decisions: readonly ImportDecision[] } | undefined;
    if (legacyFormat) {
      // Static import (2026-10-13, 5.10a review): a dynamic chunk that imports shared code from a worker entry makes WebKit
      // evaluate the entry a second time, and the second instance has no replica.
      const converted = await convertLegacy({ parsed: source, live, now: () => deps.ids.now(), request });
      if (!converted.ok) return { ok: false, code: converted.code, message: converted.message };
      if (isAborted(task.signal)) return aborted;
      parsed = converted.parsed;
      legacy = { report: converted.report, decisions: converted.decisions };
    }

    const analysis = analyzeConflicts(live, parsed);
    task.onProgress?.(1, 4, 'conflicts');
    const resolved = resolveRequest(request, analysis);
    if (!resolved.ok) return { ok: false, code: 'INVALID_REQUEST', message: resolved.message };

    const merge = buildMergedReplica({ live, parsed, analysis, request: resolved.value, copyIds, ids: deps.ids });
    if (!merge.ok) return { ok: false, code: merge.code, message: merge.message };
    task.onProgress?.(2, 4, 'merged');
    if (isAborted(task.signal)) return aborted;

    const validated = validateMerged(merge.state, baseRevision + 1, task.signal);
    if (!validated.ok) return aborted;
    task.onProgress?.(3, 4, 'validated');

    const batchId = deps.ids.newId('imp');
    const plan = assemblePlan({ batchId, parsed, analysis, request: resolved.value, merge, validation: validated.validation, ...(legacy === undefined ? {} : { legacy }) });
    task.onProgress?.(4, 4, 'planned');
    return { ok: true, batch: { batchId, fileName, baseRevision, merged: merge.state, stagedAssets: merge.stagedAssets, plan, parsed: source, copyIds } };
  }

  /** The pending batch when `batchId` names it and `plan` is the one that was previewed; otherwise the refusal as a value. */
  function checkedBatch(batchId: string, plan: ImportPlan): Pending | Extract<PrepareApplyOutcome, { ok: false }> {
    const batch = pending;
    if (batch === undefined || batch.batchId !== batchId) return { ok: false, code: 'UNKNOWN_BATCH', message: UNKNOWN };
    const submitted = planIdentity(plan);
    if (submitted === undefined || submitted !== planIdentity(batch.plan)) {
      return { ok: false, code: 'PLAN_MISMATCH', message: 'the plan differs from the one that was previewed; revise it to get a new preview, then confirm that one' };
    }
    return batch;
  }

  function install(batch: Pending): ImportPreviewOutcome {
    pending = batch;
    return { ok: true, plan: batch.plan };
  }

  return {
    async preview(input, task = {}) {
      const built = await build(input.parsed, input.fileName, new Map(), input.request, task);
      return built.ok ? install(built.batch) : built;
    },

    async revise(batchId, request, task = {}) {
      const current = pending;
      if (current === undefined || current.batchId !== batchId) return { ok: false, code: 'UNKNOWN_BATCH', message: UNKNOWN };
      const built = await build(current.parsed, current.fileName, current.copyIds, request, task);
      return built.ok ? install(built.batch) : built;
    },

    prepareApply(batchId, plan, liveRevision) {
      const batch = checkedBatch(batchId, plan);
      if ('code' in batch) return batch;
      const prepared = prepareImportApply(batch, liveRevision);
      if (!prepared.ok && prepared.code === 'STALE_REVISION') pending = undefined;
      return prepared;
    },

    consume(batchId) {
      if (pending === undefined || pending.batchId !== batchId) return false;
      pending = undefined;
      return true;
    },

    async apply(batchId, plan) {
      const batch = checkedBatch(batchId, plan);
      if ('code' in batch) return batch;
      const { snapshots, batches, assetStage, store } = deps;
      if (snapshots === undefined || batches === undefined || assetStage === undefined || store.isReadOnly === undefined || store.replaceState === undefined) {
        return { ok: false, code: 'REJECTED', message: 'this import session has no write ports (it only prepares an apply); nothing was imported' };
      }
      const applyDeps: ImportApplyDeps = { store: store as ImportStorePort, ids: deps.ids, snapshots, batches, assetStage };
      return applyImport(applyDeps, batch, {
        stillPending: () => pending === batch,
        consume: () => {
          if (pending === batch) pending = undefined;
        },
      });
    },

    cancel(batchId) {
      if (pending === undefined || pending.batchId !== batchId) return false;
      pending = undefined;
      return true;
    },

    pendingBatchId: () => pending?.batchId,
    pendingBaseRevision: () => pending?.baseRevision,
  };
}
