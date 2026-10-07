/** The depiction manager (step 5.4a): statuses, the LRU bound, revokes, timeouts, late answers. All injected, no clock, no DOM. */
import { describe, expect, it, vi } from 'vitest';
import { createDepictionManager, DEPICTION_BUSY, DEPICTION_LRU_CAPACITY, type DepictionAnswer, type DepictionDeps } from './depictions';

interface Harness {
  readonly deps: DepictionDeps;
  readonly answers: Map<string, (answer: DepictionAnswer) => void>;
  readonly rejects: Map<string, () => void>;
  readonly created: string[];
  readonly revoked: string[];
  readonly timers: Map<number, { callback: () => void; ms: number }>;
  readonly fetched: string[];
}

function harness(over: Partial<DepictionDeps> = {}): Harness {
  const answers = new Map<string, (answer: DepictionAnswer) => void>();
  const rejects = new Map<string, () => void>();
  const created: string[] = [];
  const revoked: string[] = [];
  const fetched: string[] = [];
  const timers = new Map<number, { callback: () => void; ms: number }>();
  let nextTimer = 1;
  const deps: DepictionDeps = {
    fetchSvg: (key) => {
      fetched.push(key);
      return new Promise<DepictionAnswer>((resolve, reject) => {
        answers.set(key, resolve);
        rejects.set(key, () => reject(new Error('boom')));
      });
    },
    createUrl: (svg) => {
      const url = `blob:test/${created.length}`;
      created.push(`${url}=${svg}`);
      return url;
    },
    revokeUrl: (url) => {
      revoked.push(url);
    },
    setTimer: (callback, ms) => {
      const handle = nextTimer;
      nextTimer += 1;
      timers.set(handle, { callback, ms });
      return handle;
    },
    clearTimer: (handle) => {
      timers.delete(handle as number);
    },
    ...over,
  };
  return { deps, answers, rejects, created, revoked, timers, fetched };
}

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('statuses', () => {
  it('an unknown key is idle; a request makes it loading; the answer makes it ready with a URL made from the text', async () => {
    const h = harness();
    const manager = createDepictionManager(h.deps);
    expect(manager.snapshot('a')).toEqual({ state: 'idle' });
    manager.request('a');
    expect(manager.snapshot('a')).toEqual({ state: 'loading' });
    h.answers.get('a')?.({ ok: true, svg: '<svg/>' });
    await flush();
    expect(manager.snapshot('a')).toEqual({ state: 'ready', url: 'blob:test/0' });
    expect(h.created).toEqual(['blob:test/0=<svg/>']);
    expect(h.timers.size).toBe(0);
  });

  it('asks once per key however often it is requested; the status object stays the same until it changes', async () => {
    const h = harness();
    const manager = createDepictionManager(h.deps);
    manager.request('a');
    const first = manager.snapshot('a');
    manager.request('a');
    manager.request('a');
    expect(h.fetched).toEqual(['a']);
    expect(manager.snapshot('a')).toBe(first);
  });

  it('a failure value, a rejection and a createUrl that throws are unavailable, with a reason', async () => {
    const h = harness({
      createUrl: () => {
        throw new Error('no blobs');
      },
    });
    const manager = createDepictionManager(h.deps);
    manager.request('failure');
    manager.request('rejected');
    manager.request('nourl');
    h.answers.get('failure')?.({ ok: false, reason: 'no_structure' });
    h.rejects.get('rejected')?.();
    h.answers.get('nourl')?.({ ok: true, svg: '<svg/>' });
    await flush();
    expect(manager.snapshot('failure')).toEqual({ state: 'unavailable', reason: 'no_structure' });
    expect(manager.snapshot('rejected')).toEqual({ state: 'unavailable', reason: 'fetch_failed' });
    expect(manager.snapshot('nourl')).toEqual({ state: 'unavailable', reason: 'url_failed' });
  });

  it('a fetch that throws at once is unavailable', () => {
    const h = harness({
      fetchSvg: () => {
        throw new Error('worker gone');
      },
    });
    const manager = createDepictionManager(h.deps);
    manager.request('a');
    expect(manager.snapshot('a')).toEqual({ state: 'unavailable', reason: 'fetch_failed' });
  });

  it('a key that does not answer in time is unavailable (timeout); a late answer is ignored and makes no URL', async () => {
    const h = harness({ timeoutMs: 1500 });
    const manager = createDepictionManager(h.deps);
    manager.request('slow');
    expect([...h.timers.values()].map((t) => t.ms)).toEqual([1500]);
    [...h.timers.values()][0]?.callback();
    expect(manager.snapshot('slow')).toEqual({ state: 'unavailable', reason: 'timeout' });
    h.answers.get('slow')?.({ ok: true, svg: '<svg/>' });
    await flush();
    expect(manager.snapshot('slow')).toEqual({ state: 'unavailable', reason: 'timeout' });
    expect(h.created).toEqual([]);
  });

  it('an unavailable key is not asked again while it stays in the cache', async () => {
    const h = harness();
    const manager = createDepictionManager(h.deps);
    manager.request('a');
    h.answers.get('a')?.({ ok: false, reason: 'x' });
    await flush();
    manager.request('a');
    expect(h.fetched).toEqual(['a']);
  });

  it('tells the listeners of a key, and only that key, about each change', async () => {
    const h = harness();
    const manager = createDepictionManager(h.deps);
    const a = vi.fn();
    const b = vi.fn();
    const stopA = manager.subscribe('a', a);
    manager.subscribe('b', b);
    manager.request('a');
    expect(a).toHaveBeenCalledTimes(1);
    h.answers.get('a')?.({ ok: true, svg: 's' });
    await flush();
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).not.toHaveBeenCalled();
    stopA();
    manager.request('c');
    expect(a).toHaveBeenCalledTimes(2);
  });
});

describe('the LRU bound', () => {
  it('states its bound: 500 keys by default', () => {
    expect(DEPICTION_LRU_CAPACITY).toBe(500);
    expect(createDepictionManager(harness().deps).capacity).toBe(500);
  });

  it('never holds more than its capacity; drops the least recently requested, revokes its URL and says so to its listener', async () => {
    const h = harness({ capacity: 3 });
    const manager = createDepictionManager(h.deps);
    const dropped = vi.fn();
    manager.subscribe('a', dropped);
    for (const key of ['a', 'b', 'c']) {
      manager.request(key);
      h.answers.get(key)?.({ ok: true, svg: key });
    }
    await flush();
    expect(manager.size()).toBe(3);
    dropped.mockClear();
    manager.request('d');
    expect(manager.size()).toBe(3);
    expect(manager.snapshot('a')).toEqual({ state: 'idle' });
    expect(h.revoked).toEqual(['blob:test/0']);
    expect(dropped).toHaveBeenCalledTimes(1);
  });

  it('a request marks the key most recently used, so another key is dropped', async () => {
    const h = harness({ capacity: 2 });
    const manager = createDepictionManager(h.deps);
    for (const key of ['a', 'b']) {
      manager.request(key);
      h.answers.get(key)?.({ ok: true, svg: key });
    }
    await flush();
    manager.request('a');
    manager.request('c');
    expect(manager.snapshot('a').state).toBe('ready');
    expect(manager.snapshot('b').state).toBe('idle');
    expect(h.revoked).toEqual(['blob:test/1']);
  });

  it('a dropped loading key loses its timer, and its late answer makes no URL', async () => {
    const h = harness({ capacity: 1 });
    const manager = createDepictionManager(h.deps);
    manager.request('a');
    manager.request('b');
    expect(h.timers.size).toBe(1);
    h.answers.get('a')?.({ ok: true, svg: 'late' });
    await flush();
    expect(h.created).toEqual([]);
    expect(manager.size()).toBe(1);
  });

  it('holds a bounded number of URLs over a long run: every URL made is either held or revoked', async () => {
    const h = harness({ capacity: 5 });
    const manager = createDepictionManager(h.deps);
    for (let i = 0; i < 60; i += 1) {
      manager.request(`k${i % 17}`);
      h.answers.get(`k${i % 17}`)?.({ ok: true, svg: String(i) });
      await flush();
      expect(manager.size()).toBeLessThanOrEqual(5);
    }
    const held = [...new Set(Array.from({ length: 17 }, (_, i) => manager.snapshot(`k${i}`)))].filter((s) => s.state === 'ready').length;
    expect(h.created.length - h.revoked.length).toBe(held);
    expect(new Set(h.revoked).size).toBe(h.revoked.length);
  });

  it('a capacity below one is one', () => {
    expect(createDepictionManager({ ...harness().deps, capacity: 0 }).capacity).toBe(1);
  });
});

describe('dispose', () => {
  it('revokes every URL, clears the timers, drops the listeners and ignores later requests', async () => {
    const h = harness();
    const manager = createDepictionManager(h.deps);
    const listener = vi.fn();
    manager.subscribe('a', listener);
    manager.request('a');
    manager.request('b');
    h.answers.get('a')?.({ ok: true, svg: 'a' });
    await flush();
    manager.dispose();
    expect(h.revoked).toEqual(['blob:test/0']);
    expect(h.timers.size).toBe(0);
    expect(manager.size()).toBe(0);
    listener.mockClear();
    manager.request('c');
    h.answers.get('b')?.({ ok: true, svg: 'b' });
    await flush();
    expect(h.fetched).toEqual(['a', 'b']);
    expect(listener).not.toHaveBeenCalled();
    manager.dispose();
  });
});

describe('cancel and busy (step 5.4b)', () => {
  it('cancel drops a loading key to idle, clears its timer, tells its listener and ignores its late answer', async () => {
    const h = harness();
    const manager = createDepictionManager(h.deps);
    const listener = vi.fn();
    manager.subscribe('a', listener);
    manager.request('a');
    listener.mockClear();
    manager.cancel('a');
    expect(manager.snapshot('a')).toEqual({ state: 'idle' });
    expect(manager.size()).toBe(0);
    expect(h.timers.size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
    h.answers.get('a')?.({ ok: true, svg: 'late' });
    await flush();
    expect(h.created).toEqual([]);
    expect(manager.snapshot('a')).toEqual({ state: 'idle' });
  });

  it('cancel leaves a ready or unavailable key, and an unknown key, alone', async () => {
    const h = harness();
    const manager = createDepictionManager(h.deps);
    manager.request('ok');
    manager.request('bad');
    h.answers.get('ok')?.({ ok: true, svg: 'x' });
    h.answers.get('bad')?.({ ok: false, reason: 'no_structure' });
    await flush();
    manager.cancel('ok');
    manager.cancel('bad');
    manager.cancel('never');
    expect(manager.snapshot('ok').state).toBe('ready');
    expect(manager.snapshot('bad')).toEqual({ state: 'unavailable', reason: 'no_structure' });
  });

  it('a BUSY answer is not cached: the key is idle again and can be asked for once more', async () => {
    const h = harness();
    const manager = createDepictionManager(h.deps);
    manager.request('a');
    h.answers.get('a')?.({ ok: false, reason: DEPICTION_BUSY });
    await flush();
    expect(manager.snapshot('a')).toEqual({ state: 'idle' });
    expect(manager.size()).toBe(0);
    expect(h.timers.size).toBe(0);
    manager.request('a');
    expect(h.fetched).toEqual(['a', 'a']);
    expect(manager.snapshot('a')).toEqual({ state: 'loading' });
  });
});
