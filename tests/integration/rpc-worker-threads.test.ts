/**
 * The RPC library over REAL `node:worker_threads` (step 4.1, IMPLEMENTATION_PLAN Phase 4): the real host runs in the
 * thread (`tests/fixtures/rpc/worker.ts` under tsx). Nothing sleeps: every wait is on an event or an answer. The
 * 60 s per-test limit is a resource limit for thread start-up under load, never an assertion.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnTestWorker } from '@/test-support/rpc-node-port';
import { TEST_SPECS, type TestApi } from '@/test-support/rpc-test-api';
import { createRpcClient, callWithRetry, type RpcClient, type RpcClientOptions, type WorkerEvent } from '@/workers/rpc';

const LIMIT = 60_000;
const clients: RpcClient<TestApi>[] = [];

function start(options: Partial<RpcClientOptions<TestApi>> = {}): { client: RpcClient<TestApi>; events: WorkerEvent[] } {
  const events: WorkerEvent[] = [];
  const client = createRpcClient<TestApi>({ factory: spawnTestWorker, specs: TEST_SPECS, options: { ...options, onEvent: (e) => events.push(e) } });
  clients.push(client);
  return { client, events };
}

afterEach(() => {
  for (const client of clients.splice(0)) client.terminate();
});

describe('rpc over worker_threads', () => {
  it('answers values, errors and progress across a real thread', async () => {
    const { client } = start();
    expect(await client.add({ a: 20, b: 22 })).toEqual({ ok: true, value: 42 });
    expect(await client.boom({ message: 'kaput' })).toEqual({ ok: false, error: { code: 'INTERNAL', message: 'kaput' } });
    expect(await client.notReady({})).toMatchObject({ ok: false, error: { code: 'NOT_READY' } });
    const seen: number[] = [];
    expect(await client.count({ n: 3 }, { onProgress: (done) => seen.push(done) })).toEqual({ ok: true, value: 3 });
    expect(seen).toEqual([1, 2, 3]);
    expect(await client.echo({ value: { nested: [1, 'two', null] } })).toEqual({ ok: true, value: { nested: [1, 'two', null] } });
    expect(await client.badResult({})).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    expect(await client.echo({ value: () => 1 })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  }, LIMIT);

  it('a crash by process exit fails the call, restarts the worker, and it works again (no retry for a non-idempotent method)', async () => {
    const { client, events } = start();
    expect(await callWithRetry(client, TEST_SPECS, 'crash', {})).toMatchObject({ ok: false, error: { code: 'WORKER_CRASHED' } });
    expect(events.map((e) => e.type)).toEqual(['crash', 'restart']);
    expect(events[0]).toMatchObject({ type: 'crash', reason: 'exit', willRestart: true });
    expect(await client.add({ a: 1, b: 1 })).toEqual({ ok: true, value: 2 });
  }, LIMIT);

  it('a hang ends by timeout: the worker is terminated and restarted', async () => {
    const { client, events } = start();
    expect(await client.hang({}, { timeoutMs: 300 })).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(events.map((e) => e.type)).toEqual(['timeout', 'restart']);
    expect(await client.add({ a: 3, b: 4 })).toEqual({ ok: true, value: 7 });
  }, LIMIT);

  it('a busy synchronous task cannot see a cancel: it ends by timeout and termination', async () => {
    const { client, events } = start();
    expect(await client.add({ a: 0, b: 0 })).toEqual({ ok: true, value: 0 });
    const controller = new AbortController();
    const busy = client.busy({ ms: 60_000 }, { signal: controller.signal });
    controller.abort();
    expect(await busy).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    // The worker is still spinning: it never processes the cancel, so the next call cannot be answered.
    expect(await client.add({ a: 1, b: 1 }, { timeoutMs: 500 })).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(events.map((e) => e.type)).toEqual(['timeout', 'restart']);
    expect(await client.add({ a: 1, b: 1 })).toEqual({ ok: true, value: 2 });
  }, LIMIT);

  it('a cooperative handler sees the cancel through its AbortSignal', async () => {
    const { client, events } = start();
    const controller = new AbortController();
    const call = client.untilAborted({}, { signal: controller.signal });
    controller.abort();
    expect(await call).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    expect(await client.add({ a: 1, b: 2 })).toEqual({ ok: true, value: 3 });
    expect(events).toEqual([]);
  }, LIMIT);

  it('answers BUSY beyond maxInFlight', async () => {
    const { client, events } = start({ maxInFlight: 2 });
    const one = client.hang({}, { timeoutMs: 20_000 });
    const two = client.hang({}, { timeoutMs: 20_000 });
    expect(await client.add({ a: 1, b: 1 })).toMatchObject({ ok: false, error: { code: 'BUSY' } });
    expect(events).toContainEqual({ type: 'busy', method: 'add', inFlight: 2 });
    client.terminate();
    expect(await one).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    expect(await two).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
  }, LIMIT);

  it('transfers an ArrayBuffer both ways: detached on the sender, intact on the receiver', async () => {
    const { client } = start();
    const expected = new Uint8Array(1_000_000).map((_, i) => i % 251);
    const buffer = expected.slice().buffer;
    const result = await client.transfer({ buffer }, { transfer: [buffer] });
    expect(buffer.byteLength).toBe(0);
    expect(result.ok && result.value.length).toBe(1_000_000);
    expect(result.ok && new Uint8Array(result.value.buffer)).toEqual(expected);
  }, LIMIT);
});
