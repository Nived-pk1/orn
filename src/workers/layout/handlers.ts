/**
 * The layout worker's RPC handlers (step 4.4): thin wrappers over a `LayoutEngine` (ELK) and the pure fallback. The worker holds
 * no state (ADR-034 D1). The request is checked first (`BAD_REQUEST`: not sorted by id, over the caps, malformed). `layout` answers
 * ELK's result, or, when ELK throws, the fallback with `fallbackReason: 'elk_error'` (`'engine_unavailable'` when ELK could not
 * load) and a note naming what ELK said; a call that was cancelled is not answered with a fallback, it is dropped by the RPC layer.
 * `layoutFallback` answers the fallback alone, for the reason the caller states (the timeout path).
 */
import { LayoutEngineUnavailable } from '@/layout/errors';
import { layoutFallback } from '@/layout/fallback';
import { checkRequest } from '@/layout/validate';
import type { LayoutEngine, LayoutRequest, LayoutResult } from '@/layout/contracts';
import type { FallbackReason } from '@/layout/contracts';
import type { LayoutWorkerApi } from '@/workers/rpc/contracts';
import { RpcHostError, messageOf } from '@/workers/rpc/helpers';

const REASONS: readonly string[] = ['timeout', 'elk_error', 'engine_unavailable'];

function checked(request: LayoutRequest): LayoutRequest {
  const problem = checkRequest(request);
  if (problem !== undefined) throw new RpcHostError('BAD_REQUEST', problem.code === 'TOO_LARGE' ? `TOO_LARGE: ${problem.message}` : problem.message);
  return request;
}

export function createLayoutHandlers(engine: LayoutEngine, clock: () => number): LayoutWorkerApi {
  const fallback = (request: LayoutRequest, reason: FallbackReason, extra: readonly string[] = []): LayoutResult => {
    const began = clock();
    const result = layoutFallback(request, reason, () => clock() - began);
    return extra.length === 0 ? result : { ...result, notes: [...result.notes, ...extra].sort() };
  };
  return {
    async layout(params, ctx) {
      const request = checked(params);
      try {
        return await engine.layout(request, ctx.signal);
      } catch (error) {
        if (ctx.signal.aborted) throw error;
        const unavailable = error instanceof LayoutEngineUnavailable;
        return fallback(request, unavailable ? 'engine_unavailable' : 'elk_error', [`ELK ${unavailable ? 'could not be loaded' : 'failed'} (${messageOf(error).slice(0, 200)}); the fallback layout was used`]);
      }
    },
    async layoutFallback(params) {
      if (typeof params !== 'object' || params === null || !REASONS.includes(params.reason)) throw new RpcHostError('BAD_REQUEST', 'reason must be timeout, elk_error or engine_unavailable');
      return fallback(checked(params.request), params.reason);
    },
  };
}
