/**
 * Step 5.5d, item h: the layout cache in `derivedCache`, through the real app services over the in-memory world and fake engines.
 * A layout is saved by the writer tab and read after a restart (no `layout` call reaches the worker); a write the store refuses for
 * quota is a status and a log line, never an error; a follower reads but does not write.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBooter, demoState } from '@/test-support/app-boot-kit';
import { engineKit, fakeMoleculesFor } from '@/test-support/app-engines-kit';
import { testEnv, worldHolding } from '@/test-support/app-env-kit';
import { request } from '@/test-support/layout-kit';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const state = demoState();
const graph = request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']] });
const kitOf = () => engineKit({ molecules: fakeMoleculesFor(state) });

describe('layouts kept across a restart', () => {
  it('the first run asks the worker and saves the layout; after a restart the worker is not asked', async () => {
    const world = await worldHolding(state, 2);
    const first = kitOf();
    const a = await booter.bootEnv(testEnv({ world, workers: first.factories }));
    expect(await a.layout.layout('v', graph)).toMatchObject({ ok: true, cached: false });
    await vi.waitFor(() => expect(a.status.get().layoutCache).toMatchObject({ state: 'saved', fromStore: 0 }));
    expect(first.layout.calls.filter((call) => call.endsWith(':layout'))).toHaveLength(1);
    await a.dispose();

    const second = kitOf();
    const b = await booter.bootEnv(testEnv({ world, workers: second.factories }));
    const warm = await b.layout.layout('v', { ...graph, requestId: 'after-reload' });
    expect(warm).toMatchObject({ ok: true, cached: true, result: { requestId: 'after-reload' } });
    expect(second.layout.calls.filter((call) => call.endsWith(':layout'))).toEqual([]);
    expect(second.layout.workers).toHaveLength(0); // not even the thread was needed
    expect(b.status.get().layoutCache.fromStore).toBe(1);
  });

  it('a different request is still asked of the worker', async () => {
    const world = await worldHolding(state, 2);
    const a = await booter.bootEnv(testEnv({ world, workers: kitOf().factories }));
    await a.layout.layout('v', graph);
    await vi.waitFor(() => expect(a.status.get().layoutCache.state).toBe('saved'));
    await a.dispose();
    const second = kitOf();
    const b = await booter.bootEnv(testEnv({ world, workers: second.factories }));
    expect(await b.layout.layout('v', { ...graph, seed: 99 })).toMatchObject({ ok: true, cached: false });
    expect(second.layout.calls.filter((call) => call.endsWith(':layout'))).toHaveLength(1);
  });
});

describe('a cache write the store refuses', () => {
  it('is a status and a log line; the layout is returned and nothing throws', async () => {
    const world = await worldHolding(state, 2);
    const kit = kitOf();
    const services = await booter.bootEnv(testEnv({ world, workers: kit.factories }));
    const persistence = services.persistence;
    if (persistence === undefined) throw new Error('the test needs a database');
    vi.spyOn(persistence, 'putDerived').mockResolvedValue({ ok: false, reason: 'quota', message: 'the browser has no room' });
    expect(await services.layout.layout('v', graph)).toMatchObject({ ok: true, cached: false });
    await vi.waitFor(() => expect(services.status.get().layoutCache).toMatchObject({ state: 'refused', message: 'quota' }));
    expect(services.log.get().some((entry) => entry.event.type === 'layout_cache_refused' && entry.event.message.includes('quota'))).toBe(true);
    // and the next layout still works
    expect(await services.layout.layout('v', { ...graph, seed: 3 })).toMatchObject({ ok: true });
  });
});
