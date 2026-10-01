/**
 * Step 4.4 (docs/PERFORMANCE_ARCHITECTURE.md §2 row "Layout (≤ 400 nodes, worker): < 300 ms; hard timeout 2 s", bench "worker code
 * in Node"): the layout handlers over REAL elkjs 0.12.0 (`createLayoutHandlers` + `createElkEngine`, a fresh ELK instance per
 * call, no cache), on the design tier's 400-node projections, plus synthetic 400-node / 800-edge graphs, radial and stress
 * (informal), the in-house fallback at 400 / 800 and at the caps, and one round trip through a real worker thread (thread and ELK
 * already started: only the call). Run once, alone; not `bench:baseline`, not `bench:compare`.
 */
import { afterAll, bench, describe } from 'vitest';
import { createFallbackEngine, createElkEngine, loadElk } from '@/layout';
import type { LayoutRequest, LayoutResult } from '@/layout/contracts';
import { MAX_LAYOUT_EDGES, MAX_LAYOUT_NODES } from '@/layout/contracts';
import { projectionRequest, randomRequest } from '@/test-support/layout-kit';
import { designLayoutRequests, demoLayoutRequests, type NamedLayoutRequest } from '@/test-support/layout-projections';
import { spawnLayoutWorker } from '@/test-support/rpc-node-port';
import { createLayoutHandlers } from '@/workers/layout/handlers';
import { LAYOUT_SPECS } from '@/workers/layout/specs';
import { createRpcClient, type RpcClient } from '@/workers/rpc';
import type { LayoutWorkerApi } from '@/workers/rpc/contracts';

const OPTIONS = { time: 3000, iterations: 10, warmupTime: 500, warmupIterations: 2 } as const;
const clock = () => performance.now();
const make = await loadElk();
const ctx = { signal: new AbortController().signal, progress: () => undefined };
const handlers = createLayoutHandlers(createElkEngine({ make, clock }), clock);
const fallback = createFallbackEngine({ reason: 'timeout', clock });

const fail = (what: string, result: unknown): never => {
  throw new Error(`bench: ${what}: ${JSON.stringify(result).slice(0, 300)}`);
};
async function elk(request: LayoutRequest): Promise<void> {
  const result: LayoutResult = await handlers.layout(request, ctx);
  if (result.engine !== 'elk') fail('ELK did not answer (the fallback did)', result.notes);
}
async function fallbackRun(request: LayoutRequest): Promise<void> {
  const result = await fallback.layout(request, ctx.signal);
  if (Object.keys(result.positions).length !== request.nodes.length) fail('the fallback lost a node', result.bounds);
}

const design = designLayoutRequests();
const pick = (prefix: string, view: string): NamedLayoutRequest => {
  const found = design.find((item) => item.name.startsWith(`design/${prefix}: ${view}`));
  if (found === undefined) throw new Error(`no design-tier projection "${prefix}: ${view}"`);
  return found;
};
const dense = pick('dense', 'precursor explorer');
const hub = pick('hub_explosion', 'reaction explorer');
const denseNavigator = pick('dense', 'navigator (');
const demoReaction = demoLayoutRequests().find((item) => item.name.includes('reaction explorer'));
if (demoReaction === undefined) throw new Error('no demo reaction explorer');
const denseNavigatorBundled = projectionRequest(denseNavigator.projection, { edges: 'bundled' });
const denseBundled = projectionRequest(dense.projection, { edges: 'bundled' });
const hubBundled = projectionRequest(hub.projection, { edges: 'bundled' });
const synthetic = randomRequest({ nodes: 400, edges: 800, seed: 5, acyclic: true });
const syntheticCyclic = randomRequest({ nodes: 400, edges: 800, seed: 5, selfLoops: 5, parallel: 10 });
const atTheCaps = randomRequest({ nodes: MAX_LAYOUT_NODES, edges: MAX_LAYOUT_EDGES, seed: 9, selfLoops: 20, parallel: 40 });

describe('layout: ELK layered, worker code in Node (step 4.4)', () => {
  bench(`design tier, ${dense.name}`, () => elk(dense.request), OPTIONS);
  bench(`design tier, ${hub.name}`, () => elk(hub.request), OPTIONS);
  bench(`design tier, ${denseNavigator.name}`, () => elk(denseNavigator.request), OPTIONS);
  bench(`demo, ${demoReaction.name}`, () => elk(demoReaction.request), OPTIONS);
  bench(`bundled, design tier, ${dense.name}`, () => elk(denseBundled), OPTIONS);
  bench(`bundled, design tier, ${hub.name}`, () => elk(hubBundled), OPTIONS);
  bench(`bundled, design tier, ${denseNavigator.name}`, () => elk(denseNavigatorBundled), OPTIONS);
  bench('synthetic 400 nodes / 800 edges, acyclic', () => elk(synthetic), OPTIONS);
  bench('synthetic 400 nodes / 800 edges, with cycles, loops and parallel edges', () => elk(syntheticCyclic), OPTIONS);
});

describe('layout: radial and stress (informal), worker code in Node (step 4.4)', () => {
  bench(`radial, design tier, ${dense.name}`, () => elk({ ...dense.request, algorithm: 'radial' }), OPTIONS);
  bench('radial, synthetic 400 nodes / 800 edges with cycles', () => elk({ ...syntheticCyclic, algorithm: 'radial' }), OPTIONS);
  bench('stress, synthetic 40 nodes / 80 edges', () => elk({ ...randomRequest({ nodes: 40, edges: 80, seed: 5 }), algorithm: 'stress' }), OPTIONS);
  bench('stress, synthetic 100 nodes / 200 edges', () => elk({ ...randomRequest({ nodes: 100, edges: 200, seed: 5 }), algorithm: 'stress' }), OPTIONS);
});

describe('layout: the fallback, worker code in Node (step 4.4)', () => {
  bench('400 nodes / 800 edges, with cycles, loops and parallel edges', () => fallbackRun(syntheticCyclic), OPTIONS);
  bench(`design tier, ${dense.name}`, () => fallbackRun(dense.request), OPTIONS);
  bench('2,000 nodes / 4,000 edges (the caps)', () => fallbackRun(atTheCaps), OPTIONS);
});

const clients: RpcClient<LayoutWorkerApi>[] = [];
afterAll(() => {
  for (const client of clients.splice(0)) client.terminate();
});
const threadClient = createRpcClient<LayoutWorkerApi>({ factory: () => spawnLayoutWorker('real'), specs: LAYOUT_SPECS });
clients.push(threadClient);
const small = demoReaction.request;
// the thread is started and ELK loaded before the first measured iteration
const warm = await threadClient.layout(small, { timeoutMs: 30_000 });
if (!warm.ok || warm.value.engine !== 'elk') throw new Error('bench: the layout thread did not answer with ELK: ' + JSON.stringify(warm).slice(0, 400));

describe('layout: one round trip through a real worker thread (step 4.4)', () => {
  bench(
    `${demoReaction.name}, ELK in a running thread (request and answer through the port; no cache)`,
    async () => {
      const answer = await threadClient.layout(small);
      if (!answer.ok || answer.value.engine !== 'elk') fail('the thread did not answer with ELK', answer);
    },
    OPTIONS,
  );
});
