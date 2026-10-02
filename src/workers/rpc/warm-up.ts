/**
 * The main side of engine warm-up (step 5.0, Phase 5 contract decisions Q7, note E4). One gate per engine client (chem, layout):
 *   - `ready()` sends `warmUp` the FIRST time a real call needs the engine (engines load lazily, PERFORMANCE §7) and holds every
 *     caller behind that one call; once warm, it answers at once.
 *   - `ok: false, reason: 'engine_unavailable'` is a VALUE and is kept: the engine cannot load, the callers answer their
 *     "unavailable" value (chem) or the fallback layout (layout), and nothing restarts or retries by itself.
 *   - A warm-up that the RPC layer could not answer (`TIMEOUT` past `ENGINE_LOAD_TIMEOUT_MS`, a crash, busy) is an ordinary RPC
 *     failure: the client has restarted the worker (counting towards `maxRestarts`; `gave_up` is a status), the gate goes back to
 *     cold and the next call tries again on the new worker.
 *   - `onRestart` is the hook for `RpcClientOptions.onRestart`: it warms up again ONLY if the engine had been warmed.
 * The caller creates the client with `onRestart: gate.onRestart` and gives the same gate to its service.
 */
import { callWithRetry } from './retry';
import type { RestartInfo, RpcCallContext, RpcClient, RpcError, RpcMethodSpecs, WarmUpParams, WarmUpResult, WorkerApi } from './contracts';

/** An API a gate can serve: it has `warmUp` (its spec carries `ENGINE_LOAD_TIMEOUT_MS`). */
export type WarmableApi<Api> = WorkerApi<Api> & { readonly warmUp: (params: WarmUpParams, ctx: RpcCallContext) => Promise<WarmUpResult> };

type Answer = { readonly ok: true; readonly value: WarmUpResult } | { readonly ok: false; readonly error: RpcError };

export type WarmOutcome =
  | { readonly ok: true; readonly loadMs: number }
  | { readonly ok: false; readonly reason: 'engine_unavailable'; readonly message: string }
  | { readonly ok: false; readonly reason: 'rpc'; readonly error: RpcError };

export type WarmState = 'cold' | 'warming' | 'warm' | 'unavailable';

export interface WarmUpGate<Api extends WarmableApi<Api>> {
  /** Warms the engine on first need; callers wait for the same call. */
  ready(client: RpcClient<Api>, specs: RpcMethodSpecs<Api>): Promise<WarmOutcome>;
  /** For `createRpcClient(..., { onRestart })`. */
  readonly onRestart: (raw: RpcClient<Api>, info: RestartInfo) => Promise<void>;
  state(): WarmState;
}

export function createWarmUpGate<Api extends WarmableApi<Api>>(): WarmUpGate<Api> {
  let state: WarmState = 'cold';
  let unavailable: WarmOutcome | undefined;
  let pending: Promise<WarmOutcome> | undefined;
  let everWarm = false;

  const settle = (result: WarmUpResult): WarmOutcome => {
    if (result.ok) {
      state = 'warm';
      everWarm = true;
      return { ok: true, loadMs: result.loadMs };
    }
    state = 'unavailable';
    unavailable = { ok: false, reason: 'engine_unavailable', message: result.message };
    return unavailable;
  };

  return {
    state: () => state,
    ready(client, specs) {
      if (state === 'warm') return Promise.resolve({ ok: true, loadMs: 0 });
      if (state === 'unavailable' && unavailable !== undefined) return Promise.resolve(unavailable);
      if (pending !== undefined) return pending;
      state = 'warming';
      const mine = (callWithRetry(client, specs, 'warmUp', {} as never) as Promise<Answer>).then((answer): WarmOutcome => {
        if (answer.ok) return settle(answer.value);
        state = 'cold';
        return { ok: false, reason: 'rpc', error: answer.error };
      });
      pending = mine;
      void mine.finally(() => {
        if (pending === mine) pending = undefined;
      });
      return mine;
    },
    async onRestart(raw) {
      if (!everWarm || state === 'unavailable') return;
      state = 'warming';
      const answer = (await (raw.warmUp as unknown as (params: WarmUpParams) => Promise<Answer>)({}));
      if (answer.ok) settle(answer.value);
      else state = 'cold';
    },
  };
}
