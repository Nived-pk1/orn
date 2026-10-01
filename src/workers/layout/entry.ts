/**
 * Layout worker entry (browser dedicated worker). Creating the worker in the app is Phase 5 (D7); the host it starts is
 * `startLayoutHost`, which the tests also start over an in-memory port and a `worker_threads` port. ELK's bundled build is loaded
 * lazily, on the first layout, and runs in THIS thread (ADR-007).
 */
import '@/workers/zod-jitless';
import { loadElk } from '@/layout/elk';
import { workerScopePort, type WorkerScopeLike } from '@/workers/rpc/browser-port';
import { startLayoutHost } from './host';

let factory: ReturnType<typeof loadElk> | undefined;
startLayoutHost(
  workerScopePort(self as unknown as WorkerScopeLike),
  async () => (await (factory ??= loadElk()))(),
  () => performance.now(),
);
