/**
 * Node `worker_threads` adapters for the RPC ports, and a factory that starts the test fixture worker (step 4.1).
 * The fixture is TypeScript importing `@/...`, so the thread runs under tsx's import hook.
 */
import { Worker, type MessagePort } from 'node:worker_threads';
import type { RpcMessage, RpcMessagePort, RpcPort, WorkerFactory } from '@/workers/rpc/contracts';

export function nodeWorkerPort(worker: Worker): RpcPort {
  const on = (event: string, listener: (value: never) => void): (() => void) => {
    worker.on(event, listener as (...args: unknown[]) => void);
    return () => worker.off(event, listener as (...args: unknown[]) => void);
  };
  return {
    postMessage: (message: RpcMessage, transfer) => worker.postMessage(message, transfer === undefined ? undefined : [...transfer] as never),
    onMessage: (listener) => on('message', listener),
    onError: (listener) => on('error', listener),
    onMessageError: (listener) => on('messageerror', listener),
    onExit: (listener) => on('exit', listener),
    terminate() {
      // An 'error' with no listener would throw in the main thread; the client has already unsubscribed.
      worker.on('error', () => undefined);
      void worker.terminate();
    },
  };
}

/** The host's side, inside the thread: `parentPort`. */
export function nodeParentPort(port: MessagePort): RpcMessagePort {
  return {
    postMessage: (message, transfer) => port.postMessage(message, transfer === undefined ? undefined : ([...transfer] as never)),
    onMessage: (listener) => {
      port.on('message', listener);
      return () => port.off('message', listener);
    },
  };
}

const FIXTURE = new URL('../../tests/fixtures/rpc/worker.ts', import.meta.url);

/** Starts the fixture worker (`TestApi` from `rpc-test-api.ts`) in a real thread. */
export const spawnTestWorker: WorkerFactory = () => nodeWorkerPort(new Worker(FIXTURE, { execArgv: ['--import', 'tsx'] }));
