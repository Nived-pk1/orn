/**
 * The layout worker's orchestration over an in-memory port (step 4.4; every message passes `structuredClone`) and a fake ELK
 * (src/test-support/layout-fakes.ts): the specs, the handlers (shape checks, the `elk_error` and `engine_unavailable` fallbacks),
 * and the main-side service: caps and sorting refused as values, the cache, a newer request superseding an older one, the
 * timeout path (the worker is replaced and the NEW worker answers the fallback), a crash retried once, no worker able to answer.
 * The real-thread twin with real ELK is tests/integration/layout-worker-threads.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { LayoutRequest } from '@/layout/contracts';
import { MAX_LAYOUT_EDGES, MAX_LAYOUT_NODES, MAX_STRESS_NODES } from '@/layout/contracts';
import { createElkEngine } from '@/layout/elk';
import { layoutProblems, randomRequest, request } from '@/test-support/layout-kit';
import { createFakeElk, type FakeElk } from '@/test-support/layout-fakes';
import { createMemoryWorkers } from '@/test-support/rpc-memory-port';
import { createRpcClient, createRpcHost } from '@/workers/rpc';
import type { LayoutWorkerApi, WorkerEvent } from '@/workers/rpc/contracts';
import { createLayoutHandlers } from './handlers';
import { createLayoutService, LAYOUT_CACHE_SIZE } from './service';
import { LAYOUT_CALL_TIMEOUT_MS, LAYOUT_SPECS } from './specs';

const clock = () => performance.now();
const small = (requestId = 'req'): LayoutRequest => request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']], requestId });

function rig(options: { cacheSize?: number; hostless?: boolean } = {}) {
  const elk: FakeElk = createFakeElk();
  const events: WorkerEvent[] = [];
  const workers = createMemoryWorkers((worker) => {
    if (options.hostless !== true) void createRpcHost(worker.host, createLayoutHandlers(createElkEngine({ make: elk.make, clock }), clock));
  });
  const client = createRpcClient<LayoutWorkerApi>({ factory: workers.factory, specs: LAYOUT_SPECS, options: { onEvent: (event) => events.push(event) } });
  const service = createLayoutService({ client, ...(options.cacheSize === undefined ? {} : { cacheSize: options.cacheSize }) });
  return { elk, events, workers, client, service };
}

describe('the specs', () => {
  it('both calls are idempotent and limited to 2 s (ADR-034, ADR-007)', () => {
    expect(LAYOUT_CALL_TIMEOUT_MS).toBe(2_000);
    const spec = { idempotent: true, timeoutMs: 2_000 };
    expect(LAYOUT_SPECS).toEqual({ layout: spec, layoutFallback: spec });
    expect(LAYOUT_CACHE_SIZE).toBe(32);
  });
});

describe('the handlers', () => {
  it('layout answers ELK\'s result (engine elk, no reason) through a port that clones every message', async () => {
    const { client, elk } = rig();
    const answer = await client.layout(small());
    if (!answer.ok) throw new Error(answer.error.message);
    expect(answer.value).toMatchObject({ engine: 'elk', requestId: 'req' });
    expect(answer.value.fallbackReason).toBeUndefined();
    expect(Object.keys(answer.value.positions)).toEqual(['a', 'b', 'c']);
    expect(elk.graphs).toHaveLength(1);
    expect(structuredClone(answer.value)).toEqual(answer.value);
  });

  it('a request that is not sorted, has an unknown edge end, or is over the caps is BAD_REQUEST, and ELK is never called', async () => {
    const { client, elk } = rig();
    const base = small();
    const bad: [string, unknown][] = [
      ['nodes not sorted', { ...base, nodes: [...base.nodes].reverse() }],
      ['edges not sorted', { ...base, edges: [...base.edges].reverse() }],
      ['a duplicate node id', { ...base, nodes: [base.nodes[0], base.nodes[0]] }],
      ['an edge to nowhere', { ...base, edges: [{ id: 'e1', from: 'a', to: 'zz' }] }],
      ['a size of zero', { ...base, nodes: [{ ...base.nodes[0], width: 0 }] }],
      ['a seed that is not an integer', { ...base, seed: 1.5 }],
      ['an unknown algorithm', { ...base, algorithm: 'tree' }],
      ['no spacing', { ...base, spacing: undefined }],
      ['a layerHint that is negative', { ...base, nodes: [{ ...base.nodes[0], layerHint: -1 }] }],
      ['too many nodes', randomRequest({ nodes: MAX_LAYOUT_NODES + 1, edges: 1, seed: 1 })],
      ['too many edges', randomRequest({ nodes: 10, edges: MAX_LAYOUT_EDGES + 1, seed: 1 })],
    ];
    for (const [name, params] of bad) expect(await client.layout(params as LayoutRequest), name).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(elk.graphs).toEqual([]);
    expect(await client.layout(randomRequest({ nodes: MAX_LAYOUT_NODES + 1, edges: 1, seed: 1 }))).toMatchObject({ ok: false, error: { message: expect.stringContaining('TOO_LARGE') } });
  });

  it('exactly at the caps is accepted (2,000 nodes, 4,000 edges)', async () => {
    const { client } = rig();
    const answer = await client.layout(randomRequest({ nodes: MAX_LAYOUT_NODES, edges: MAX_LAYOUT_EDGES, seed: 2 }));
    expect(answer.ok).toBe(true);
  });

  it('ELK that throws: the fallback answers with reason elk_error and a note saying what ELK said', async () => {
    const { client, elk } = rig();
    elk.failure = new Error('The given graph is not a tree!');
    const answer = await client.layout(small());
    if (!answer.ok) throw new Error(answer.error.message);
    expect(answer.value).toMatchObject({ engine: 'fallback', fallbackReason: 'elk_error' });
    expect(answer.value.notes).toContain('ELK failed (The given graph is not a tree!); the fallback layout was used');
    expect(layoutProblems(small(), answer.value)).toEqual([]);
  });

  it('ELK that cannot be loaded: the fallback answers with reason engine_unavailable', async () => {
    const { client, elk } = rig();
    elk.makeFailure = new Error('the module did not load');
    const answer = await client.layout(small());
    if (!answer.ok) throw new Error(answer.error.message);
    expect(answer.value).toMatchObject({ engine: 'fallback', fallbackReason: 'engine_unavailable' });
    expect(answer.value.notes).toContain('ELK could not be loaded (the module did not load); the fallback layout was used');
  });

  it('layoutFallback answers the fallback alone, with the reason it is given, and never touches ELK', async () => {
    const { client, elk } = rig();
    for (const reason of ['timeout', 'elk_error', 'engine_unavailable'] as const) {
      const answer = await client.layoutFallback({ request: small(), reason });
      expect(answer).toMatchObject({ ok: true, value: { engine: 'fallback', fallbackReason: reason } });
    }
    expect(await client.layoutFallback({ request: small(), reason: 'nope' as never })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    const unsorted = { ...small(), nodes: [...small().nodes].reverse() };
    expect(await client.layoutFallback({ request: unsorted, reason: 'timeout' })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(elk.made).toBe(0);
  });
});

describe('the service: refusals, the cache', () => {
  it('refuses as values, without calling the worker: over the caps, not sorted, malformed', async () => {
    const { service, workers } = rig();
    expect(await service.layout('v', randomRequest({ nodes: MAX_LAYOUT_NODES + 1, edges: 1, seed: 1 }))).toMatchObject({ ok: false, code: 'TOO_LARGE' });
    expect(await service.layout('v', randomRequest({ nodes: 10, edges: MAX_LAYOUT_EDGES + 1, seed: 1 }))).toMatchObject({ ok: false, code: 'TOO_LARGE' });
    const base = small();
    expect(await service.layout('v', { ...base, nodes: [...base.nodes].reverse() })).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
    expect(workers.workers.every((worker) => worker.received.length === 0)).toBe(true);
  });

  it('a repeated request is answered from the cache (the worker is not asked), with the new requestId; the cache is an LRU of the stated size', async () => {
    const { service, elk } = rig({ cacheSize: 2 });
    const first = await service.layout('v', small('one'));
    const again = await service.layout('v', small('two'));
    expect(first).toMatchObject({ ok: true, cached: false });
    expect(again).toMatchObject({ ok: true, cached: true, result: { requestId: 'two' } });
    if (!first.ok || !again.ok) throw new Error('unreachable');
    expect(again.result.positions).toEqual(first.result.positions);
    expect(elk.graphs).toHaveLength(1);
    // three different requests with room for two: the least recently used is evicted
    const variant = (seed: number): LayoutRequest => ({ ...small(), seed });
    await service.layout('v', variant(11));
    await service.layout('v', variant(12)); // evicts the plain request
    await service.layout('v', variant(11)); // hit
    expect(elk.graphs).toHaveLength(3);
    await service.layout('v', small()); // miss again
    expect(elk.graphs).toHaveLength(4);
    expect(service.stats()).toMatchObject({ cacheHits: 2, cacheSize: 2, elk: 4 });
  });

  it('the default size is 32 entries', async () => {
    const { service, elk } = rig();
    for (let seed = 0; seed < LAYOUT_CACHE_SIZE + 3; seed += 1) await service.layout('v', { ...small(), seed });
    expect(service.stats().cacheSize).toBe(LAYOUT_CACHE_SIZE);
    expect(elk.graphs).toHaveLength(LAYOUT_CACHE_SIZE + 3);
  });

  it('only answers that are a function of the request are cached: ELK\'s and the fallback after an ELK error, not one from engine_unavailable', async () => {
    const { service, elk } = rig();
    elk.failure = new Error('boom');
    await service.layout('v', small());
    expect(await service.layout('v', small())).toMatchObject({ ok: true, cached: true, result: { fallbackReason: 'elk_error' } });
    elk.failure = undefined;
    elk.makeFailure = new Error('no module');
    const other = { ...small(), seed: 9 };
    await service.layout('v', other);
    expect(await service.layout('v', other)).toMatchObject({ ok: true, cached: false, result: { fallbackReason: 'engine_unavailable' } });
  });
});

describe('the service: a newer request supersedes an older one for the same view', () => {
  it('the older answers CANCELLED and its result is dropped even though the worker finishes it; the newer is answered', async () => {
    const { service, elk } = rig();
    let release: () => void = () => undefined;
    elk.gate = new Promise<void>((resolve) => void (release = resolve));
    const older = service.layout('view', small('old'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const newer = service.layout('view', { ...small('new'), seed: 5 });
    release();
    expect(await older).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(await newer).toMatchObject({ ok: true, result: { requestId: 'new' } });
    expect(service.stats().superseded).toBe(1);
    expect(elk.graphs).toHaveLength(2); // the older one DID run to the end in the worker: it cannot be interrupted
    expect(service.stats().cacheSize).toBe(1); // and only the newer result was kept
  });

  it('different views do not supersede each other; a cache hit also supersedes what the view had in flight', async () => {
    const { service, elk } = rig();
    await service.layout('a', small());
    let release: () => void = () => undefined;
    elk.gate = new Promise<void>((resolve) => void (release = resolve));
    const one = service.layout('view-1', { ...small('1'), seed: 21 });
    const two = service.layout('view-2', { ...small('2'), seed: 22 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const hit = await service.layout('view-1', small()); // cached under view-1: answers at once and replaces the pending request
    expect(hit).toMatchObject({ ok: true, cached: true });
    release();
    expect(await one).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(await two).toMatchObject({ ok: true });
  });
});

describe('the service: the timeout path', () => {
  it('a layout that never answers: TIMEOUT, the worker is replaced, the NEW worker answers the fallback (reason timeout); ELK is not asked again', async () => {
    const { service, elk, workers, events } = rig();
    elk.hang = true;
    const out = await service.layout('view', small(), { timeoutMs: 40 });
    if (!out.ok) throw new Error(out.message);
    expect(out.result).toMatchObject({ engine: 'fallback', fallbackReason: 'timeout' });
    expect(layoutProblems(small(), out.result)).toEqual([]);
    expect(workers.workers).toHaveLength(2);
    expect(workers.workers[0]?.alive()).toBe(false);
    expect(elk.graphs).toHaveLength(1); // a timeout is not retried (D4), and the fallback never reaches ELK
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(['timeout', 'restart']));
    expect(service.stats()).toMatchObject({ fallback: { timeout: 1 }, unavailable: 0, cacheSize: 0 });
    // a later request tries ELK again (the timeout was not cached)
    elk.hang = false;
    expect(await service.layout('view', small())).toMatchObject({ ok: true, cached: false, result: { engine: 'elk' } });
  });

  it('a superseded request that was waiting out a timeout is not answered with the fallback; it is CANCELLED', async () => {
    const { service, elk } = rig();
    elk.hang = true;
    const older = service.layout('view', small('old'), { timeoutMs: 60 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    elk.hang = false;
    const newer = service.layout('view', { ...small('new'), seed: 3 });
    expect(await older).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(await newer).toMatchObject({ ok: true, result: { engine: 'elk' } });
  });

  it('no worker can answer: layout is UNAVAILABLE as a value (never a layout on the main thread)', async () => {
    const { service, workers } = rig({ hostless: true });
    const out = await service.layout('view', small(), { timeoutMs: 30 });
    expect(out).toMatchObject({ ok: false, code: 'UNAVAILABLE', message: expect.stringContaining('layout is unavailable') });
    expect(workers.workers.length).toBeGreaterThanOrEqual(2);
    expect(service.stats()).toMatchObject({ unavailable: 1, elk: 0 });
  });
});

describe('the service: a crash', () => {
  it('a worker that dies twice under a layout (the retry too) gives no ELK answer: the next worker answers the fallback, reason engine_unavailable, not cached', async () => {
    const { service, elk, workers } = rig();
    elk.gate = new Promise<void>(() => undefined); // every layout is stuck in ELK
    const pending = service.layout('view', small());
    for (let crashed = 0; crashed < 2; crashed += 1) {
      for (let i = 0; i < 200 && workers.workers.length <= crashed; i += 1) await new Promise((resolve) => setTimeout(resolve, 1));
      await new Promise((resolve) => setTimeout(resolve, 5));
      workers.workers[crashed]?.crash('exit');
    }
    const out = await pending;
    if (!out.ok) throw new Error(out.message);
    expect(out.result).toMatchObject({ engine: 'fallback', fallbackReason: 'engine_unavailable' });
    expect(service.stats()).toMatchObject({ fallback: { engine_unavailable: 1 }, cacheSize: 0 });
  });

  it('a worker that dies under a layout is replaced and the call is repeated ONCE (idempotent), and answered by ELK', async () => {
    const { service, elk, workers } = rig();
    elk.gate = new Promise<void>(() => undefined); // the first layout is stuck in ELK
    const pending = service.layout('view', small());
    await new Promise((resolve) => setTimeout(resolve, 0));
    elk.gate = undefined;
    workers.workers[0]?.crash('exit');
    expect(await pending).toMatchObject({ ok: true, result: { engine: 'elk' } });
    expect(workers.workers).toHaveLength(2);
  });
});

describe('the service: stress over the node cap', () => {
  const stress = (nodes: number, requestId = 'req'): LayoutRequest => ({ ...randomRequest({ nodes, edges: nodes, seed: 3 }), algorithm: 'stress', requestId });

  it('lays out MAX_STRESS_NODES nodes with stress, no note', async () => {
    const { service, elk } = rig();
    const outcome = await service.layout('v', stress(MAX_STRESS_NODES));
    expect(outcome).toMatchObject({ ok: true, result: { engine: 'elk', notes: [] } });
    expect(elk.graphs[0]?.layoutOptions['elk.algorithm']).toBe('org.eclipse.elk.stress');
  });

  it('lays out more with ELK layered instead and says so in notes (engine elk), also when the answer comes from the cache', async () => {
    const { service, elk } = rig();
    const first = await service.layout('v', stress(MAX_STRESS_NODES + 1));
    const again = await service.layout('v', stress(MAX_STRESS_NODES + 1, 'two'));
    expect(elk.graphs).toHaveLength(1);
    expect(elk.graphs[0]?.layoutOptions['elk.algorithm']).toBe('layered');
    for (const outcome of [first, again]) {
      if (!outcome.ok) throw new Error('unreachable');
      expect(outcome.result.engine).toBe('elk');
      expect(outcome.result.fallbackReason).toBeUndefined();
      expect(outcome.result.notes.filter((note) => note.includes('laid out with ELK layered instead'))).toHaveLength(1);
      expect(outcome.result.notes.join(' ')).toContain(`limited to ${MAX_STRESS_NODES} nodes`);
    }
    expect(again).toMatchObject({ ok: true, cached: true });
  });

  it('does not change layered or radial requests of any size', async () => {
    const { service, elk } = rig();
    const big = randomRequest({ nodes: MAX_STRESS_NODES + 20, edges: 50, seed: 4 });
    const outcome = await service.layout('v', { ...big, algorithm: 'radial' });
    expect(outcome).toMatchObject({ ok: true, result: { engine: 'elk' } });
    if (outcome.ok) expect(outcome.result.notes.join(' ')).not.toContain('limited to');
    expect(elk.graphs[0]?.layoutOptions['elk.algorithm']).toBe('org.eclipse.elk.radial');
  });
});
