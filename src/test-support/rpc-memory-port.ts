/**
 * An in-memory RPC port pair for the library's tests (step 4.1). Every message is passed through
 * `structuredClone` (with its transfer list) when it is posted, so a param or result that a real worker
 * could not receive fails here exactly as it would there; delivery is a microtask, so no timers are involved.
 */
import type { RpcMessage, RpcMessagePort, RpcPort, WorkerFactory } from '@/workers/rpc/contracts';

export interface MemoryWorker {
  /** The client's end (what the factory hands out). */
  readonly port: RpcPort;
  /** The host's end: give it to `createRpcHost`, or drive it by hand. */
  readonly host: RpcMessagePort;
  /** Every message the host received, cloned, in order. */
  readonly received: RpcMessage[];
  alive(): boolean;
  /** Simulates the worker dying: `error`, `messageerror` or `exit` reaches the client. */
  crash(reason: 'error' | 'messageerror' | 'exit'): void;
  /** Posts a message to the client as if the host had sent it (no shape check). */
  sendRaw(message: unknown): void;
}

type Listener<T> = (value: T) => void;

export function createMemoryWorker(): MemoryWorker {
  const clientListeners = new Set<Listener<unknown>>();
  const hostListeners = new Set<Listener<unknown>>();
  const errorListeners = new Set<Listener<unknown>>();
  const messageErrorListeners = new Set<Listener<unknown>>();
  const exitListeners = new Set<Listener<number>>();
  const received: RpcMessage[] = [];
  let alive = true;

  const deliver = <T>(listeners: ReadonlySet<Listener<T>>, value: T): void => {
    queueMicrotask(() => {
      if (!alive) return;
      for (const listener of [...listeners]) listener(value);
    });
  };
  const clone = (message: unknown, transfer?: readonly Transferable[]): unknown =>
    structuredClone(message, transfer === undefined ? undefined : { transfer: [...transfer] });
  const subscribe = <T>(listeners: Set<Listener<T>>, listener: Listener<T>): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const port: RpcPort = {
    postMessage(message, transfer) {
      const copy = clone(message, transfer) as RpcMessage;
      if (!alive) return;
      received.push(copy);
      deliver(hostListeners, copy);
    },
    onMessage: (listener) => subscribe(clientListeners, listener),
    onError: (listener) => subscribe(errorListeners, listener),
    onMessageError: (listener) => subscribe(messageErrorListeners, listener),
    onExit: (listener) => subscribe(exitListeners, listener),
    terminate() {
      alive = false;
    },
  };
  const host: RpcMessagePort = {
    postMessage(message, transfer) {
      const copy = clone(message, transfer);
      deliver(clientListeners, copy);
    },
    onMessage: (listener) => subscribe(hostListeners, listener),
  };

  return {
    port,
    host,
    received,
    alive: () => alive,
    crash(reason) {
      if (!alive) return;
      if (reason === 'exit') deliver(exitListeners, 1);
      else deliver(reason === 'error' ? errorListeners : messageErrorListeners, new Error(`simulated ${reason}`));
    },
    sendRaw: (message) => deliver(clientListeners, message),
  };
}

export interface MemoryWorkers {
  readonly factory: WorkerFactory;
  /** One entry per worker the factory created, in order (a restart adds one). */
  readonly workers: MemoryWorker[];
}

/** A factory whose every worker is a fresh in-memory pair; `setup` starts the host (or a hand-driven stand-in) on it. */
export function createMemoryWorkers(setup: (worker: MemoryWorker, index: number) => void): MemoryWorkers {
  const workers: MemoryWorker[] = [];
  return {
    workers,
    factory: () => {
      const worker = createMemoryWorker();
      workers.push(worker);
      setup(worker, workers.length - 1);
      return worker.port;
    },
  };
}
