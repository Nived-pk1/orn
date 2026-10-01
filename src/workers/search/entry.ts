/**
 * Search worker entry (browser dedicated worker). Creating the worker in the app is Phase 5 (D7); the host it starts is
 * `startSearchHost`, which the tests also start over an in-memory port and a `worker_threads` port. It imports `zod-jitless`
 * first (ADR-035), like every worker entry.
 */
import '@/workers/zod-jitless';
import { workerScopePort, type WorkerScopeLike } from '@/workers/rpc/browser-port';
import { startSearchHost } from './host';

startSearchHost(workerScopePort(self as unknown as WorkerScopeLike));
