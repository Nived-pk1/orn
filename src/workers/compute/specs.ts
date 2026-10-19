/**
 * Method specs of the compute worker (ADR-034): which calls `callWithRetry` may repeat after a restart (D4) and the default
 * timeouts (the ADR's proposals, approved in the step 4.1 review). `applyChanges` is the only apply-like call here: a second
 * application would fail the revision check or double an edit, so it is never retried; the replica sync reloads instead.
 */
import type { ComputeWorkerApi, RpcMethodSpecs } from '@/workers/rpc/contracts';

export const COMPUTE_SPECS: RpcMethodSpecs<ComputeWorkerApi> = {
  loadReplica: { idempotent: true, timeoutMs: 30_000 },
  applyChanges: { idempotent: false, timeoutMs: 5_000 },
  validateAll: { idempotent: true, timeoutMs: 30_000 },
  checkDraft: { idempotent: true, timeoutMs: 5_000 },
  findRoutes: { idempotent: true, timeoutMs: 5_000 },
  importPreview: { idempotent: true, timeoutMs: 60_000 },
  // The pending batch lives in the worker and is lost with it: a retried revise or prepare would only answer UNKNOWN_BATCH,
  // and prepare is apply-like (D4), so neither is retried.
  importRevise: { idempotent: false, timeoutMs: 60_000 },
  importCancel: { idempotent: true, timeoutMs: 5_000 },
  importPrepareApply: { idempotent: false, timeoutMs: 30_000 },
  snapshotBuild: { idempotent: true, timeoutMs: 30_000 },
  snapshotDecode: { idempotent: true, timeoutMs: 60_000 },
  adoptPending: { idempotent: false, timeoutMs: 5_000 },
  dropPending: { idempotent: true, timeoutMs: 5_000 },
  exportPlan: { idempotent: true, timeoutMs: 30_000 },
  exportBuild: { idempotent: true, timeoutMs: 60_000 },
};
