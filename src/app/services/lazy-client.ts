/**
 * A client that creates its worker thread at its FIRST CALL (step 5.1b, PERFORMANCE §7: nothing starts before it is needed). It is
 * the same shape as an `RpcClient` (a plain object of the API's methods plus `terminate`), so the engine services take it as is.
 * Every call answers a value: a client terminated before it was ever used answers `CANCELLED`, like a terminated real one.
 */
import type { RpcCallOptions, RpcClient, RpcMethodSpecs, RpcResult, WorkerApi } from '@/workers/rpc/contracts';

export type LazyClient<Api extends WorkerApi<Api>> = RpcClient<Api> & {
  /** True once the thread was created. */
  readonly created: () => boolean;
};

export function createLazyClient<Api extends WorkerApi<Api>>(specs: RpcMethodSpecs<Api>, make: () => RpcClient<Api>): LazyClient<Api> {
  let real: RpcClient<Api> | undefined;
  let terminated = false;
  const api: Record<string, unknown> = {};
  for (const method of Object.keys(specs)) {
    api[method] = (params: unknown, options?: RpcCallOptions): Promise<RpcResult<unknown>> => {
      if (terminated) return Promise.resolve({ ok: false, error: { code: 'CANCELLED', message: 'the client was terminated' } });
      real ??= make();
      return (real as unknown as Record<string, (p: unknown, o?: RpcCallOptions) => Promise<RpcResult<unknown>>>)[method]?.(params, options) as Promise<RpcResult<unknown>>;
    };
  }
  api.terminate = () => {
    terminated = true;
    real?.terminate();
  };
  api.created = () => real !== undefined;
  return api as unknown as LazyClient<Api>;
}
