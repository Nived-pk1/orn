/**
 * The main thread's side of the RPC (docs/PERFORMANCE_ARCHITECTURE.md §3, ADR-034). Every call answers a value
 * (`RpcResult`), never rejects. Rules: a response after a cancel or a timeout is dropped and reported, never
 * delivered; a crash fails every pending call with `WORKER_CRASHED`, then the worker is restarted (capped); a timeout
 * terminates and restarts the worker (a synchronous task cannot see a cancel, D1; the other pending calls answer
 * `WORKER_CRASHED`); a restart hook has its own timeout; going down for good emits `gave_up`; more calls in flight than
 * `maxInFlight` answer `BUSY`.
 */
import type {
  RestartInfo,
  RpcCallOptions,
  RpcClient,
  RpcClientOptions,
  RpcErrorCode,
  RpcMethodSpecs,
  RpcPort,
  RpcResult,
  WorkerApi,
  WorkerEvent,
  WorkerFactory,
} from './contracts';
import { messageOf, rpcError } from './helpers';

export interface RpcClientConfig<Api extends WorkerApi<Api>> {
  readonly factory: WorkerFactory;
  readonly specs: RpcMethodSpecs<Api>;
  readonly options?: RpcClientOptions<Api>;
}

interface Pending {
  readonly method: string;
  readonly resolve: (result: RpcResult<unknown>) => void;
  readonly onProgress: RpcCallOptions['onProgress'];
  readonly cleanup: () => void;
}

const ABANDONED_LIMIT = 1024;
const ERROR_CODES: ReadonlySet<string> = new Set(['CANCELLED', 'TIMEOUT', 'BAD_REQUEST', 'WORKER_CRASHED', 'NOT_READY', 'INTERNAL', 'BUSY']);
const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

export function createRpcClient<Api extends WorkerApi<Api>>(config: RpcClientConfig<Api>): RpcClient<Api> {
  const { factory } = config;
  const specs = config.specs as Readonly<Record<string, { readonly timeoutMs: number }>>;
  const options = config.options ?? {};
  const maxRestarts = options.maxRestarts ?? 3;
  const maxInFlight = options.maxInFlight ?? 16;
  const restartHookTimeoutMs = options.restartHookTimeoutMs ?? 30_000;
  const methods = Object.keys(specs);
  for (const method of methods) {
    if (method === 'terminate') throw new TypeError('"terminate" is reserved: a worker method cannot use that name');
    const timeoutMs = specs[method]?.timeoutMs;
    if (typeof timeoutMs !== 'number' || !(timeoutMs > 0)) throw new TypeError(`method "${method}" needs a positive timeoutMs in its spec`);
  }

  let state: 'up' | 'down' | 'terminated' = 'up';
  let port: RpcPort | undefined;
  let detachPort: (() => void) | undefined;
  let generation = 0;
  let nextId = 1;
  let inFlight = 0;
  let restartsInARow = 0;
  /** Settles `true` when the restart hook is done (or failed and calls proceed), `false` when it timed out. */
  let gate: Promise<boolean> | undefined;
  const pending = new Map<number, Pending>();
  /** Calls whose answer is no longer wanted (cancelled, timed out): a late response is reported and dropped. */
  const abandoned = new Map<number, { method: string; reason: 'cancelled' | 'timeout' }>();

  const emit = (event: WorkerEvent): void => {
    try {
      options.onEvent?.(event);
    } catch {
      // an event sink that throws must not break the worker's bookkeeping; nothing else can report this
    }
  };
  const abandon = (id: number, method: string, reason: 'cancelled' | 'timeout'): void => {
    abandoned.set(id, { method, reason });
    if (abandoned.size > ABANDONED_LIMIT) abandoned.delete(abandoned.keys().next().value as number);
  };
  const settle = (id: number, result: RpcResult<unknown>): void => {
    const call = pending.get(id);
    if (call === undefined) return;
    pending.delete(id);
    call.cleanup();
    call.resolve(result);
  };
  const failAll = (code: 'WORKER_CRASHED' | 'CANCELLED', message: string): void => {
    for (const id of [...pending.keys()]) settle(id, rpcError(code, message));
  };

  const onMessage = (message: unknown): void => {
    const { type, id } = (typeof message === 'object' && message !== null ? message : {}) as { type?: unknown; id?: unknown };
    if (!isInteger(id) || (type !== 'response' && type !== 'progress')) {
      emit({ type: 'dropped_response', id: isInteger(id) ? id : -1, reason: 'malformed' });
      return;
    }
    if (type === 'progress') {
      const { done, total, note } = message as { done?: unknown; total?: number; note?: string };
      const call = pending.get(id);
      if (call === undefined || typeof done !== 'number') return;
      try {
        call.onProgress?.(done, total, note);
      } catch (error) {
        emit({ type: 'callback_error', message: `onProgress threw: ${messageOf(error)}` });
      }
      return;
    }
    const call = pending.get(id);
    if (call === undefined) {
      const late = abandoned.get(id);
      abandoned.delete(id);
      emit(late === undefined ? { type: 'dropped_response', id, reason: 'unknown' } : { type: 'dropped_response', id, method: late.method, reason: late.reason });
      return;
    }
    restartsInARow = 0;
    const response = message as { ok?: unknown; result?: unknown; error?: { code?: unknown; message?: unknown } };
    if (response.ok === true) {
      settle(id, { ok: true, value: response.result });
    } else if (typeof response.error?.code === 'string' && ERROR_CODES.has(response.error.code)) {
      settle(id, rpcError(response.error.code as RpcErrorCode, String(response.error.message ?? '')));
    } else {
      settle(id, rpcError('INTERNAL', 'the worker sent a malformed error response'));
      emit({ type: 'dropped_response', id, method: call.method, reason: 'malformed' });
    }
  };

  const detach = (): void => {
    detachPort?.();
    detachPort = undefined;
    try {
      port?.terminate();
    } catch {
      // already gone
    }
    port = undefined;
  };

  function start(): boolean {
    generation += 1;
    const mine = generation;
    try {
      const created = factory();
      const subs = [
        created.onMessage((m) => mine === generation && onMessage(m)),
        created.onError((e) => mine === generation && crashed('error', messageOf(e))),
        created.onMessageError((e) => mine === generation && crashed('messageerror', messageOf(e))),
        created.onExit((code) => mine === generation && crashed('exit', `the worker exited with code ${code}`)),
      ];
      port = created;
      detachPort = () => subs.forEach((off) => off());
      return true;
    } catch (error) {
      emit({ type: 'crash', reason: 'error', message: `the worker could not be created: ${messageOf(error)}`, pending: pending.size, willRestart: false });
      return false;
    }
  }

  const goDown = (why: 'restart_cap' | 'start_failed'): void => {
    state = 'down';
    emit({ type: 'gave_up', reason: why, restarts: restartsInARow });
    failAll('WORKER_CRASHED', `the worker is down after ${restartsInARow} restart(s)`);
  };

  function restart(reason: 'crash' | 'timeout', why: string): void {
    detach();
    abandoned.clear();
    failAll('WORKER_CRASHED', why);
    if (restartsInARow >= maxRestarts) {
      if (reason === 'timeout') emit({ type: 'crash', reason: 'error', message: 'restart cap reached after a timeout', pending: 0, willRestart: false });
      goDown('restart_cap');
      return;
    }
    restartsInARow += 1;
    if (!start()) {
      goDown('start_failed');
      return;
    }
    emit({ type: 'restart', reason, restarts: restartsInARow });
    const hook = options.onRestart;
    if (hook === undefined) return;
    const info: RestartInfo = { reason, attempt: restartsInARow };
    const born = generation;
    const mine: Promise<boolean> = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        if (gate !== mine || state !== 'up') return resolve(true);
        emit({ type: 'restart_hook_timeout', timeoutMs: restartHookTimeoutMs, attempt: info.attempt });
        resolve(false);
        // the worker's replica was never reloaded: this restart failed, so it counts and the worker starts over
        restart('crash', `the restart hook did not finish within ${restartHookTimeoutMs} ms`);
      }, restartHookTimeoutMs);
      (async () => {
        try {
          await hook(build(true, born), info);
        } catch (error) {
          emit({ type: 'restart_hook_failed', message: messageOf(error) });
        }
      })().then(() => {
        clearTimeout(timer);
        resolve(true);
      });
    }).finally(() => {
      if (gate === mine) gate = undefined;
    });
    gate = mine;
  }

  function crashed(reason: 'error' | 'messageerror' | 'exit', message: string): void {
    if (state !== 'up') return;
    emit({ type: 'crash', reason, message, pending: pending.size, willRestart: restartsInARow < maxRestarts });
    restart('crash', `the worker crashed (${message})`);
  }

  const send = (method: string, params: unknown, callOptions: RpcCallOptions): Promise<RpcResult<unknown>> =>
    new Promise((resolve) => {
      const id = nextId++;
      const timeoutMs = callOptions.timeoutMs ?? specs[method]?.timeoutMs ?? 0;
      const { signal } = callOptions;
      const onAbort = (): void => {
        if (!pending.has(id)) return;
        abandon(id, method, 'cancelled');
        settle(id, rpcError('CANCELLED', `${method} was cancelled`));
        try {
          port?.postMessage({ type: 'cancel', id });
        } catch {
          // the worker is going away anyway
        }
      };
      const cleanup = (): void => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      pending.set(id, { method, resolve, onProgress: callOptions.onProgress, cleanup });
      signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        emit({ type: 'timeout', id, method, timeoutMs });
        settle(id, rpcError('TIMEOUT', `${method} did not answer within ${timeoutMs} ms; the worker was restarted`));
        restart('timeout', `the worker was restarted because ${method} timed out`);
      }, timeoutMs);
      try {
        port?.postMessage({ type: 'request', id, method, params }, callOptions.transfer);
      } catch (error) {
        settle(id, rpcError('BAD_REQUEST', `${method}: the request could not be sent (${messageOf(error)})`));
      }
    });

  const call = async (method: string, params: unknown, callOptions: RpcCallOptions, bypass: boolean, born?: number): Promise<RpcResult<unknown>> => {
    const unusable = (): RpcResult<unknown> | undefined => {
      if (born !== undefined && born !== generation) return rpcError('WORKER_CRASHED', 'the worker this restart hook was started for is gone');
      if (state === 'terminated') return rpcError('CANCELLED', 'the client was terminated');
      if (state === 'down') return rpcError('WORKER_CRASHED', `the worker is down after ${restartsInARow} restart(s)`);
      if (callOptions.signal?.aborted === true) return rpcError('CANCELLED', `${method} was cancelled`);
      return undefined;
    };
    const early = unusable();
    if (early !== undefined) return early;
    if (!bypass && inFlight >= maxInFlight) {
      emit({ type: 'busy', method, inFlight });
      return rpcError('BUSY', `${inFlight} calls are already in flight`);
    }
    if (!bypass) inFlight += 1;
    try {
      if (!bypass && gate !== undefined) {
        if (!(await gate)) return rpcError('WORKER_CRASHED', 'the worker was restarted again: its restart hook did not finish in time');
        const changed = unusable();
        if (changed !== undefined) return changed;
      }
      return await send(method, params, callOptions);
    } finally {
      if (!bypass) inFlight -= 1;
    }
  };

  /** `born`: the worker generation a restart hook's `raw` client belongs to; after another restart its calls fail. */
  function build(bypass: boolean, born?: number): RpcClient<Api> {
    const api: Record<string, unknown> = {};
    for (const method of methods) api[method] = (params: unknown, callOptions: RpcCallOptions = {}) => call(method, params, callOptions, bypass, born);
    api.terminate = () => {
      if (state === 'terminated') return;
      state = 'terminated';
      detach();
      failAll('CANCELLED', 'the client was terminated');
    };
    return api as unknown as RpcClient<Api>;
  }

  if (!start()) goDown('start_failed');
  return build(false);
}
