/**
 * The four worker factories (step 4.6, ADR-034, D7). Each call of a factory starts a NEW module worker from the worker's own entry and
 * returns the RPC port over it (`browserWorkerPort`); an RPC client calls its factory again for every restart. Nothing calls these
 * yet: creating the workers and wiring them to the store is Phase 5. They exist so that the production build bundles the four entries
 * (`new Worker(new URL(...), { type: 'module' })` is the form Vite recognises, so each stays a literal here) and `npm run build:smoke`
 * can check the chunks.
 */
import { browserWorkerPort } from '@/workers/rpc/browser-port';
import type { RpcPort, WorkerFactory } from '@/workers/rpc/contracts';

export interface WorkerFactories {
  readonly chem: WorkerFactory;
  readonly layout: WorkerFactory;
  readonly search: WorkerFactory;
  readonly compute: WorkerFactory;
}

export function createWorkerFactories(): WorkerFactories {
  return {
    chem: (): RpcPort => browserWorkerPort(new Worker(new URL('../workers/chem/entry.ts', import.meta.url), { type: 'module', name: 'orn-chem' })),
    layout: (): RpcPort => browserWorkerPort(new Worker(new URL('../workers/layout/entry.ts', import.meta.url), { type: 'module', name: 'orn-layout' })),
    search: (): RpcPort => browserWorkerPort(new Worker(new URL('../workers/search/entry.ts', import.meta.url), { type: 'module', name: 'orn-search' })),
    compute: (): RpcPort => browserWorkerPort(new Worker(new URL('../workers/compute/entry.ts', import.meta.url), { type: 'module', name: 'orn-compute' })),
  };
}
