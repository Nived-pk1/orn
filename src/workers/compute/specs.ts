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
  findRoutes: { idempotent: true, timeoutMs: 5_000 },
  importPreview: { idempotent: true, timeoutMs: 60_000 },
  buildExport: { idempotent: true, timeoutMs: 30_000 },
};
