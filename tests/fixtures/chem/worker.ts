/**
 * Fixture for the chem worker's real-thread tests and bench (step 4.3a): the real chem host over `worker_threads`' parent port,
 * started by `spawnChemWorker` (src/test-support/rpc-node-port.ts) under tsx so the `@/` imports resolve. Nothing is wrapped:
 * the host, the handlers, the cache and the RDKit adapter are exactly what the browser entry starts; only the way the WASM is
 * found differs (under Node the glue reads the file next to itself).
 */
import { parentPort } from 'node:worker_threads';
import { loadRdkit } from '@/chem';
import { nodeParentPort } from '@/test-support/rpc-node-port';
import { startChemHost } from '@/workers/chem/host';

if (parentPort === null) throw new Error('this file runs only as a worker thread');
startChemHost(nodeParentPort(parentPort), () => loadRdkit());
