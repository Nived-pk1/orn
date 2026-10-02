/**
 * The chem worker's entry logic: the real host over a port, running the real handlers over the RDKit adapter behind the
 * facts-and-depiction cache. `entry.ts` starts it in the browser; the real-thread tests start it under Node
 * (tests/fixtures/chem/worker.ts). `load` is how the RDKit module is obtained: injected so the browser passes the URL of the
 * bundled WASM and Node passes nothing; `clock` (milliseconds, monotonic) times `warmUp`.
 */
import { createRdkitToolkit, withChemCache, type RdkitLoad } from '@/chem';
import { createRpcHost, type RpcHost } from '@/workers/rpc/host';
import type { RpcMessagePort } from '@/workers/rpc/contracts';
import { createChemHandlers } from './handlers';

export function startChemHost(port: RpcMessagePort, load: RdkitLoad, clock: () => number): RpcHost {
  return createRpcHost(port, createChemHandlers(withChemCache(createRdkitToolkit({ load })), clock));
}
