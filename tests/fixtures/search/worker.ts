/**
 * Fixture for the search worker's real-thread test (step 4.5): the real search host over `worker_threads`' parent port, started by
 * `spawnSearchWorker` (src/test-support/rpc-node-port.ts) under tsx so the `@/` imports resolve. Only for tests, `workerData.crashOn`
 * ends the thread when a request for that method arrives (step 4.6).
 */
import { parentPort, workerData } from 'node:worker_threads';
import { nodeParentPortCrashingOn } from '@/test-support/rpc-node-port';
import { startSearchHost } from '@/workers/search/host';

if (parentPort === null) throw new Error('this file runs only as a worker thread');
startSearchHost(nodeParentPortCrashingOn(parentPort, (workerData as { crashOn?: string } | null)?.crashOn));
