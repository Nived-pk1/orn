import { describe, expect, it } from 'vitest';
import { createMemoryWorker } from '@/test-support/rpc-memory-port';
import { TEST_SPECS, testHandlers, countWithTask, type TestApi } from '@/test-support/rpc-test-api';
import { createRpcClient } from './client';
import type { RpcMessage } from './contracts';
import { createRpcHost } from './host';
import { taskOptionsFrom } from './helpers';

/** Drives a host by hand: `send` posts a request-shaped value, `replies` collects what comes back. */
function drive(handlers: TestApi = testHandlers, maxInFlight?: number) {
  const worker = createMemoryWorker();
  const host = createRpcHost(worker.host, handlers, maxInFlight === undefined ? {} : { maxInFlight });
  const replies: RpcMessage[] = [];
  worker.port.onMessage((m) => replies.push(m as RpcMessage));
  const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
  const send = (message: unknown): void => worker.port.postMessage(message as RpcMessage);
  return { worker, host, replies, send, tick };
}

describe('rpc host', () => {
  it('an unknown method, an inherited name and a request without a method are BAD_REQUEST', async () => {
    const { replies, send, tick } = drive();
    send({ type: 'request', id: 1, method: 'nope', params: {} });
    send({ type: 'request', id: 2, method: 'toString', params: {} });
    send({ type: 'request', id: 3, params: {} });
    await tick();
    expect(replies).toEqual([
      { type: 'response', id: 1, ok: false, error: { code: 'BAD_REQUEST', message: 'unknown method "nope"' } },
      { type: 'response', id: 2, ok: false, error: { code: 'BAD_REQUEST', message: 'unknown method "toString"' } },
      { type: 'response', id: 3, ok: false, error: { code: 'BAD_REQUEST', message: 'a request needs a method name' } },
    ]);
  });

  it('ignores messages that are not requests or cancels, without answering', async () => {
    const { replies, send, tick } = drive();
    send('text');
    send(null);
    send({ type: 'request', id: 'x', method: 'add' });
    send({ type: 'response', id: 1 });
    await tick();
    expect(replies).toEqual([]);
  });

  it('a handler exception answers INTERNAL with the message only', async () => {
    const { replies, send, tick } = drive();
    send({ type: 'request', id: 1, method: 'boom', params: { message: 'disk on fire' } });
    await tick();
    expect(replies).toEqual([{ type: 'response', id: 1, ok: false, error: { code: 'INTERNAL', message: 'disk on fire' } }]);
  });

  it('answers BUSY beyond its own cap and BAD_REQUEST for a repeated id', async () => {
    const { replies, send, tick } = drive(testHandlers, 1);
    send({ type: 'request', id: 1, method: 'hang', params: {} });
    send({ type: 'request', id: 2, method: 'add', params: { a: 1, b: 1 } });
    send({ type: 'request', id: 1, method: 'hang', params: {} });
    await tick();
    expect(replies.map((r) => (r.type === 'response' && !r.ok ? [r.id, r.error.code] : null))).toEqual([[2, 'BUSY'], [1, 'BAD_REQUEST']]);
  });

  it('a cancel aborts the signal and no answer is sent for that call', async () => {
    let aborted = false;
    const handlers: TestApi = {
      ...testHandlers,
      untilAborted: (_p, ctx) =>
        new Promise<void>((resolve) =>
          ctx.signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          }),
        ),
    };
    const { replies, send, tick } = drive(handlers);
    send({ type: 'request', id: 1, method: 'untilAborted', params: {} });
    await tick();
    send({ type: 'cancel', id: 1 });
    send({ type: 'cancel', id: 77 });
    await tick();
    expect(aborted).toBe(true);
    expect(replies).toEqual([]);
  });

  it('close stops listening and aborts running calls', async () => {
    const { host, replies, send, tick } = drive();
    send({ type: 'request', id: 1, method: 'untilAborted', params: {} });
    await tick();
    host.close();
    send({ type: 'request', id: 2, method: 'add', params: { a: 1, b: 1 } });
    await tick();
    expect(replies).toEqual([]);
  });

  it('progress stops once the call is cancelled', async () => {
    const handlers: TestApi = {
      ...testHandlers,
      count: async (_p, ctx) => {
        ctx.progress(1, 2);
        await new Promise((resolve) => setTimeout(resolve, 5));
        ctx.progress(2, 2, 'late');
        return 2;
      },
    };
    const { replies, send, tick } = drive(handlers);
    send({ type: 'request', id: 1, method: 'count', params: { n: 2 } });
    await tick();
    send({ type: 'cancel', id: 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(replies).toEqual([{ type: 'progress', id: 1, done: 1, total: 2 }]);
  });
});

describe('taskOptionsFrom', () => {
  it('turns a call context into TaskOptions whose onProgress calls ctx.progress', () => {
    const seen: unknown[] = [];
    const controller = new AbortController();
    const task = taskOptionsFrom({ signal: controller.signal, progress: (...args) => seen.push(args) });
    expect(task.signal).toBe(controller.signal);
    task.onProgress?.(1, 4, 'note');
    expect(seen).toEqual([[1, 4, 'note']]);
  });

  it('progress sent by a function that takes TaskOptions reaches the caller through the real client and host', async () => {
    const worker = createMemoryWorker();
    createRpcHost(worker.host, testHandlers);
    const client = createRpcClient<TestApi>({ factory: () => worker.port, specs: TEST_SPECS });
    const seen: number[] = [];
    const result = await client.count({ n: 4 }, { onProgress: (done) => seen.push(done) });
    expect(result).toEqual({ ok: true, value: 4 });
    expect(seen).toEqual([1, 2, 3, 4]);
    // The pure function itself is what io and persistence export: it never sees an RpcCallContext.
    expect(countWithTask(2, { onProgress: (d) => seen.push(d * 10) })).toBe(2);
    expect(seen.slice(4)).toEqual([10, 20]);
  });
});
