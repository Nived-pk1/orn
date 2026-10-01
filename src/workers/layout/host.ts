/**
 * The layout worker's entry logic: the real host over a port, running the real handlers over the ELK adapter. `entry.ts` starts it
 * in the browser; the real-thread tests start it under Node (tests/fixtures/layout/worker.ts). `make` is how an ELK instance is
 * obtained: injected so a test can give a fake that throws or hangs. Both ELK and the clock stay out of the pure code.
 */
import { createElkEngine, type ElkLike } from '@/layout/elk';
import { createRpcHost, type RpcHost } from '@/workers/rpc/host';
import type { RpcMessagePort } from '@/workers/rpc/contracts';
import { createLayoutHandlers } from './handlers';

export function startLayoutHost(port: RpcMessagePort, make: () => ElkLike | Promise<ElkLike>, clock: () => number): RpcHost {
  return createRpcHost(port, createLayoutHandlers(createElkEngine({ make, clock }), clock));
}
