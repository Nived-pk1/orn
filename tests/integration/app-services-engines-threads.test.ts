/**
 * Step 5.1b over REAL `worker_threads` (the real-threads project): the demo boots with real compute, chem (RDKit), layout (ELK) and
 * search threads. No engine thread exists until it is needed; L4 runs over real RDKit and learns derived formulas; a layout is ELK's;
 * a search finds the demo's ethanol; the warm-boot cache written by one session is adopted by the next (no full load). The in-memory
 * twins are app-services-engines / -l4 / -search / -depictions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_CACHE_KEY } from '@/app/services/search-part';
import { createBooter, demoState } from '@/test-support/app-boot-kit';
import { testEnv, worldHolding, type World } from '@/test-support/app-env-kit';
import { request } from '@/test-support/layout-kit';
import { freshDb } from '@/test-support/persistence-kit';
import { spawnChemWorker, spawnComputeWorker, spawnLayoutWorker, spawnSearchWorker } from '@/test-support/rpc-node-port';

const THREAD_TEST_TIMEOUT_MS = 90_000;
const booter = createBooter();
afterEach(() => booter.disposeAll());

function bootReal(world: World) {
  const made = { compute: 0, chem: 0, layout: 0, search: 0 };
  const t = testEnv({ world });
  return booter
    .bootEnv(t, {
      ...t.env,
      workers: {
        compute: () => (made.compute++, spawnComputeWorker()),
        chem: () => (made.chem++, spawnChemWorker()),
        layout: () => (made.layout++, spawnLayoutWorker()),
        search: () => (made.search++, spawnSearchWorker()),
      },
    })
    .then((services) => ({ services, t, made }));
}

describe('the engines over real threads', () => {
  it('threads at first need; L4 over real RDKit with derived formulas; ELK layout; search; then a warm boot from the cache', async () => {
    const world = await worldHolding(demoState(), 2);
    const first = await bootReal(world);
    const { services, t, made } = first;
    expect(made).toEqual({ compute: 1, chem: 0, layout: 0, search: 0 });

    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toEqual(expect.arrayContaining([200, 400])));
    t.scheduler.fireAfter(200);
    await vi.waitFor(() => expect(made.search).toBe(1));
    await services.searchSync()?.flush();
    expect(services.status.get().search).toMatchObject({ state: 'idle', indexRevision: 2, loadedFrom: 'full_load' });
    expect(made.chem).toBe(0);

    t.scheduler.fireAfter(400);
    await vi.waitFor(() => expect(made.chem).toBe(1));
    await services.l4.flush();
    expect(services.status.get()).toMatchObject({ engines: { chem: { state: 'ready' } }, l4: { state: 'idle', notChecked: 0, queued: 0 } });
    const ethanol = Object.values(services.store.getState().records.species).find((s) => s.structure?.value === 'CCO');
    expect(ethanol).toBeDefined();
    expect(services.l4.derivedFormulaOf({ kind: 'species', id: ethanol?.id as string })).toBe('C2H6O');
    expect(made.layout).toBe(0);

    expect(await services.layout.layout('v', request({ nodes: ['a', 'b'], edges: [['a', 'b']] }))).toMatchObject({ ok: true, result: { engine: 'elk' } });
    expect(made.layout).toBe(1);

    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(200)); // L4's formulas queued their documents
    t.scheduler.fireAfter(200);
    await services.searchSync()?.flush();
    const found = await services.search.search('palette', { text: 'C2H6O', limit: 50 });
    expect(found.ok && found.value.some((hit) => hit.ref.id === ethanol?.id)).toBe(true);

    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(5_000));
    t.scheduler.fireAfter(5_000);
    await vi.waitFor(() => expect(services.status.get().search.cache.state).toBe('saved'));
    const tdb = freshDb(undefined, world.indexedDB);
    const row = await tdb.db.derivedCache.get(SEARCH_CACHE_KEY);
    tdb.db.close();
    expect(row).toMatchObject({ cacheKind: 'search_index', value: { revision: 2 } });
    await services.dispose();

    const second = await bootReal(world);
    await vi.waitFor(() => expect(second.services.status.get().search.loadedFrom).toBe('warm_cache'), { timeout: 15_000 });
    expect(second.services.searchSync()?.stats()).toMatchObject({ loads: 0, adopts: 1 });
    expect(second.made).toEqual({ compute: 1, chem: 0, layout: 0, search: 1 });
    const again = await second.services.search.search('palette', { text: 'ethanol', limit: 5 });
    expect(again.ok && again.value.length).toBeGreaterThan(0);
  }, THREAD_TEST_TIMEOUT_MS);
});
