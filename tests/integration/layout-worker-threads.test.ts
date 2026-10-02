/**
 * The layout worker in a REAL `worker_threads` thread (step 4.4), real elkjs inside it: a layout round trip; the timeout path with a
 * thread that cannot be interrupted (a synchronous busy loop standing in for an ELK that cannot finish): the call ends by TIMEOUT
 * at its limit, the thread is terminated, a NEW thread answers the fallback with `fallbackReason: 'timeout'`; ELK that throws is
 * `elk_error`; a request over the caps never reaches the thread. Every request and result also passes `structuredClone` (a worker
 * port does exactly that).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRpcClient, createWarmUpGate, type RpcClient } from '@/workers/rpc';
import type { LayoutWorkerApi, WorkerEvent } from '@/workers/rpc/contracts';
import { createLayoutService, LAYOUT_SPECS, type LayoutService } from '@/workers/layout';
import { spawnLayoutWorker } from '@/test-support/rpc-node-port';
import { layoutProblems, randomRequest, request } from '@/test-support/layout-kit';

/** Starting a thread under tsx takes seconds when the whole suite runs in parallel (the default 5 s is too tight). */
const THREAD_TEST_TIMEOUT_MS = 60_000;

const running: RpcClient<LayoutWorkerApi>[] = [];
afterEach(() => {
  for (const client of running.splice(0)) client.terminate();
});

function start(mode: 'real' | 'busy' | 'throw' = 'real', busyMs = 5_000): { client: RpcClient<LayoutWorkerApi>; events: WorkerEvent[]; service: LayoutService; warm: () => Promise<unknown> } {
  const events: WorkerEvent[] = [];
  const gate = createWarmUpGate<LayoutWorkerApi>();
  const client = createRpcClient<LayoutWorkerApi>({ factory: () => spawnLayoutWorker(mode, busyMs), specs: LAYOUT_SPECS, options: { onEvent: (event) => events.push(event), onRestart: gate.onRestart } });
  running.push(client);
  return { client, events, service: createLayoutService({ client, gate }), warm: () => gate.ready(client, LAYOUT_SPECS) };
}

const small = () => request({ nodes: ['a', 'b', 'c', 'd'], edges: [['a', 'b'], ['b', 'c'], ['c', 'a'], ['a', 'd']] });

describe('the layout worker in a real thread', () => {
  it('lays out with real ELK, all three algorithms; the answer is valid and structured-clone safe; nothing restarted', async () => {
    const { service, events } = start();
    for (const algorithm of ['layered', 'radial', 'stress'] as const) {
      const req = { ...small(), algorithm, requestId: algorithm };
      const out = await service.layout(`view-${algorithm}`, structuredClone(req));
      if (!out.ok) throw new Error(out.message);
      expect(out.result).toMatchObject({ engine: 'elk', requestId: algorithm });
      expect(layoutProblems(req, out.result)).toEqual([]);
      structuredClone(out.result);
    }
    expect(events).toEqual([]);
  }, THREAD_TEST_TIMEOUT_MS);

  it('a layout that cannot finish: TIMEOUT at the limit, the thread is terminated, a NEW thread answers the fallback (reason `timeout`)', async () => {
    const { service, events, warm } = start('busy', 8_000);
    await warm(); // ELK is loaded first (step 5.0): the 500 ms below is a calculation limit
    const began = performance.now();
    const out = await service.layout('view', small(), { timeoutMs: 500 });
    const took = performance.now() - began;
    if (!out.ok) throw new Error(out.message);
    expect(out.result).toMatchObject({ engine: 'fallback', fallbackReason: 'timeout' });
    expect(layoutProblems(small(), out.result)).toEqual([]);
    expect(took).toBeGreaterThanOrEqual(450);
    expect(took).toBeLessThan(7_000); // the busy loop (8 s) was not waited for: it was terminated
    expect(events.filter((event) => event.type === 'timeout')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'restart')).toHaveLength(1);
    expect(service.stats()).toMatchObject({ elk: 0, fallback: { timeout: 1 }, unavailable: 0 });
    // the answer was NOT cached: the next request tries ELK again (and times out again, in the busy thread)
    expect(service.stats().cacheSize).toBe(0);
  }, THREAD_TEST_TIMEOUT_MS);

  it('ELK that throws inside the worker is `elk_error`: the fallback answers from the same thread, with a note, and the answer is cached', async () => {
    const { service, events } = start('throw');
    const out = await service.layout('view', small());
    if (!out.ok) throw new Error(out.message);
    expect(out.result).toMatchObject({ engine: 'fallback', fallbackReason: 'elk_error' });
    expect(out.result.notes.some((note) => note.includes('ELK failed (ELK blew up (test))'))).toBe(true);
    expect(events).toEqual([]);
    expect((await service.layout('view', small())).ok && (await service.layout('view', small()))).toMatchObject({ ok: true, cached: true });
  }, THREAD_TEST_TIMEOUT_MS);

  it('a request over the caps or not sorted never reaches the thread: refused as a value', async () => {
    const { service, events } = start();
    expect(await service.layout('v', randomRequest({ nodes: 2_001, edges: 10, seed: 1 }))).toMatchObject({ ok: false, code: 'TOO_LARGE' });
    expect(await service.layout('v', randomRequest({ nodes: 10, edges: 4_001, seed: 1 }))).toMatchObject({ ok: false, code: 'TOO_LARGE' });
    const unsorted = small();
    expect(await service.layout('v', { ...unsorted, nodes: [...unsorted.nodes].reverse() })).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
    expect(events).toEqual([]);
  }, THREAD_TEST_TIMEOUT_MS);

  it('the worker itself refuses an unsorted request as BAD_REQUEST (a caller that skipped the service)', async () => {
    const { client } = start();
    const base = small();
    expect(await client.layout({ ...base, nodes: [...base.nodes].reverse() })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(await client.layoutFallback({ request: { ...base, nodes: [...base.nodes].reverse() }, reason: 'timeout' })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(await client.layoutFallback({ request: base, reason: 'because' as never })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  }, THREAD_TEST_TIMEOUT_MS);
});
