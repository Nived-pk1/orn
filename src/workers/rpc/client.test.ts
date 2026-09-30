import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryWorkers, type MemoryWorkers } from '@/test-support/rpc-memory-port';
import { TEST_SPECS, testHandlers, type TestApi } from '@/test-support/rpc-test-api';
import { createRpcClient } from './client';
import type { RpcClient, RpcClientOptions, WorkerEvent } from './contracts';
import { createRpcHost } from './host';

interface Rig {
  readonly client: RpcClient<TestApi>;
  readonly rig: MemoryWorkers;
  readonly events: WorkerEvent[];
}

function make(options: Partial<RpcClientOptions<TestApi>> = {}, host = true): Rig {
  const events: WorkerEvent[] = [];
  const rig = createMemoryWorkers((worker) => {
    if (host) createRpcHost(worker.host, testHandlers);
  });
  const client = createRpcClient<TestApi>({ factory: rig.factory, specs: TEST_SPECS, options: { ...options, onEvent: (e) => events.push(e) } });
  return { client, rig, events };
}
const types = (events: readonly WorkerEvent[]): string[] => events.map((e) => e.type);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('rpc client: calls', () => {
  it('answers a value and never rejects', async () => {
    const { client } = make();
    expect(await client.add({ a: 2, b: 3 })).toEqual({ ok: true, value: 5 });
    expect(await client.boom({ message: 'x' })).toEqual({ ok: false, error: { code: 'INTERNAL', message: 'x' } });
    expect(await client.notReady({})).toEqual({ ok: false, error: { code: 'NOT_READY', message: 'no replica loaded' } });
  });

  it('delivers progress to the caller, and a throwing listener is reported, not fatal', async () => {
    const { client, events } = make();
    const seen: [number, number | undefined, string | undefined][] = [];
    expect(await client.count({ n: 3 }, { onProgress: (d, t, n) => seen.push([d, t, n]) })).toEqual({ ok: true, value: 3 });
    expect(seen).toEqual([[1, 3, 'step 1'], [2, 3, 'step 2'], [3, 3, 'step 3']]);
    const result = await client.count({ n: 1 }, {
      onProgress: () => {
        throw new Error('listener bug');
      },
    });
    expect(result.ok).toBe(true);
    expect(events).toContainEqual({ type: 'callback_error', message: 'onProgress threw: listener bug' });
  });

  it('a param that is not structured-cloneable is BAD_REQUEST and sends nothing', async () => {
    const { client, rig } = make();
    const result = await client.echo({ value: () => 1 });
    expect(result).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(rig.workers[0]?.received).toEqual([]);
  });

  it('a result the host cannot send is INTERNAL', async () => {
    const { client } = make();
    expect(await client.badResult({})).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  });

  it('moves a transferred buffer: detached on the sender, arrives intact', async () => {
    const { client } = make();
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    const result = await client.transfer({ buffer }, { transfer: [buffer] });
    expect(buffer.byteLength).toBe(0);
    expect(result.ok && new Uint8Array(result.value.buffer)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(result.ok && result.value.length).toBe(4);
  });

  it('rejects a spec without a positive timeout, and the reserved name terminate', () => {
    const rig = createMemoryWorkers(() => undefined);
    const bad = { ...TEST_SPECS, add: { idempotent: true, timeoutMs: 0 } };
    expect(() => createRpcClient<TestApi>({ factory: rig.factory, specs: bad })).toThrow(/positive timeoutMs/);
    const reserved = { ...TEST_SPECS, terminate: { idempotent: true, timeoutMs: 1 } } as never;
    expect(() => createRpcClient<TestApi>({ factory: rig.factory, specs: reserved })).toThrow(/reserved/);
  });
});

describe('rpc client: cancel', () => {
  it('cancel answers CANCELLED at once, tells the host, and the worker stays', async () => {
    const { client, rig } = make();
    const controller = new AbortController();
    const call = client.untilAborted({}, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(await call).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.workers[0]?.received.map((m) => m.type)).toEqual(['request', 'cancel']);
    expect(rig.workers).toHaveLength(1);
  });

  it('an already aborted signal is CANCELLED without sending', async () => {
    const { client, rig } = make();
    const controller = new AbortController();
    controller.abort();
    expect(await client.add({ a: 1, b: 1 }, { signal: controller.signal })).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    expect(rig.workers[0]?.received).toEqual([]);
  });

  it('a response that arrives after a cancel is dropped and reported, never delivered', async () => {
    const { client, rig, events } = make({}, false);
    const controller = new AbortController();
    const call = client.add({ a: 1, b: 1 }, { signal: controller.signal });
    controller.abort();
    const result = await call;
    rig.workers[0]?.sendRaw({ type: 'response', id: 1, ok: true, result: 2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    expect(events).toContainEqual({ type: 'dropped_response', id: 1, method: 'add', reason: 'cancelled' });
  });

  it('a response for an unknown call and a malformed message are reported', async () => {
    const { rig, events } = make({}, false);
    rig.workers[0]?.sendRaw({ type: 'response', id: 99, ok: true, result: 1 });
    rig.workers[0]?.sendRaw('nonsense');
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual([
      { type: 'dropped_response', id: 99, reason: 'unknown' },
      { type: 'dropped_response', id: -1, reason: 'malformed' },
    ]);
  });

  it('a malformed error response is INTERNAL and reported', async () => {
    const { client, rig, events } = make({}, false);
    const call = client.add({ a: 1, b: 1 });
    await vi.advanceTimersByTimeAsync(0);
    rig.workers[0]?.sendRaw({ type: 'response', id: 1, ok: false, error: { code: 'MADE_UP' } });
    expect(await call).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    expect(types(events)).toContain('dropped_response');
  });
});

describe('rpc client: timeout, crash, restart', () => {
  it('a timeout answers TIMEOUT, terminates and restarts the worker, and fails the other calls', async () => {
    const { client, rig, events } = make();
    const slow = client.hang({});
    const other = client.hang({}, { timeoutMs: 60_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await slow).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(await other).toMatchObject({ ok: false, error: { code: 'WORKER_CRASHED' } });
    expect(rig.workers).toHaveLength(2);
    expect(rig.workers[0]?.alive()).toBe(false);
    expect(types(events)).toEqual(['timeout', 'restart']);
    expect(await client.add({ a: 1, b: 2 })).toEqual({ ok: true, value: 3 });
  });

  it.each(['error', 'messageerror', 'exit'] as const)('a crash by %s fails every pending call, then restarts', async (reason) => {
    const { client, rig, events } = make();
    const a = client.hang({});
    const b = client.hang({});
    await vi.advanceTimersByTimeAsync(0);
    rig.workers[0]?.crash(reason);
    expect(await a).toMatchObject({ ok: false, error: { code: 'WORKER_CRASHED' } });
    expect(await b).toMatchObject({ ok: false, error: { code: 'WORKER_CRASHED' } });
    expect(events[0]).toMatchObject({ type: 'crash', reason, pending: 2, willRestart: true });
    expect(events[1]).toEqual({ type: 'restart', reason: 'crash', restarts: 1 });
    expect(await client.add({ a: 1, b: 1 })).toEqual({ ok: true, value: 2 });
  });

  it('after maxRestarts crashes in a row the client stays down and answers WORKER_CRASHED as a value', async () => {
    const { client, rig, events } = make({ maxRestarts: 2 });
    for (let i = 0; i < 3; i += 1) {
      rig.workers[i]?.crash('exit');
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(rig.workers).toHaveLength(3);
    expect(events.filter((e) => e.type === 'crash').map((e) => (e as { willRestart: boolean }).willRestart)).toEqual([true, true, false]);
    expect(await client.add({ a: 1, b: 1 })).toMatchObject({ ok: false, error: { code: 'WORKER_CRASHED', message: expect.stringContaining('down') } });
    expect(rig.workers).toHaveLength(3);
  });

  it('a successful response resets the restart count', async () => {
    const { client, rig } = make({ maxRestarts: 1 });
    for (let i = 0; i < 4; i += 1) {
      rig.workers[i]?.crash('exit');
      await vi.advanceTimersByTimeAsync(0);
      expect(await client.add({ a: i, b: 0 })).toEqual({ ok: true, value: i });
    }
    expect(rig.workers).toHaveLength(5);
  });

  it('repeated timeouts hit the same cap and are reported', async () => {
    const { client, events } = make({ maxRestarts: 1 });
    for (let i = 0; i < 2; i += 1) {
      const call = client.hang({});
      await vi.advanceTimersByTimeAsync(1_000);
      await call;
    }
    expect(events.at(-1)).toMatchObject({ type: 'crash', willRestart: false });
    expect(await client.add({ a: 1, b: 1 })).toMatchObject({ ok: false, error: { code: 'WORKER_CRASHED' } });
  });

  it('a worker that cannot be created leaves the client down', async () => {
    const events: WorkerEvent[] = [];
    const client = createRpcClient<TestApi>({
      factory: () => {
        throw new Error('no worker for you');
      },
      specs: TEST_SPECS,
      options: { onEvent: (e) => events.push(e) },
    });
    expect(await client.add({ a: 1, b: 1 })).toMatchObject({ ok: false, error: { code: 'WORKER_CRASHED' } });
    expect(events[0]).toMatchObject({ type: 'crash', willRestart: false });
  });

  it('terminate cancels pending calls and every later call', async () => {
    const { client, rig } = make();
    const pending = client.hang({});
    await vi.advanceTimersByTimeAsync(0);
    client.terminate();
    client.terminate();
    expect(await pending).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    expect(await client.add({ a: 1, b: 1 })).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    expect(rig.workers[0]?.alive()).toBe(false);
  });
});

describe('rpc client: in-flight cap and the restart hook', () => {
  it('more calls than maxInFlight answer BUSY at once and are reported', async () => {
    const { client, events } = make({ maxInFlight: 2 });
    const one = client.hang({});
    const two = client.hang({});
    expect(await client.add({ a: 1, b: 1 })).toMatchObject({ ok: false, error: { code: 'BUSY' } });
    expect(events).toContainEqual({ type: 'busy', method: 'add', inFlight: 2 });
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all([one, two]);
    expect(await client.add({ a: 1, b: 1 })).toEqual({ ok: true, value: 2 });
  });

  it('runs onRestart after a restart (not at the first start); other calls wait for it; raw calls do not', async () => {
    const order: string[] = [];
    const { client, rig } = make({
      onRestart: async (raw, info) => {
        order.push(`hook start ${info.reason} ${info.attempt}`);
        const reloaded = await raw.add({ a: 20, b: 22 });
        order.push(`hook reloaded ${reloaded.ok ? reloaded.value : 'failed'}`);
      },
    });
    expect(order).toEqual([]);
    rig.workers[0]?.crash('exit');
    await vi.advanceTimersByTimeAsync(0);
    const waiting = client.add({ a: 1, b: 1 }).then((r) => {
      order.push('outside call answered');
      return r;
    });
    expect(await waiting).toEqual({ ok: true, value: 2 });
    expect(order).toEqual(['hook start crash 1', 'hook reloaded 42', 'outside call answered']);
    expect(rig.workers[1]?.received.map((m) => (m.type === 'request' ? m.id : -1))).toEqual([1, 2]);
  });

  it('a hook that fails is reported and calls proceed', async () => {
    const { client, rig, events } = make({
      onRestart: async () => {
        throw new Error('replica reload failed');
      },
    });
    rig.workers[0]?.crash('exit');
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.add({ a: 1, b: 1 })).toEqual({ ok: true, value: 2 });
    expect(events).toContainEqual({ type: 'restart_hook_failed', message: 'replica reload failed' });
  });

  it('a call issued during the restart gate is cancelled if the client is terminated meanwhile', async () => {
    let release: () => void = () => undefined;
    const { client, rig } = make({ onRestart: () => new Promise<void>((resolve) => (release = resolve)) });
    rig.workers[0]?.crash('exit');
    await vi.advanceTimersByTimeAsync(0);
    const waiting = client.add({ a: 1, b: 1 });
    client.terminate();
    release();
    expect(await waiting).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
  });
});
