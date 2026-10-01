/**
 * Method specs of the layout worker (ADR-034, ADR-007, PERFORMANCE_ARCHITECTURE §5): both calls are idempotent (the same request
 * gives the same answer, so `callWithRetry` may repeat one once after a crash) and have a 2 s limit. ELK is synchronous: a call
 * over the limit cannot be interrupted, so the client answers `TIMEOUT`, terminates the worker and starts a new one; the service
 * then asks the new worker for the fallback layout.
 */
import type { LayoutWorkerApi, RpcMethodSpecs } from '@/workers/rpc/contracts';

export const LAYOUT_CALL_TIMEOUT_MS = 2_000;

export const LAYOUT_SPECS: RpcMethodSpecs<LayoutWorkerApi> = {
  layout: { idempotent: true, timeoutMs: LAYOUT_CALL_TIMEOUT_MS },
  layoutFallback: { idempotent: true, timeoutMs: LAYOUT_CALL_TIMEOUT_MS },
};
