/**
 * A tiny worker API for the RPC library's tests and bench (step 4.1). It runs unchanged in memory and inside a
 * real `worker_threads` worker (`tests/fixtures/rpc/worker.ts`).
 */
import type { TaskOptions } from '@/io/contracts';
import type { RpcCallContext, RpcMethodSpecs } from '@/workers/rpc/contracts';
import { RpcHostError, taskOptionsFrom, withTransfer } from '@/workers/rpc/helpers';

export interface TestApi {
  echo(params: { readonly value: unknown }, ctx: RpcCallContext): Promise<unknown>;
  add(params: { readonly a: number; readonly b: number }, ctx: RpcCallContext): Promise<number>;
  /** Reports progress `n` times through the pure `countWithTask`. */
  count(params: { readonly n: number }, ctx: RpcCallContext): Promise<number>;
  /** Never answers. */
  hang(params: Record<string, never>, ctx: RpcCallContext): Promise<void>;
  /** Answers once the abort signal fires, then does not answer at all (a cooperative handler). */
  untilAborted(params: Record<string, never>, ctx: RpcCallContext): Promise<void>;
  /** Spins synchronously for `ms`: cannot see a cancel. */
  busy(params: { readonly ms: number }, ctx: RpcCallContext): Promise<void>;
  /** Ends the worker (`process.exit`). */
  crash(params: Record<string, never>, ctx: RpcCallContext): Promise<void>;
  boom(params: { readonly message: string }, ctx: RpcCallContext): Promise<never>;
  notReady(params: Record<string, never>, ctx: RpcCallContext): Promise<never>;
  /** Returns the buffer it was given (moved), with its length. */
  transfer(params: { readonly buffer: ArrayBuffer }, ctx: RpcCallContext): Promise<{ readonly buffer: ArrayBuffer; readonly length: number }>;
  /** Not structured-cloneable result. */
  badResult(params: Record<string, never>, ctx: RpcCallContext): Promise<unknown>;
}

/** A pure function of the kind io and persistence export: it takes `TaskOptions`, not a call context. */
export function countWithTask(n: number, task: TaskOptions): number {
  for (let i = 1; i <= n; i += 1) {
    if (task.signal?.aborted === true) return i - 1;
    task.onProgress?.(i, n, `step ${i}`);
  }
  return n;
}

export const testHandlers: TestApi = {
  echo: async ({ value }) => value,
  add: async ({ a, b }) => a + b,
  count: async ({ n }, ctx) => countWithTask(n, taskOptionsFrom(ctx)),
  hang: () => new Promise<void>(() => undefined),
  untilAborted: (_params, ctx) =>
    new Promise<void>((resolve) => {
      ctx.signal.addEventListener('abort', () => resolve(), { once: true });
    }),
  busy: async ({ ms }) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // spin: a synchronous task, deliberately
    }
  },
  crash: async () => {
    process.exit(3);
  },
  boom: async ({ message }) => {
    throw new Error(message);
  },
  notReady: async () => {
    throw new RpcHostError('NOT_READY', 'no replica loaded');
  },
  transfer: async ({ buffer }) => withTransfer({ buffer, length: buffer.byteLength }, [buffer]),
  badResult: async () => ({ fn: () => undefined }),
};

export const TEST_SPECS: RpcMethodSpecs<TestApi> = {
  echo: { idempotent: true, timeoutMs: 5_000 },
  add: { idempotent: true, timeoutMs: 5_000 },
  count: { idempotent: true, timeoutMs: 5_000 },
  hang: { idempotent: true, timeoutMs: 1_000 },
  untilAborted: { idempotent: true, timeoutMs: 5_000 },
  busy: { idempotent: true, timeoutMs: 5_000 },
  crash: { idempotent: false, timeoutMs: 5_000 },
  boom: { idempotent: false, timeoutMs: 5_000 },
  notReady: { idempotent: false, timeoutMs: 5_000 },
  transfer: { idempotent: true, timeoutMs: 5_000 },
  badResult: { idempotent: false, timeoutMs: 5_000 },
};
