import { describe, expect, it } from 'vitest';
import { createChunkCache, loadChunk } from './lazy-chunk';

describe('loadChunk', () => {
  it('a failed load is a value in words, never an exception', async () => {
    const answer = await loadChunk(() => Promise.reject(new Error('offline')), 'The search');
    expect(answer).toEqual({ ok: false, message: expect.stringContaining('The search could not be loaded (offline)') });
  });
});

describe('createChunkCache', () => {
  it('loads once, remembers a success, and does not remember a failure', async () => {
    let calls = 0;
    let fail = true;
    const cache = createChunkCache(() => {
      calls += 1;
      return fail ? Promise.reject(new Error('down')) : Promise.resolve('chunk');
    }, 'The search');
    expect(cache.peek()).toBeUndefined();
    expect((await cache.get()).ok).toBe(false);
    fail = false;
    expect(await cache.get()).toEqual({ ok: true, value: 'chunk' });
    expect(await cache.get()).toEqual({ ok: true, value: 'chunk' });
    expect(calls).toBe(2);
    expect(cache.peek()).toBe('chunk');
  });

  it('two asks while loading share one load', async () => {
    let calls = 0;
    const cache = createChunkCache(() => (calls += 1, Promise.resolve(1)), 'x');
    await Promise.all([cache.get(), cache.get()]);
    expect(calls).toBe(1);
  });
});
