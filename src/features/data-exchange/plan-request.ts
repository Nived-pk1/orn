/**
 * Pure rules of the import screen: a change the user makes becomes the FULL request for the pending batch (the session's rule: a
 * request is the whole desired state, never a delta), and the counts the screen says in words come from the plan alone. No
 * chemistry and no React here.
 */
import type { ConflictResolution, IdConflict, ImportPlan, ImportPlanRequest } from '@/io';
import type { RecordRef } from '@/core/schema';

/** One thing the user changed in the preview. */
export type PlanChange =
  | { readonly type: 'mode'; readonly mode: 'replace_all' | 'merge' }
  /** Every conflict that differs from the live record (identical ones stay skipped). */
  | { readonly type: 'resolve_all'; readonly resolution: ConflictResolution }
  | { readonly type: 'resolve'; readonly id: string; readonly resolution: ConflictResolution }
  | { readonly type: 'exclude'; readonly ref: RecordRef }
  | { readonly type: 'include'; readonly ref: RecordRef }
  | { readonly type: 'decide'; readonly id: string; readonly chosen: string };

/** The resolutions a user may pick for a conflict that differs, in the words the screen uses. */
export const CHOICES: readonly { readonly resolution: ConflictResolution; readonly label: string }[] = [
  { resolution: 'keep_current', label: 'Keep mine' },
  { resolution: 'replace', label: "Use the file's" },
  { resolution: 'import_as_copy', label: 'Keep both, the file\'s as a copy' },
];

export const choiceLabel = (resolution: ConflictResolution): string =>
  resolution === 'identical_skip' ? 'Identical, skipped' : (CHOICES.find((c) => c.resolution === resolution)?.label ?? resolution);

const keyOf = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;

/** The full request that describes `plan` with `change` applied. */
export function requestOf(plan: ImportPlan, change?: PlanChange): ImportPlanRequest {
  const mode = change?.type === 'mode' ? change.mode : plan.mode;
  const excluded = new Map(plan.excluded.map((ref) => [keyOf(ref), ref] as const));
  if (change?.type === 'exclude') excluded.set(keyOf(change.ref), change.ref);
  if (change?.type === 'include') excluded.delete(keyOf(change.ref));
  const excludedIds = new Set([...excluded.values()].map((ref) => ref.id));

  const request: { mode: 'replace_all' | 'merge'; resolutions?: { id: string; resolution: ConflictResolution }[]; excluded?: RecordRef[]; decisions?: { id: string; chosen: string }[] } = { mode };
  if (mode === 'merge') {
    // A mode switched FROM replace_all has no conflicts in the plan; every default then applies.
    const current = plan.mode === 'merge' ? plan.conflicts : [];
    request.resolutions = current
      .filter((conflict) => !excludedIds.has(conflict.ref.id))
      .map((conflict) => ({ id: conflict.ref.id, resolution: resolutionAfter(conflict, change) }));
  }
  request.excluded = [...excluded.values()];
  if (plan.decisions.length > 0) {
    request.decisions = plan.decisions.map((d) => ({ id: d.id, chosen: change?.type === 'decide' && change.id === d.id ? change.chosen : d.chosen }));
  }
  return request;
}

function resolutionAfter(conflict: IdConflict, change: PlanChange | undefined): ConflictResolution {
  if (change?.type === 'resolve' && change.id === conflict.ref.id) return change.resolution;
  if (change?.type === 'resolve_all' && !conflict.identical) return change.resolution;
  return conflict.resolution;
}

/** Conflicts of the plan that are in the import (not excluded). */
export function liveConflicts(plan: ImportPlan): readonly IdConflict[] {
  const excluded = new Set(plan.excluded.map((ref) => ref.id));
  return plan.conflicts.filter((conflict) => !excluded.has(conflict.ref.id));
}

export interface PlanTotals {
  /** Records of the file that passed validation. */
  readonly incoming: number;
  readonly excluded: number;
  /** Conflicts that stay as the live record (identical or "keep mine"). */
  readonly skipped: number;
  /** Records the apply writes: incoming - excluded - skipped. */
  readonly written: number;
}

export function totalsOf(plan: ImportPlan): PlanTotals {
  const incoming = Object.values(plan.preview.counts).reduce((sum, c) => sum + (c?.incoming ?? 0), 0);
  const excluded = plan.excluded.length;
  const skipped = plan.mode === 'merge' ? liveConflicts(plan).filter((c) => c.resolution === 'identical_skip' || c.resolution === 'keep_current').length : 0;
  return { incoming, excluded, skipped, written: Math.max(0, incoming - excluded - skipped) };
}

/** Counts over the three kinds of conflict, for the words of the conflicts section. */
export function conflictCounts(plan: ImportPlan): { readonly identical: number; readonly differing: number } {
  const live = liveConflicts(plan);
  return { identical: live.filter((c) => c.identical).length, differing: live.filter((c) => !c.identical).length };
}

/** Why Confirm is unavailable (the blockers in words), or undefined when the plan can be applied. */
export function blockedReason(plan: ImportPlan): string | undefined {
  if (plan.preview.canConfirm) return undefined;
  return plan.preview.blockers.length > 0 ? plan.preview.blockers.join(' ') : 'the result of this import has errors';
}
