import type { RpcCallOptions, RpcClient, RpcMethodSpecs, RpcResult, WorkerApi } from './contracts';

type Method<Api extends WorkerApi<Api>, M extends keyof Api> = RpcClient<Api>[M];
type Params<Api extends WorkerApi<Api>, M extends keyof Api> = Method<Api, M> extends (params: infer P, ...rest: never[]) => unknown ? P : never;
type Value<Api extends WorkerApi<Api>, M extends keyof Api> = Method<Api, M> extends (...args: never[]) => Promise<RpcResult<infer R>> ? R : never;

/**
 * Calls once; if the worker crashed under the call (`WORKER_CRASHED`; the client has restarted it and its `onRestart`
 * hook has run by the time the second call is sent) and the method's spec says it is idempotent, calls once more
 * (D4, PERSISTENCE §12). A timeout is NOT retried: repeating a hang only doubles the wait. Apply-like methods are
 * never retried. A cancelled call is never retried.
 */
export async function callWithRetry<Api extends WorkerApi<Api>, M extends keyof Api & string>(
  client: RpcClient<Api>,
  specs: RpcMethodSpecs<Api>,
  method: M,
  params: Params<Api, M>,
  options?: RpcCallOptions,
): Promise<RpcResult<Value<Api, M>>> {
  const call = client[method] as unknown as (p: unknown, o?: RpcCallOptions) => Promise<RpcResult<Value<Api, M>>>;
  const first = await call(params, options);
  if (first.ok || first.error.code !== 'WORKER_CRASHED' || !specs[method].idempotent) return first;
  if (options?.signal?.aborted === true) return first;
  return call(params, options);
}
