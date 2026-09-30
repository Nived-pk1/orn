/**
 * The compute worker's entry logic: the real host over a port, running the real handlers. `entry.ts` calls it with the
 * browser worker scope; the real-thread tests call it with `worker_threads`' parent port (tests/fixtures/compute/worker.ts).
 */
import type { Clock } from '@/core/dataset';
import { createRpcHost, type RpcHost } from '@/workers/rpc/host';
import type { RpcMessagePort } from '@/workers/rpc/contracts';
import { createComputeHandlers } from './handlers';

export function startComputeHost(port: RpcMessagePort, clock: Clock): RpcHost {
  return createRpcHost(port, createComputeHandlers({ nowMs: () => clock.nowMs() }).api);
}
