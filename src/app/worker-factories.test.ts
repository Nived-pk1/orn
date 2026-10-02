import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkerFactories } from './worker-factories';

/** A `Worker` that only records how it was made; the browser's real one cannot run under Node. */
class StubWorker {
  static made: StubWorker[] = [];
  readonly terminated: boolean[] = [];
  readonly listeners: string[] = [];
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions | undefined,
  ) {
    StubWorker.made.push(this);
  }
  postMessage = vi.fn();
  addEventListener(type: string): void {
    this.listeners.push(type);
  }
  removeEventListener = vi.fn();
  terminate(): void {
    this.terminated.push(true);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  StubWorker.made = [];
});

describe('the worker factories', () => {
  it('creates nothing until a factory is called', () => {
    vi.stubGlobal('Worker', StubWorker);
    createWorkerFactories();
    expect(StubWorker.made).toHaveLength(0);
  });

  it.each(['chem', 'layout', 'search', 'compute'] as const)('%s: starts a module worker from its own entry and returns a port over it', (name) => {
    vi.stubGlobal('Worker', StubWorker);
    const port = createWorkerFactories()[name]();
    expect(StubWorker.made).toHaveLength(1);
    const made = StubWorker.made[0] as StubWorker;
    expect(made.url.pathname.endsWith(`/src/workers/${name}/entry.ts`)).toBe(true);
    expect(made.options).toMatchObject({ type: 'module', name: `orn-${name}` });
    port.onMessage(() => undefined);
    port.onError(() => undefined);
    expect(made.listeners).toEqual(['message', 'error']);
    port.terminate();
    expect(made.terminated).toEqual([true]);
  });

  it('every call is a new worker (a restart gets a fresh one), and the four entries are four different files', () => {
    vi.stubGlobal('Worker', StubWorker);
    const factories = createWorkerFactories();
    factories.chem();
    factories.chem();
    factories.layout();
    factories.search();
    factories.compute();
    expect(StubWorker.made).toHaveLength(5);
    expect(new Set(StubWorker.made.map((w) => w.url.href)).size).toBe(4);
  });
});
