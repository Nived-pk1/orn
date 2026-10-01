/**
 * Fixture for the layout worker's real-thread tests and bench (step 4.4): the real layout host over `worker_threads`' parent port,
 * started by `spawnLayoutWorker` (src/test-support/rpc-node-port.ts) under tsx so the `@/` imports resolve. Only the way an ELK
 * instance is made differs, and only for tests (`workerData.mode`): `real` is the real elkjs (what the browser entry starts);
 * `busy` is an ELK whose layout runs a synchronous loop for `busyMs` (the thing a real ELK does on a graph it cannot finish: it
 * cannot be interrupted, so only terminating the thread ends it); `throw` is an ELK that throws. The fallback is always real.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { loadElk } from '@/layout/elk';
import type { ElkLike } from '@/layout/elk';
import { nodeParentPort } from '@/test-support/rpc-node-port';
import { startLayoutHost } from '@/workers/layout/host';

if (parentPort === null) throw new Error('this file runs only as a worker thread');
const { mode = 'real', busyMs = 5_000 } = (workerData ?? {}) as { mode?: 'real' | 'busy' | 'throw'; busyMs?: number };

let factory: ReturnType<typeof loadElk> | undefined;
const make = async (): Promise<ElkLike> => {
  if (mode === 'throw') return { layout: () => Promise.reject(new Error('ELK blew up (test)')) };
  if (mode === 'busy') {
    return {
      layout: (graph) => {
        const end = Date.now() + busyMs;
        while (Date.now() < end) {
          // a synchronous busy loop, like ELK on a graph it cannot finish
        }
        return Promise.resolve(graph);
      },
    };
  }
  return (await (factory ??= loadElk()))();
};

startLayoutHost(nodeParentPort(parentPort), make, () => performance.now());
