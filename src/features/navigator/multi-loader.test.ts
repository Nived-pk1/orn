/**
 * The lazy loader of the map's multi-selection engine (step 6.8b, Y1; Studio only): nothing loads until the first use; one load serves every
 * use (the loader is called once); work asked before the load ends runs in the order asked; a failed load is said (never silent) and the next
 * use tries again.
 */
import { describe, expect, it, vi } from 'vitest';
import { createEngineLoader } from './multi-loader';

const engine = { name: 'engine' };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('createEngineLoader', () => {
  it('does not load anything until the first use', () => {
    const load = vi.fn(() => Promise.resolve(engine));
    const loader = createEngineLoader(load, () => undefined);
    expect(load).not.toHaveBeenCalled();
    expect(loader.loaded()).toBeUndefined();
  });

  it('loads once for any number of uses, and runs each use with the engine', async () => {
    const load = vi.fn(() => Promise.resolve(engine));
    const loader = createEngineLoader(load, () => undefined);
    const seen: unknown[] = [];
    loader.use((one) => seen.push(one));
    loader.use((one) => seen.push(one));
    await vi.waitFor(() => expect(seen).toHaveLength(2));
    loader.use((one) => seen.push(one));
    expect(load).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([engine, engine, engine]); // the third runs at once: the engine is there
    expect(loader.loaded()).toBe(engine);
  });

  it('runs work asked before the load ends in the order asked', async () => {
    const gate = deferred<typeof engine>();
    const loader = createEngineLoader(() => gate.promise, () => undefined);
    const order: string[] = [];
    loader.use(() => order.push('first'));
    loader.use(() => order.push('second'));
    expect(order).toEqual([]);
    gate.resolve(engine);
    await vi.waitFor(() => expect(order).toHaveLength(2));
    expect(order).toEqual(['first', 'second']);
  });

  it('says a failed load, drops the work that waited, and tries again at the next use', async () => {
    const failures: string[] = [];
    const load = vi.fn<() => Promise<typeof engine>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(engine);
    const loader = createEngineLoader(load, (message) => failures.push(message));
    const ran = vi.fn();
    loader.use(ran);
    await vi.waitFor(() => expect(failures).toHaveLength(1));
    expect(ran).not.toHaveBeenCalled();
    expect(failures).toEqual(['The selection tools could not be loaded. Try again.']);
    loader.use(ran);
    await vi.waitFor(() => expect(ran).toHaveBeenCalledTimes(1));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('starts from an engine that is already there (a warmed test, a second map) without loading', () => {
    const load = vi.fn(() => Promise.resolve(engine));
    const loader = createEngineLoader(load, () => undefined, engine);
    const ran = vi.fn();
    loader.use(ran);
    expect(ran).toHaveBeenCalledWith(engine);
    expect(load).not.toHaveBeenCalled();
  });

  it('warm starts the load without any work, once, and the engine is there after it', async () => {
    const load = vi.fn(() => Promise.resolve(engine));
    const loader = createEngineLoader(load, () => undefined);
    loader.warm();
    loader.warm();
    await vi.waitFor(() => expect(loader.loaded()).toBe(engine));
    expect(load).toHaveBeenCalledTimes(1);
    loader.warm();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
