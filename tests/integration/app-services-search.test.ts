/**
 * Step 5.1b, search inside the app services (headless, in-memory hosts, the real search worker): the first load, the warm-boot cache
 * in `derivedCache` (ONE row holding the revision, written by the writer after a quiet period; at boot a row of the store's
 * revision is loaded with `loadSerialized` and adopted, so no document is built; any other row, `BAD_INDEX`, and a store that moved
 * on are ONE full load), a refused cache write as a status, and a follower that reads the cache but never writes it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '@/app/services';
import { SEARCH_CACHE_KEY } from '@/app/services/search-part';
import { createBooter, demoState, editNote } from '@/test-support/app-boot-kit';
import { engineKit, fakeMoleculesFor, type EngineKit } from '@/test-support/app-engines-kit';
import { testEnv, worldHolding, type TestEnv, type World } from '@/test-support/app-env-kit';
import { freshDb } from '@/test-support/persistence-kit';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const state = demoState();
async function boot(world: World, kit: EngineKit = engineKit({ molecules: fakeMoleculesFor(state) })) {
  const t = testEnv({ world, workers: kit.factories });
  const services = await booter.bootEnv(t);
  return { services, t, kit };
}
/** Fires the search debounce (the load) and waits for it. */
async function load(services: AppServices, t: TestEnv): Promise<void> {
  await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(200));
  t.scheduler.fireAfter(200);
  await services.searchSync()?.flush();
}
/** Fires the cache's quiet period and waits until the row is stored (or refused). */
async function saveCache(services: AppServices, t: TestEnv): Promise<void> {
  await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(5_000));
  t.scheduler.fireAfter(5_000);
  await vi.waitFor(() => expect(services.status.get().search.cache.state).not.toBe('none'));
}
const rowOf = async (world: World) => {
  const tdb = freshDb(undefined, world.indexedDB);
  try {
    return await tdb.db.derivedCache.get(SEARCH_CACHE_KEY);
  } finally {
    tdb.db.close();
  }
};

describe('the first load and the cache row', () => {
  it('no row: one full load; after the quiet period ONE row holds the revision; a commit restarts the quiet period', async () => {
    const world = await worldHolding(state, 2);
    const { services, t, kit } = await boot(world);
    await load(services, t);
    expect(kit.search.calls).toEqual(['0:load']);
    expect(services.status.get().search).toMatchObject({ state: 'idle', indexRevision: 2, loadedFrom: 'full_load', cache: { state: 'none' } });
    expect(await rowOf(world)).toBeUndefined();

    const delaysBefore = t.scheduler.liveDelays().filter((ms) => ms === 5_000).length;
    expect(delaysBefore).toBe(1);
    editNote(services, 'a commit during the quiet period');
    expect(t.scheduler.liveDelays().filter((ms) => ms === 5_000)).toHaveLength(1); // re-armed, not doubled
    await load(services, t); // the index follows revision 3
    await saveCache(services, t);
    expect(services.status.get().search.cache).toEqual({ state: 'saved', revision: 3, message: null });
    const row = await rowOf(world);
    expect(row).toMatchObject({ cacheKind: 'search_index', value: { revision: 3 } });
    expect(row?.byteSize).toBeGreaterThan(10_000);
    const tdb = freshDb(undefined, world.indexedDB);
    expect(await tdb.db.derivedCache.where('cacheKind').equals('search_index').count()).toBe(1);
    tdb.db.close();
  });

  it('only the writer writes it: a follower reads, never writes', async () => {
    const world = await worldHolding(state, 2);
    const a = await boot(world);
    const b = await boot(world);
    expect(b.services.status.get().mode).toBe('follower');
    await load(b.services, b.t);
    expect(b.services.status.get().search).toMatchObject({ state: 'idle', indexRevision: 2 });
    expect(b.t.scheduler.liveDelays()).not.toContain(5_000); // a follower never arms the cache timer
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(b.services.status.get().search.cache.state).toBe('none');
    expect(await rowOf(world)).toBeUndefined();
    void a;
  });
});

describe('a warm boot', () => {
  async function savedWorld() {
    const world = await worldHolding(state, 2);
    const first = await boot(world);
    await load(first.services, first.t);
    await saveCache(first.services, first.t);
    await first.services.dispose();
    return world;
  }

  it('a row of the store\'s revision is loaded and adopted: no document is built, no full load, queries answer', async () => {
    const world = await savedWorld();
    const { services, t, kit } = await boot(world);
    await vi.waitFor(() => expect(services.status.get().search.loadedFrom).toBe('warm_cache'));
    expect(kit.search.calls).toEqual(['0:loadSerialized']); // not `load`
    expect(services.searchSync()?.stats()).toMatchObject({ loads: 0, adopts: 1 });
    expect(services.indexes.stats().builds).toBe(0); // building documents is what needs the full indexes; nothing asked for them
    expect(services.status.get().search).toMatchObject({ state: 'idle', indexRevision: 2, cache: { state: 'saved', revision: 2 } });
    expect(t.scheduler.liveDelays()).not.toContain(200);
    const hits = await services.search.search('palette', { text: 'ethanol', limit: 5 });
    expect(hits.ok && hits.value.length).toBeGreaterThan(0);
    expect(services.log.get().some((e) => e.source === 'app' && e.event.type === 'search_boot' && /warm-boot cache/.test(e.event.message))).toBe(true);
    // and the index keeps following edits after the adoption
    editNote(services, 'edited after a warm boot');
    await load(services, t);
    expect(services.searchSync()?.status()).toMatchObject({ indexRevision: 3, state: 'idle' });
    expect(services.searchSync()?.stats().loads).toBe(0);
  });

  it('a row of another revision is ignored: ONE full load', async () => {
    const world = await savedWorld();
    const tdb = freshDb(undefined, world.indexedDB);
    const row = await tdb.db.derivedCache.get(SEARCH_CACHE_KEY);
    await tdb.db.derivedCache.put({ ...(row as NonNullable<typeof row>), value: { ...(row?.value as object), revision: 1 } });
    tdb.db.close();
    const { services, t, kit } = await boot(world);
    await load(services, t);
    expect(kit.search.calls).toEqual(['0:load']);
    expect(services.searchSync()?.stats()).toMatchObject({ loads: 1, adopts: 0 });
    expect(services.status.get().search.loadedFrom).toBe('full_load');
    expect(services.log.get().some((e) => e.source === 'app' && e.event.type === 'search_boot' && /revision 1, the store is at 2/.test(e.event.message))).toBe(true);
  });

  it('BAD_INDEX is ONE full load; a malformed row too', async () => {
    const world = await savedWorld();
    const tdb = freshDb(undefined, world.indexedDB);
    const row = await tdb.db.derivedCache.get(SEARCH_CACHE_KEY);
    const old = JSON.parse((row?.value as { json: string }).json) as { config: string };
    old.config = 'orn-search-config-1';
    await tdb.db.derivedCache.put({ ...(row as NonNullable<typeof row>), value: { revision: 2, json: JSON.stringify(old) } });
    const bad = await boot(world);
    await load(bad.services, bad.t);
    expect(bad.kit.search.calls).toEqual(['0:loadSerialized', '0:load']);
    expect(bad.services.searchSync()?.stats()).toMatchObject({ loads: 1, adopts: 0 });
    expect(bad.services.log.get().some((e) => e.source === 'app' && e.event.type === 'search_boot' && /BAD_INDEX/.test(e.event.message))).toBe(true);
    await bad.services.dispose();

    await tdb.db.derivedCache.put({ ...(row as NonNullable<typeof row>), value: { revision: 'two' } as never });
    const malformed = await boot(world);
    await load(malformed.services, malformed.t);
    expect(malformed.kit.search.calls).toEqual(['0:load']);
    expect(malformed.services.log.get().some((e) => e.event.type === 'search_boot' && /malformed/.test((e.event as { message: string }).message))).toBe(true);
    tdb.db.close();
  });

  it('a store that moved on while the cache was loading: adopt refuses and ONE full load follows', async () => {
    const world = await savedWorld();
    const kit = engineKit({ molecules: fakeMoleculesFor(state) });
    const slow = new Promise<void>((resolve) => setTimeout(resolve, 30));
    const t = testEnv({
      world,
      workers: {
        ...kit.factories,
        search: () => {
          const port = kit.factories.search();
          const post = port.postMessage.bind(port);
          port.postMessage = (message, transfer) => void slow.then(() => post(message, transfer));
          return port;
        },
      },
    });
    const services = await booter.bootEnv(t);
    editNote(services, 'a commit while the cache is on its way'); // revision 3
    await vi.waitFor(() => expect(services.log.get().some((e) => e.event.type === 'search_boot')).toBe(true));
    await load(services, t);
    expect(services.searchSync()?.stats().adopts).toBe(0);
    expect(services.searchSync()?.stats().loads).toBe(1);
    expect(services.searchSync()?.status().indexRevision).toBe(3);
  });
});

describe('a cache write that is refused is a status, never an error', () => {
  it('quota: the status says refused with the reason; the index and the app are untouched', async () => {
    const world = await worldHolding(state, 2);
    const { services, t } = await boot(world);
    vi.spyOn(services.persistence as NonNullable<typeof services.persistence>, 'putDerived').mockResolvedValue({ ok: false, reason: 'quota', message: 'the browser is full' });
    await load(services, t);
    await saveCache(services, t);
    expect(services.status.get().search.cache).toMatchObject({ state: 'refused', message: expect.stringContaining('the browser is full') });
    expect(services.status.get().search.state).toBe('idle');
    expect(services.status.get().save?.state).toBe('saved'); // the cache is not canonical data
    expect(services.log.get().some((e) => e.event.type === 'search_cache_refused')).toBe(true);
    expect(await rowOf(world)).toBeUndefined();
  });
});

describe('search without storage', () => {
  it('session-only: a full load, no cache, queries answer', async () => {
    const kit = engineKit({ molecules: fakeMoleculesFor(state) });
    const t = testEnv({ noIndexedDb: true, workers: kit.factories });
    const services = await booter.bootEnv(t);
    expect(services.status.get().mode).toBe('session_only');
    await load(services, t);
    expect(services.status.get().search).toMatchObject({ loadedFrom: 'full_load', cache: { state: 'none' } });
    expect(t.scheduler.liveDelays()).not.toContain(5_000);
  });
});
