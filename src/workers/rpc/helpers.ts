/** Small pure helpers shared by the RPC client and host. */
import type { TaskOptions } from '@/io/contracts';
import type { RpcCallContext, RpcError, RpcErrorCode } from './contracts';

/** A handler throws this to answer with a specific code (for example `NOT_READY`) instead of `INTERNAL`. */
export class RpcHostError extends Error {
  readonly code: RpcErrorCode;
  constructor(code: RpcErrorCode, message: string) {
    super(message);
    this.name = 'RpcHostError';
    this.code = code;
  }
}

const MESSAGE_LIMIT = 500;

/** The message only: never a stack, never a class name (a host exception must not leak internals). */
export function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > MESSAGE_LIMIT ? `${text.slice(0, MESSAGE_LIMIT)}…` : text;
}

export const rpcError = (code: RpcErrorCode, message: string): { readonly ok: false; readonly error: RpcError } => ({
  ok: false,
  error: { code, message },
});

const pendingTransfers = new WeakMap<object, readonly Transferable[]>();

/**
 * Marks a host result whose buffers are moved to the caller instead of copied. Returns `result` itself, so the
 * handler's return type is unchanged.
 */
export function withTransfer<T extends object>(result: T, transfer: readonly Transferable[]): T {
  pendingTransfers.set(result, transfer);
  return result;
}

/** Host side: the transfer list registered for `result`, if any (consumed). */
export function takeTransfer(result: unknown): readonly Transferable[] | undefined {
  if (typeof result !== 'object' || result === null) return undefined;
  const transfer = pendingTransfers.get(result);
  pendingTransfers.delete(result);
  return transfer;
}

/**
 * Turns a call context into the `TaskOptions` a pure function (io, persistence) takes. `RpcCallContext` alone is
 * assignable to `TaskOptions` but names progress differently (`progress` versus `onProgress`), so passing it
 * straight through compiles and silently drops every progress report; always convert.
 */
export function taskOptionsFrom(ctx: RpcCallContext): TaskOptions {
  return {
    signal: ctx.signal,
    onProgress: (done, total, note) => ctx.progress(done, total, note),
  };
}
