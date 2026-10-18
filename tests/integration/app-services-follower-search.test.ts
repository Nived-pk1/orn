/**
 * Step 6.1b part 2 (openItem 23): the follower's search index follows the writer's edits through the real app services (two tabs over one
 * database, the real search worker host in memory). A writer rename reaches the follower's index as ONE incremental update (no second full
 * load); a revision mismatch in the worker still falls back to exactly ONE full load.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '@/app/services';
import { createBooter, demoState } from '@/test-support/app-boot-kit';
import { engineKit, fakeMoleculesFor } from '@/test-support/app-engines-kit';
import { testEnv, worldHolding, type TestEnv, type World } from '@/test-support/app-env-kit';
import { envelope, mustCommit, recordIn, withFields } from '@/test-support/command-kit';

const booter = createBooter();
afterEach(() => booter.disposeAll());
const state = demoState();

async function boot(world: World) {
  const kit = engineKit({ molecules: fakeMoleculesFor(state) });
  const t = testEnv({ world, workers: kit.factories });
  return { services: await booter.bootEnv(t), t, kit };
}
async function load(services: AppServices, t: TestEnv): Promise<void> {
  await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(200));
  t.scheduler.fireAfter(200);
  await services.searchSync()?.flush();
}
const sortedFirstSpecies = (services: AppServices): string => Object.keys(services.store.getState().records.species).sort()[0] as string;

/** The writer renames a species; the follower is told (flush, then deliver) and applies it. */
async function writerRenames(world: World, a: AppServices, b: AppServices, canonical: string): Promise<string> {
  const id = sortedFirstSpecies(a);
  const before = b.store.getRevision();
  mustCommit(a.store.dispatch(envelope('Rename', { type: 'record.update', record: withFields(recordIn(a.store.getState(), 'species', id), { names: { canonical, common: [], aliases: [] } }) })));
  await a.persistence?.flush();
  world.channels.deliver();
  await vi.waitFor(() => expect(b.store.getRevision()).toBe(a.store.getRevision()));
  expect(b.store.getRevision()).toBeGreaterThan(before);
  return id;
}
const finds = async (services: AppServices, text: string, id: string): Promise<boolean> => {
  const answer = await services.search.search('test', { text, limit: 20 });
  return answer.ok && answer.value.some((hit) => hit.ref.id === id);
};

describe('the follower\'s search index follows the writer', () => {
  it('a writer rename reaches the follower index as ONE update: no second full load, the new name found and the old one not', async () => {
    const world = await worldHolding(state, 2);
    const a = await boot(world);
    const b = await boot(world);
    expect(b.services.status.get().mode).toBe('follower');
    await load(b.services, b.t);
    expect(b.services.searchSync()?.stats()).toMatchObject({ loads: 1, updates: 0 });
    const id = sortedFirstSpecies(a.services);
    const oldName = a.services.store.getState().records.species[id as never]?.names.canonical as string;
    expect(await finds(b.services, oldName, id)).toBe(true);

    await writerRenames(world, a.services, b.services, 'Quinquagesimal zymurgy');
    await load(b.services, b.t);
    expect(b.services.searchSync()?.stats()).toMatchObject({ loads: 1, updates: 1, upserts: 1, mismatches: 0 });
    expect(b.kit.search.calls.filter((call) => call.endsWith(':load'))).toHaveLength(1);
    expect(b.services.status.get().search).toMatchObject({ state: 'idle', indexRevision: b.services.store.getRevision() });
    expect(await finds(b.services, 'Quinquagesimal zymurgy', id)).toBe(true);
    expect(await finds(b.services, oldName, id)).toBe(false);
  });

  it('a revision mismatch in the follower\'s search worker still falls back to exactly ONE full load', async () => {
    const world = await worldHolding(state, 2);
    const a = await boot(world);
    const b = await boot(world);
    await load(b.services, b.t);
    // the worker's index moves on without the sync knowing (what a restarted or confused worker looks like)
    b.kit.search.engines[0]?.apply({ fromRevision: 2, revision: 9, upsert: [], remove: [] });
    const id = await writerRenames(world, a.services, b.services, 'Ennead zymurgy');
    await load(b.services, b.t);
    await vi.waitFor(() => expect(b.services.searchSync()?.stats().loads).toBe(2));
    expect(b.services.searchSync()?.stats()).toMatchObject({ loads: 2, mismatches: 1 });
    expect(b.services.status.get().search).toMatchObject({ state: 'idle', indexRevision: b.services.store.getRevision() });
    expect(await finds(b.services, 'Ennead zymurgy', id)).toBe(true);
  });
});
