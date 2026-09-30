/**
 * Helpers for the precomputed-findings tests and bench (step 4.2a): what the compute worker will send, built the
 * in-process way, and a fingerprint of everything a refused call must leave alone. Test-only.
 */
import type { PrecomputedFindings, StoreHandle } from '@/core/commands';
import { coreIndexEngine } from '@/core/indexes/engine';
import { RECORD_KINDS, type CanonicalState, type RecordKind } from '@/core/schema';
import { RULE_SET_ID, validator } from '@/core/validation';

export function recordCountsOf(state: CanonicalState): Record<RecordKind, number> {
  return Object.fromEntries(RECORD_KINDS.map((kind) => [kind, Object.keys(state.records[kind]).length])) as Record<RecordKind, number>;
}

/** `validateAll` of `state`, stamped for adoption at `revision`: exactly what the compute worker will produce. */
export function precomputedOf(state: CanonicalState, revision: number): PrecomputedFindings {
  return {
    findings: validator.validateAll(state, coreIndexEngine.build(state, revision)),
    ruleSet: RULE_SET_ID,
    revision,
    recordCounts: recordCountsOf(state),
  };
}

export interface StoreFingerprint {
  readonly state: CanonicalState;
  readonly revision: number;
  readonly indexRevision: number;
  readonly findings: StoreHandle['findings'] extends { all(): infer R } ? R : never;
  readonly history: ReturnType<StoreHandle['historyLabels']>;
  readonly canUndo: boolean;
  readonly heard: number;
}

/** State, revision, index revision, finding store contents, history, and how often subscribers were called. */
export function fingerprintOf(store: StoreHandle, heard: { readonly calls: number }): StoreFingerprint {
  return {
    state: store.getState(),
    revision: store.getRevision(),
    indexRevision: store.getIndexes().revision,
    findings: store.findings.all(),
    history: store.historyLabels(),
    canUndo: store.canUndo(),
    heard: heard.calls,
  };
}
