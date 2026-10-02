/**
 * Method specs of the layout worker (ADR-034, ADR-007, PERFORMANCE_ARCHITECTURE §5): every call is idempotent (the same request
 * gives the same answer, so `callWithRetry` may repeat one once after a crash) and has a 2 s limit (`warmUp`, which loads ELK, has `ENGINE_LOAD_TIMEOUT_MS`: step 5.0). ELK is synchronous: a call
 * over the limit cannot be interrupted, so the client answers `TIMEOUT`, terminates the worker and starts a new one; the service
 * then asks the new worker for the fallback layout.
 */
import { ENGINE_LOAD_TIMEOUT_MS, type LayoutWorkerApi, type RpcMethodSpecs } from '@/workers/rpc/contracts';

export const LAYOUT_CALL_TIMEOUT_MS = 2_000;

export const LAYOUT_SPECS: RpcMethodSpecs<LayoutWorkerApi> = {
  warmUp: { idempotent: true, timeoutMs: ENGINE_LOAD_TIMEOUT_MS },
  layout: { idempotent: true, timeoutMs: LAYOUT_CALL_TIMEOUT_MS },
  layoutFallback: { idempotent: true, timeoutMs: LAYOUT_CALL_TIMEOUT_MS },
};
