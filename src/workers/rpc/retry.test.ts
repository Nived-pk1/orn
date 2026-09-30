import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryWorkers, type MemoryWorker } from '@/test-support/rpc-memory-port';
import { TEST_SPECS, testHandlers, type TestApi } from '@/test-support/rpc-test-api';
import { createRpcClient } from './client';
import type { RpcMessage, WorkerEvent } from './contracts';
import { createRpcHost } from './host';
import { callWithRetry } from './retry';

/** The first worker dies on its first request; later ones are healthy. */
function flaky(crashesBeforeHealthy: number, onRestart?: () => void) {
  const events: WorkerEvent[] = [];
  const rig = createMemoryWorkers((worker: MemoryWorker, index) => {
    if (index < crashesBeforeHealthy) worker.host.onMessage((m) => (m as RpcMessage).type === 'request' && worker.crash('exit'));
    else createRpcHost(worker.host, testHandlers);
  });
  const client = createRpcClient<TestApi>({
    factory: rig.factory,
    specs: TEST_SPECS,
    options: { onEvent: (e) => events.push(e), ...(onRestart === undefined ? {} : { onRestart }) },
  });
  return { client, rig, events };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('callWithRetry', () => {
  it('retries an idempotent method once after the worker crashed, after the restart hook ran', async () => {
    const order: string[] = [];
    const { client, rig } = flaky(1, () => void order.push('hook'));
    const result = await callWithRetry(client, TEST_SPECS, 'add', { a: 2, b: 2 });
    expect(result).toEqual({ ok: true, value: 4 });
    expect(rig.workers).toHaveLength(2);
    expect(order).toEqual(['hook']);
  });

  it('never retries a method whose spec is not idempotent', async () => {
    const { client, rig } = flaky(1);
    const result = await callWithRetry(client, TEST_SPECS, 'crash', {});
    expect(result).toMatchObject({ ok: false, error: { code: 'WORKER_CRASHED' } });
    expect(rig.workers[1]?.received).toEqual([]);
  });

  it('retries only once: a second crash is surfaced', async () => {
    const { client, rig } = flaky(2);
    const result = await callWithRetry(client, TEST_SPECS, 'add', { a: 1, b: 1 });
    expect(result).toMatchObject({ ok: false, error: { code: 'WORKER_CRASHED' } });
    expect(rig.workers).toHaveLength(3);
  });

  it('does not retry a timeout, an error answer or a cancel', async () => {
    const { client, rig } = flaky(0);
    const slow = callWithRetry(client, TEST_SPECS, 'hang', {});
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await slow).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(rig.workers).toHaveLength(2);
    expect(await callWithRetry(client, TEST_SPECS, 'boom', { message: 'x' })).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    const controller = new AbortController();
    controller.abort();
    expect(await callWithRetry(client, TEST_SPECS, 'add', { a: 1, b: 1 }, { signal: controller.signal })).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
  });

  it('a client that stays down answers WORKER_CRASHED after one retry, without looping', async () => {
    const { client } = flaky(10);
    const down = createRpcClient<TestApi>({ factory: () => { throw new Error('never'); }, specs: TEST_SPECS });
    expect(await callWithRetry(down, TEST_SPECS, 'add', { a: 1, b: 1 })).toMatchObject({ ok: false, error: { code: 'WORKER_CRASHED' } });
    expect(await callWithRetry(client, TEST_SPECS, 'add', { a: 1, b: 1 })).toMatchObject({ ok: false });
  });

  it('when a TIMEOUT on one call terminates the worker, the other pending calls answer WORKER_CRASHED and an idempotent one is retried', async () => {
    const events: WorkerEvent[] = [];
    const rig = createMemoryWorkers((worker, index) => {
      // the first worker never answers `echo`; the restarted one is healthy
      createRpcHost(worker.host, index === 0 ? { ...testHandlers, echo: () => new Promise<never>(() => undefined) } : testHandlers);
    });
    const client = createRpcClient<TestApi>({ factory: rig.factory, specs: TEST_SPECS, options: { onEvent: (e) => events.push(e) } });
    const culprit = client.hang({});
    const victimRaw = client.echo({ value: 1 });
    const victimRetried = callWithRetry(client, TEST_SPECS, 'echo', { value: 7 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await culprit).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(await victimRaw).toMatchObject({ ok: false, error: { code: 'WORKER_CRASHED' } });
    expect(await victimRetried).toEqual({ ok: true, value: 7 });
    expect(events.filter((e) => e.type === 'timeout')).toHaveLength(1);
    expect(rig.workers).toHaveLength(2);
  });
});
