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
 * are detected by step 3.6 but converted from step 3.8 on, so they are refused here as a value.
 */
import type { IdFactory } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { canonicalJson } from './canonical-json';
import type { ImportParseResult, ImportPlan, ImportPlanRequest, ImportPreviewOutcome, ImportApplyResult, TaskOptions } from './contracts';
import { applyImport, type ApplyBatch } from './import-apply';
import { analyzeConflicts } from './import-conflicts';
import { buildMergedReplica } from './import-merge';
import { assemblePlan } from './import-preview';
import type { AssetStagePort, ImportBatchSink, ImportStorePort, SnapshotPort } from './import-ports';
import { resolveRequest } from './import-request';
import { validateMerged } from './import-validate';

export interface ImportSessionDeps {
  readonly store: ImportStorePort;
  readonly ids: IdFactory;
  readonly snapshots: SnapshotPort;
  readonly batches: ImportBatchSink;
  readonly assetStage: AssetStagePort;
}

export interface PreviewInput {
  readonly parsed: ImportParseResult;
  readonly fileName: string;
  readonly request?: ImportPlanRequest;
}

export interface ImportSession {
  /** Builds a preview and plan for a parsed file; on success it becomes THE pending batch (an earlier one is discarded). */
  preview(input: PreviewInput, task?: TaskOptions): ImportPreviewOutcome;
  /** A new plan for the pending batch with the FULL desired request (not a delta); a new `batchId`, the old one is discarded. */
  revise(batchId: string, request: ImportPlanRequest, task?: TaskOptions): ImportPreviewOutcome;
  apply(batchId: string, plan: ImportPlan): Promise<ImportApplyResult>;
  /** Discards the pending batch if it is `batchId`; false for an unknown batch. Changes nothing else. */
  cancel(batchId: string): boolean;
  pendingBatchId(): string | undefined;
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

  function build(parsed: ImportParseResult, fileName: string, copyIds: Map<string, string>, request: ImportPlanRequest | undefined, task: TaskOptions): { readonly ok: true; readonly batch: Pending } | Extract<ImportPreviewOutcome, { ok: false }> {
    const aborted = { ok: false, code: 'CANCELLED', message: 'import preview aborted' } as const;
    const live: CanonicalState = deps.store.getState();
    const baseRevision = deps.store.getRevision();
    if (isAborted(task.signal)) return aborted;

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
    const plan = assemblePlan({ batchId, parsed, analysis, request: resolved.value, merge, validation: validated.validation });
    task.onProgress?.(4, 4, 'planned');
    return { ok: true, batch: { batchId, fileName, baseRevision, merged: merge.state, stagedAssets: merge.stagedAssets, plan, parsed, copyIds } };
  }

  function install(batch: Pending): ImportPreviewOutcome {
    pending = batch;
    return { ok: true, plan: batch.plan };
  }

  return {
    preview(input, task = {}) {
      const { parsed } = input;
      if (parsed.format === 'legacy_v6' || parsed.format === 'legacy_v4') {
        return { ok: false, code: 'LEGACY_NOT_CONVERTED', message: `a ${parsed.format} export is detected but is converted only from step 3.8; nothing can be previewed yet` };
      }
      const built = build(parsed, input.fileName, new Map(), input.request, task);
      return built.ok ? install(built.batch) : built;
    },

    revise(batchId, request, task = {}) {
      const current = pending;
      if (current === undefined || current.batchId !== batchId) return { ok: false, code: 'UNKNOWN_BATCH', message: UNKNOWN };
      const built = build(current.parsed, current.fileName, current.copyIds, request, task);
      return built.ok ? install(built.batch) : built;
    },

    async apply(batchId, plan) {
      const batch = pending;
      if (batch === undefined || batch.batchId !== batchId) return { ok: false, code: 'UNKNOWN_BATCH', message: UNKNOWN };
      const submitted = planIdentity(plan);
      if (submitted === undefined || submitted !== planIdentity(batch.plan)) {
        return { ok: false, code: 'PLAN_MISMATCH', message: 'the plan differs from the one that was previewed; revise it to get a new preview, then confirm that one' };
      }
      return applyImport(deps, batch, {
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
  };
}
