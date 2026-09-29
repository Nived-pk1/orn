/**
 * L2/L3 on the MERGED replica only (docs/PERSISTENCE.md §6, INV-21): indexes are built for the replica and the whole
 * validator runs over it; live state and the live store's finding store are never touched. Pure and deterministic. The
 * findings LISTED in a preview are capped (`IMPORT_PREVIEW_MAX_FINDINGS`, errors first); the summary counts every one, so a
 * truncated list is never mistaken for a short one.
 */
import { coreIndexEngine } from '@/core/indexes/engine';
import type { CanonicalState } from '@/core/schema';
import { validator } from '@/core/validation';
import type { Finding } from '@/core/validation/contracts';
import { IMPORT_PREVIEW_MAX_FINDINGS, type FindingSummary } from './contracts';

const isAborted = (signal: AbortSignal | undefined): boolean => signal?.aborted === true;

export interface MergedValidation {
  readonly findings: readonly Finding[];
  readonly summary: FindingSummary;
}

export type ValidateMergedOutcome = { readonly ok: true; readonly validation: MergedValidation } | { readonly ok: false; readonly cancelled: true };

export function summarizeFindings(all: readonly Finding[]): MergedValidation {
  let error = 0;
  let warning = 0;
  let info = 0;
  let reviewRequired = 0;
  for (const finding of all) {
    if (finding.severity === 'error') error += 1;
    else if (finding.severity === 'warning') warning += 1;
    else if (finding.severity === 'info') info += 1;
    else reviewRequired += 1;
  }
  const ordered = error === 0 || error === all.length ? all : [...all.filter((f) => f.severity === 'error'), ...all.filter((f) => f.severity !== 'error')];
  const findings = ordered.slice(0, IMPORT_PREVIEW_MAX_FINDINGS);
  return { findings, summary: { error, warning, info, reviewRequired, truncated: ordered.length > findings.length } };
}

/** `revision` is the revision the replica would have (live revision + 1), so index stamps match what `replaceState` builds. */
export function validateMerged(merged: CanonicalState, revision: number, signal?: AbortSignal): ValidateMergedOutcome {
  if (isAborted(signal)) return { ok: false, cancelled: true };
  const indexes = coreIndexEngine.build(merged, revision);
  let all: readonly Finding[];
  try {
    all = validator.validateAll(merged, indexes, signal);
  } catch (error) {
    if (isAborted(signal)) return { ok: false, cancelled: true };
    throw error;
  }
  return { ok: true, validation: summarizeFindings(all) };
}
