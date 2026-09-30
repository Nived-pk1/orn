/**
 * The worker's side of the RPC (docs/PERFORMANCE_ARCHITECTURE.md §3, ADR-034): receives numbered requests, runs the
 * handler with an AbortSignal and a progress function, answers with a value. A handler that throws answers
 * `INTERNAL` with the message only. A `cancel` aborts the call's signal and the answer is not sent; a handler that is
 * busy in a synchronous loop never sees it (D1: the client terminates the worker on a timeout).
 */
import type { RpcCallContext, RpcError, RpcErrorCode, RpcMessage, RpcMessagePort, WorkerApi } from './contracts';
import { RpcHostError, messageOf, takeTransfer } from './helpers';

export interface RpcHostOptions {
  /** Requests running at once; more are answered `BUSY`. Default 64. */
  readonly maxInFlight?: number;
}

export interface RpcHost {
  /** Stops listening and aborts every running call. */
  close(): void;
}

const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

export function createRpcHost<Api extends WorkerApi<Api>>(port: RpcMessagePort, handlers: Api, options: RpcHostOptions = {}): RpcHost {
  const maxInFlight = options.maxInFlight ?? 64;
  const running = new Map<number, AbortController>();

  const send = (message: RpcMessage, transfer?: readonly Transferable[]): boolean => {
    try {
      port.postMessage(message, transfer);
      return true;
    } catch {
      return false;
    }
  };
  const fail = (id: number, code: RpcErrorCode, message: string): void => {
    const error: RpcError = { code, message };
    send({ type: 'response', id, ok: false, error });
  };

  const run = async (id: number, method: string, params: unknown): Promise<void> => {
    const handler = Object.hasOwn(handlers as object, method) ? (handlers as Record<string, unknown>)[method] : undefined;
    if (typeof handler !== 'function') return fail(id, 'BAD_REQUEST', `unknown method "${method}"`);
    if (running.has(id)) return fail(id, 'BAD_REQUEST', `request ${id} is already running`);
    if (running.size >= maxInFlight) return fail(id, 'BUSY', `${maxInFlight} calls are already running`);
    const controller = new AbortController();
    running.set(id, controller);
    const ctx: RpcCallContext = {
      signal: controller.signal,
      progress: (done, total, note) => {
        if (controller.signal.aborted || !running.has(id)) return;
        send({ type: 'progress', id, done, ...(total === undefined ? {} : { total }), ...(note === undefined ? {} : { note }) });
      },
    };
    try {
      const result = await (handler as (p: unknown, c: RpcCallContext) => Promise<unknown>).call(handlers, params, ctx);
      if (controller.signal.aborted) return;
      const transfer = takeTransfer(result);
      if (!send({ type: 'response', id, ok: true, result }, transfer)) {
        fail(id, 'INTERNAL', 'the result could not be sent (not structured-cloneable)');
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      fail(id, error instanceof RpcHostError ? error.code : 'INTERNAL', messageOf(error));
    } finally {
      running.delete(id);
    }
  };

  const off = port.onMessage((message) => {
    if (typeof message !== 'object' || message === null) return;
    const { type, id } = message as { type?: unknown; id?: unknown };
    if (!isInteger(id)) return;
    if (type === 'cancel') running.get(id)?.abort();
    else if (type === 'request') {
      const { method, params } = message as { method?: unknown; params?: unknown };
      if (typeof method !== 'string') fail(id, 'BAD_REQUEST', 'a request needs a method name');
      else void run(id, method, params);
    }
  });

  return {
    close() {
      off();
      for (const controller of running.values()) controller.abort();
      running.clear();
    },
  };
}
