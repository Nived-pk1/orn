/**
 * Apply (docs/PERSISTENCE.md §6, INV-21): `pre_import` snapshot → ONE `replaceState` of the previewed merged replica (both
 * modes) → history cleared (by `replaceState`) → batch report. Nothing is changed before the snapshot exists, and a refusal
 * by the store removes the snapshot again and changes nothing. Every failure is a value.
 *
 * The staleness rule (Q12): the live revision must still be the one the preview was built on, checked before AND after the
 * snapshot is written (it is asynchronous); anything else is refused ("data changed since the preview; run it again").
 * The asset bytes are staged just before `replaceState`, which notifies the write queue synchronously, so they reach
 * IndexedDB in the same transaction as their records (Q1).
 */
import type { JsonValue, CanonicalState } from '@/core/schema';
import type { IdFactory } from '@/core/dataset';
import type { ImportApplyResult, ImportBatchReport, ImportPlan, ParsedAsset } from './contracts';
import type { AssetStagePort, ImportBatchSink, ImportQuarantineRowLike, ImportStorePort, SnapshotPort } from './import-ports';

export interface ImportApplyDeps {
  readonly store: ImportStorePort;
  readonly ids: IdFactory;
  readonly snapshots: SnapshotPort;
  readonly batches: ImportBatchSink;
  readonly assetStage: AssetStagePort;
}

/** What apply needs from the pending batch. */
export interface ApplyBatch {
  readonly batchId: string;
  readonly fileName: string;
  readonly baseRevision: number;
  readonly merged: CanonicalState;
  readonly stagedAssets: readonly ParsedAsset[];
  readonly plan: ImportPlan;
}

export interface ApplyHooks {
  /** False once the batch was cancelled or superseded by a new preview while apply was waiting on the snapshot. */
  readonly stillPending: () => boolean;
  /** The batch is used up (applied or found stale): it can never be applied again. */
  readonly consume: () => void;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const STALE = 'data changed since the preview; run it again';

async function discardSnapshot(deps: ImportApplyDeps, id: string): Promise<void> {
  await deps.snapshots.deleteSnapshot(id).catch(() => undefined);
}

/** What only the applier fills in: when it was applied and the `pre_import` snapshot's ID. Everything else is known at preview time. */
export type ImportReportDraft = Omit<ImportBatchReport, 'appliedAt' | 'snapshotId'>;

/** A quarantined import item as a row, minus the time it is stored (the applier's clock). */
export type ImportQuarantineDraft = Omit<ImportQuarantineRowLike, 'createdAt'>;

/** Everything the report says except when it was applied and the snapshot: the compute worker builds this (step 4.2c). */
export function buildReportDraft(batch: ApplyBatch, revisionAfter: number): ImportReportDraft {
  const { plan } = batch;
  const { preview } = plan;
  return {
    batchId: batch.batchId,
    fileName: batch.fileName,
    format: preview.format,
    mode: plan.mode,
    revisionBefore: batch.baseRevision,
    revisionAfter,
    mergedRecordCount: preview.mergedRecordCount,
    counts: preview.counts,
    conflicts: plan.conflicts,
    excluded: plan.excluded,
    copyIdMap: plan.copyIdMap,
    decisions: plan.decisions,
    richTextLinksRewritten: preview.richTextLinksRewritten,
    unsafeKeysRenamed: preview.unsafeKeysRenamed.length,
    quarantinedCount: preview.quarantined.length,
    rejectedAssets: preview.rejectedAssets,
    assets: preview.assets,
    findingSummary: preview.findingSummary,
    ...(preview.legacyReport === undefined ? {} : { legacyReport: preview.legacyReport }),
  };
}

export const completeReport = (draft: ImportReportDraft, appliedAt: string, snapshotId: string): ImportBatchReport => ({ ...draft, appliedAt, snapshotId });

export function quarantineDraftsOf(batch: Pick<ApplyBatch, 'batchId' | 'plan'>): readonly ImportQuarantineDraft[] {
  return batch.plan.preview.quarantined.map((item, index) => ({
    id: `qtn_${batch.batchId}-${index}`,
    source: 'import',
    importBatchId: batch.batchId,
    ...(item.claimedKind === undefined ? {} : { claimedKind: item.claimedKind }),
    raw: item.raw,
    ...(item.rawTruncated === undefined ? {} : { rawTruncated: item.rawTruncated }),
    issues: item.issues,
  }));
}

/** Stores the batch report and its quarantine rows; a failure is reported, never thrown (the import itself is already applied). */
export async function storeImportReport(sink: ImportBatchSink, report: ImportBatchReport, drafts: readonly ImportQuarantineDraft[]): Promise<string | undefined> {
  const problems: string[] = [];
  try {
    await sink.saveImportBatch({ id: report.batchId, createdAt: report.appliedAt, report: report as unknown as JsonValue });
  } catch (error) {
    problems.push(`the batch report was not stored (${messageOf(error)})`);
  }
  const rows: ImportQuarantineRowLike[] = drafts.map((draft) => ({ ...draft, createdAt: report.appliedAt }));
  if (rows.length > 0) {
    try {
      await sink.addQuarantine(rows);
    } catch (error) {
      problems.push(`the quarantine rows were not stored (${messageOf(error)})`);
    }
  }
  return problems.length === 0 ? undefined : problems.join('; ');
}

export async function applyImport(deps: ImportApplyDeps, batch: ApplyBatch, hooks: ApplyHooks): Promise<ImportApplyResult> {
  const { store } = deps;
  if (store.isReadOnly()) return { ok: false, code: 'READ_ONLY', message: 'this tab is not the writer; nothing was imported' };
  if (store.getRevision() !== batch.baseRevision) {
    hooks.consume();
    return { ok: false, code: 'STALE_REVISION', message: STALE };
  }
  if (!batch.plan.preview.canConfirm) {
    return { ok: false, code: 'BLOCKED', message: `the merged result cannot be confirmed: ${batch.plan.preview.blockers.join('; ')}` };
  }

  let snapshotId: string;
  try {
    const taken = await deps.snapshots.createSnapshot('pre_import', store.getState(), batch.baseRevision, `before importing ${batch.fileName}`);
    snapshotId = taken.id;
  } catch (error) {
    return { ok: false, code: 'SNAPSHOT_FAILED', message: `the pre_import snapshot could not be written, so nothing was imported (${messageOf(error)})` };
  }
  if (!hooks.stillPending()) {
    await discardSnapshot(deps, snapshotId);
    return { ok: false, code: 'UNKNOWN_BATCH', message: 'the import was cancelled or replaced by a newer preview; nothing was imported' };
  }
  if (store.getRevision() !== batch.baseRevision) {
    await discardSnapshot(deps, snapshotId);
    hooks.consume();
    return { ok: false, code: 'STALE_REVISION', message: STALE };
  }

  let committed: ReturnType<ImportStorePort['replaceState']>;
  try {
    if (batch.stagedAssets.length > 0) deps.assetStage.stage(batch.stagedAssets);
    committed = store.replaceState(batch.merged, 'import');
  } catch (error) {
    await discardSnapshot(deps, snapshotId);
    return { ok: false, code: 'REJECTED', message: `the import could not be applied (${messageOf(error)}); nothing was changed` };
  } finally {
    deps.assetStage.clear();
  }
  if (!committed.ok) {
    await discardSnapshot(deps, snapshotId);
    return { ok: false, code: committed.error.code === 'READ_ONLY' ? 'READ_ONLY' : 'REJECTED', message: committed.error.message, error: committed.error };
  }
  hooks.consume();

  const revision = committed.changes.revision;
  const report = completeReport(buildReportDraft(batch, revision), deps.ids.now(), snapshotId);
  const reportError = await storeImportReport(deps.batches, report, quarantineDraftsOf(batch));
  return { ok: true, revision, snapshotId, report, reportSaved: reportError === undefined, ...(reportError === undefined ? {} : { reportError }) };
}
