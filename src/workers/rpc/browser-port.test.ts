import { describe, expect, it } from 'vitest';
import { browserWorkerPort, workerScopePort, type WorkerScopeLike } from './browser-port';
import type { RpcMessage } from './contracts';

/** A stand-in for the two ends of a browser Worker: an event target plus a postMessage log. */
function fakeTarget() {
  const listeners = new Map<string, Set<EventListener>>();
  const posted: { message: unknown; transfer: unknown }[] = [];
  return {
    listeners,
    posted,
    fire(type: string, event: object): void {
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event as Event);
    },
    addEventListener(type: string, listener: EventListener): void {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener(type: string, listener: EventListener): void {
      listeners.get(type)?.delete(listener);
    },
    postMessage(message: unknown, transfer: unknown): void {
      posted.push({ message, transfer });
    },
    terminate(): void {
      posted.push({ message: 'terminated', transfer: undefined });
    },
  };
}

describe('browser worker ports', () => {
  it('the client port posts with its transfer list, listens for message, error and messageerror, and unsubscribes', () => {
    const fake = fakeTarget();
    const port = browserWorkerPort(fake as unknown as Worker);
    const seen: unknown[] = [];
    const offMessage = port.onMessage((m) => seen.push(m));
    port.onError((e) => seen.push(`error:${String(e)}`));
    port.onMessageError((e) => seen.push(`messageerror:${String(e)}`));
    const buffer = new ArrayBuffer(4);
    const request: RpcMessage = { type: 'request', id: 1, method: 'm', params: {} };
    port.postMessage(request, [buffer]);
    port.postMessage(request);
    fake.fire('message', { data: { type: 'response' } });
    fake.fire('error', { message: 'script failed' });
    fake.fire('messageerror', {});
    offMessage();
    fake.fire('message', { data: 'after unsubscribe' });
    port.onExit(() => undefined)();
    port.terminate();
    expect(fake.posted).toEqual([
      { message: request, transfer: [buffer] },
      { message: request, transfer: [] },
      { message: 'terminated', transfer: undefined },
    ]);
    expect(seen).toEqual([{ type: 'response' }, 'error:script failed', 'messageerror:a message could not be deserialised']);
  });

  it('the host port posts through the scope and stops listening when unsubscribed', () => {
    const fake = fakeTarget();
    const port = workerScopePort(fake as unknown as WorkerScopeLike);
    const seen: unknown[] = [];
    const off = port.onMessage((m) => seen.push(m));
    port.postMessage({ type: 'cancel', id: 2 });
    fake.fire('message', { data: { type: 'cancel', id: 3 } });
    off();
    fake.fire('message', { data: 'ignored' });
    expect(fake.posted).toEqual([{ message: { type: 'cancel', id: 2 }, transfer: [] }]);
    expect(seen).toEqual([{ type: 'cancel', id: 3 }]);
  });
});
