/**
 * Fixture worker for the RPC library's real-thread tests and bench (step 4.1): the real host running the test API.
 * Started by `spawnTestWorker` (src/test-support/rpc-node-port.ts) under tsx so the `@/` imports resolve.
 */
import { parentPort } from 'node:worker_threads';
import { nodeParentPort } from '@/test-support/rpc-node-port';
import { testHandlers } from '@/test-support/rpc-test-api';
import { createRpcHost } from '@/workers/rpc/host';

if (parentPort === null) throw new Error('this file runs only as a worker thread');
createRpcHost(nodeParentPort(parentPort), testHandlers);
