/**
 * Fixture for the compute worker's real-thread tests and bench (step 4.2b): the real compute host over `worker_threads`'
 * parent port, started by `spawnComputeWorker` (src/test-support/rpc-node-port.ts) under tsx so the `@/` imports resolve.
 * Only the port is wrapped, and only for tests: with `workerData.crashOn` set, a request for that method ends the thread
 * before the host sees it (an induced crash). The host and the handlers are exactly what the browser entry starts.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { nodeParentPort } from '@/test-support/rpc-node-port';
import { startComputeHost } from '@/workers/compute/host';
import type { RpcMessagePort } from '@/workers/rpc/contracts';

if (parentPort === null) throw new Error('this file runs only as a worker thread');
const crashOn = (workerData as { crashOn?: string } | null)?.crashOn;
const real = nodeParentPort(parentPort);
const port: RpcMessagePort =
  crashOn === undefined
    ? real
    : {
        postMessage: (message, transfer) => real.postMessage(message, transfer),
        onMessage: (listener) =>
          real.onMessage((message) => {
            const { type, method } = (typeof message === 'object' && message !== null ? message : {}) as { type?: unknown; method?: unknown };
            if (type === 'request' && method === crashOn) process.exit(3);
            listener(message);
          }),
      };
startComputeHost(port, { nowMs: () => performance.now() });
