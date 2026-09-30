/**
 * The pure half of apply (step 4.2c, docs/PERSISTENCE.md §6): what the compute worker can do without any port. It checks
 * the same refusals as `applyImport` (staleness against the revision the caller says is live, BLOCKED) and hands back the
 * merged replica, the verified asset bytes, the report (minus the time and the snapshot ID, which only the applier knows)
 * and the quarantine rows. Nothing is written and nothing is consumed: the batch stays pending until the caller reports
 * how the apply ended.
 */
import type { CanonicalState } from '@/core/schema';
import type { ImportApplyErrorCode, ParsedAsset } from './contracts';
import { buildReportDraft, quarantineDraftsOf, type ApplyBatch, type ImportQuarantineDraft, type ImportReportDraft } from './import-apply';

export interface PreparedApply {
  readonly batchId: string;
  readonly fileName: string;
  /** The revision the preview was built on; the merged state is the state at `baseRevision + 1`. */
  readonly baseRevision: number;
  readonly merged: CanonicalState;
  readonly assets: readonly ParsedAsset[];
  readonly report: ImportReportDraft;
  readonly quarantine: readonly ImportQuarantineDraft[];
}

export type PrepareApplyOutcome =
  | { readonly ok: true; readonly prepared: PreparedApply }
  | { readonly ok: false; readonly code: Extract<ImportApplyErrorCode, 'UNKNOWN_BATCH' | 'PLAN_MISMATCH' | 'STALE_REVISION' | 'BLOCKED'>; readonly message: string };

export const STALE_MESSAGE = 'data changed since the preview; run it again';

/** `liveRevision` is what the caller's dataset is at now; the batch is only valid while it equals the revision it was built on. */
export function prepareImportApply(batch: ApplyBatch, liveRevision: number): PrepareApplyOutcome {
  if (liveRevision !== batch.baseRevision) return { ok: false, code: 'STALE_REVISION', message: STALE_MESSAGE };
  if (!batch.plan.preview.canConfirm) {
    return { ok: false, code: 'BLOCKED', message: `the merged result cannot be confirmed: ${batch.plan.preview.blockers.join('; ')}` };
  }
  return {
    ok: true,
    prepared: {
      batchId: batch.batchId,
      fileName: batch.fileName,
      baseRevision: batch.baseRevision,
      merged: batch.merged,
      assets: batch.stagedAssets,
      report: buildReportDraft(batch, batch.baseRevision + 1),
      quarantine: quarantineDraftsOf(batch),
    },
  };
}
