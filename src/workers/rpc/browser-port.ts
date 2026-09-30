/** Adapters between the browser's worker objects and the RPC ports (Phase 5 creates the workers, D7). */
import type { RpcMessage, RpcMessagePort, RpcPort } from './contracts';

/** The client's side: a page's `new Worker(...)`. */
export function browserWorkerPort(worker: Worker): RpcPort {
  const listen = <K extends 'message' | 'error' | 'messageerror'>(type: K, listener: (event: Event) => void): (() => void) => {
    worker.addEventListener(type, listener);
    return () => worker.removeEventListener(type, listener);
  };
  return {
    postMessage: (message: RpcMessage, transfer) => worker.postMessage(message, [...(transfer ?? [])]),
    onMessage: (listener) => listen('message', (event) => listener((event as MessageEvent).data)),
    onError: (listener) => listen('error', (event) => listener((event as ErrorEvent).message)),
    onMessageError: (listener) => listen('messageerror', () => listener('a message could not be deserialised')),
    // The browser has no exit event; a crash of the worker script arrives as `error`.
    onExit: () => () => undefined,
    terminate: () => worker.terminate(),
  };
}

/** What of a dedicated worker's global scope (`self`) the host needs; the DOM lib has no type for it. */
export interface WorkerScopeLike {
  postMessage(message: unknown, transfer: Transferable[]): void;
  addEventListener(type: 'message', listener: EventListener): void;
  removeEventListener(type: 'message', listener: EventListener): void;
}

/** The host's side, inside the worker: `self` of a dedicated worker. */
export function workerScopePort(scope: WorkerScopeLike): RpcMessagePort {
  return {
    postMessage: (message, transfer) => scope.postMessage(message, [...(transfer ?? [])]),
    onMessage: (listener) => {
      const handler = (event: MessageEvent): void => listener(event.data);
      scope.addEventListener('message', handler as EventListener);
      return () => scope.removeEventListener('message', handler as EventListener);
    },
  };
}
