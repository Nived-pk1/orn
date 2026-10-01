/**
 * Fixture for the search worker's real-thread test (step 4.5): the real search host over `worker_threads`' parent port, started by
 * `spawnSearchWorker` (src/test-support/rpc-node-port.ts) under tsx so the `@/` imports resolve.
 */
import { parentPort } from 'node:worker_threads';
import { nodeParentPort } from '@/test-support/rpc-node-port';
import { startSearchHost } from '@/workers/search/host';

if (parentPort === null) throw new Error('this file runs only as a worker thread');
startSearchHost(nodeParentPort(parentPort));
