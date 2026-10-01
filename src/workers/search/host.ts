/**
 * The search worker's entry logic: the real host over a port, running the real handlers over a fresh engine. `entry.ts` starts it
 * in the browser; the real-thread test starts it under Node (tests/fixtures/search/worker.ts).
 */
import { createRpcHost, type RpcHost } from '@/workers/rpc/host';
import type { RpcMessagePort } from '@/workers/rpc/contracts';
import { createSearchHandlers } from './handlers';

export function startSearchHost(port: RpcMessagePort): RpcHost {
  return createRpcHost(port, createSearchHandlers());
}
