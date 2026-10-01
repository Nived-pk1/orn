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

const COMPUTE_FIXTURE = new URL('../../tests/fixtures/compute/worker.ts', import.meta.url);

/**
 * Starts the real compute worker entry (`startComputeHost`) in a real thread. `crashOn` ends the thread, before the host
 * sees it, when a request for that method arrives (an induced crash; nothing in the host or the handlers changes).
 */
export const spawnComputeWorker = (crashOn?: string): RpcPort =>
  nodeWorkerPort(new Worker(COMPUTE_FIXTURE, { execArgv: ['--import', 'tsx'], workerData: { crashOn } }));

const CHEM_FIXTURE = new URL('../../tests/fixtures/chem/worker.ts', import.meta.url);

/** Starts the real chem worker (`startChemHost` over RDKit) in a real thread. */
export const spawnChemWorker: WorkerFactory = () => nodeWorkerPort(new Worker(CHEM_FIXTURE, { execArgv: ['--import', 'tsx'] }));

const LAYOUT_FIXTURE = new URL('../../tests/fixtures/layout/worker.ts', import.meta.url);

/**
 * Starts the real layout worker (`startLayoutHost`) in a real thread. `mode`: `real` (elkjs), `busy` (ELK replaced by a
 * synchronous loop of `busyMs`, uninterruptible) or `throw` (ELK replaced by one that throws); the fallback is always real.
 */
export const spawnLayoutWorker = (mode: 'real' | 'busy' | 'throw' = 'real', busyMs = 5_000): RpcPort =>
  nodeWorkerPort(new Worker(LAYOUT_FIXTURE, { execArgv: ['--import', 'tsx'], workerData: { mode, busyMs } }));
