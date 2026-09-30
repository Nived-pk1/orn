/**
 * Chem worker entry (browser dedicated worker). Creating the worker in the app is Phase 5 (D7); the host it starts is
 * `startChemHost`, which the tests also start over an in-memory port and a `worker_threads` port. RDKit and its WASM are loaded
 * lazily, on the first call, from the build's own asset (no CDN).
 */
import { loadRdkit } from '@/chem';
import { RDKIT_WASM_URL } from '@/chem/rdkit/wasm-url';
import { workerScopePort, type WorkerScopeLike } from '@/workers/rpc/browser-port';
import { startChemHost } from './host';

startChemHost(workerScopePort(self as unknown as WorkerScopeLike), () => loadRdkit({ wasmUrl: RDKIT_WASM_URL }));
