/**
 * Compute worker entry (browser dedicated worker). Creating the worker in the app is Phase 5 (D7); the host it starts is
 * `startComputeHost`, which the tests also start over an in-memory port and a `worker_threads` port.
 */
import { workerScopePort, type WorkerScopeLike } from '@/workers/rpc/browser-port';
import { startComputeHost } from './host';

// The worker's clock is the only place time enters: `performance.now` is monotonic and exists in every worker.
startComputeHost(workerScopePort(self as unknown as WorkerScopeLike), { nowMs: () => performance.now() });
