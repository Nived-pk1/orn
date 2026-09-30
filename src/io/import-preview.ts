/**
 * Assembles the `ImportPlan` (and its `ImportPreview`) from the three pure stages — conflict analysis, merged replica,
 * merged-replica validation. Plain, structured-clone-safe data only (no Map/Set/class): the preview travels to the UI.
 */
import type { RecordKind } from '@/core/schema';
import type { ConflictAnalysis } from './import-conflicts';
import type { ImportDecision, ImportParseResult, ImportPlan, ImportPreview, IdConflict, LegacyImportReport } from './contracts';
import type { MergeOutcome } from './import-merge';
import type { ResolvedRequest } from './import-request';
import type { MergedValidation } from './import-validate';

export interface AssembleInput {
  readonly batchId: string;
  readonly parsed: ImportParseResult;
  readonly analysis: ConflictAnalysis;
  readonly request: ResolvedRequest;
  readonly merge: Extract<MergeOutcome, { ok: true }>;
  readonly validation: MergedValidation;
  /** Legacy imports (step 3.11c): the full report and the decisions in force. */
  readonly legacy?: { readonly report: LegacyImportReport; readonly decisions: readonly ImportDecision[] };
}

function conflictsOf(analysis: ConflictAnalysis, request: ResolvedRequest): readonly IdConflict[] {
  if (request.mode === 'replace_all') return [];
  return analysis.conflicts.map((entry) => ({
    ref: { kind: entry.incoming.kind, id: entry.incoming.id } as IdConflict['ref'],
    resolution: request.resolutions.get(entry.incoming.id) ?? 'keep_current',
    identical: entry.identical,
  }));
}

function mergedRecordCount(input: AssembleInput): number {
  let total = 0;
  for (const table of Object.values(input.merge.state.records)) total += Object.keys(table as object).length;
  return total;
}

export function assemblePlan(input: AssembleInput): ImportPlan {
  const { batchId, parsed, analysis, request, merge, validation } = input;
  const blockers: string[] = [];
  if (validation.summary.error > 0) {
    blockers.push(`${validation.summary.error} validation error(s) in the merged result: exclude the records involved or change a resolution`);
  }
  const conflicts = conflictsOf(analysis, request);
  const counts: Partial<Record<RecordKind, { incoming: number; new: number; identical: number; conflicting: number }>> = {};
  for (const [kind, entry] of Object.entries(analysis.counts)) counts[kind as RecordKind] = { ...entry };

  const preview: ImportPreview = {
    batchId,
    format: parsed.format,
    detectedSchemaVersion: parsed.detectedSchemaVersion ?? 0,
    migrationsApplied: parsed.migrationsApplied,
    counts,
    quarantined: [...parsed.quarantined, ...analysis.duplicates],
    conflicts,
    findings: validation.findings,
    findingSummary: validation.summary,
    decisions: input.legacy?.decisions ?? [],
    ...(input.legacy === undefined ? {} : { legacyReport: input.legacy.report }),
    richTextLinksRewritten: merge.richTextLinksRewritten,
    unsafeKeysRenamed: parsed.unsafeKeysRenamed,
    kindMismatches: parsed.kindMismatches,
    rejectedAssets: parsed.rejectedAssets,
    packageIssues: parsed.packageIssues,
    assets: merge.assets,
    mergedRecordCount: mergedRecordCount(input),
    canConfirm: blockers.length === 0,
    blockers,
  };
  return { preview, mode: request.mode, decisions: preview.decisions, conflicts, excluded: request.excludedRefs, copyIdMap: merge.copyIdMap };
}
