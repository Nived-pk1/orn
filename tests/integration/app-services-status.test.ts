/**
 * Step 5.1a, the AppStatus transition table (plan row 5.1a: "a table test of every AppStatus transition"). Each row runs one
 * scenario against real services and lists, in order, the fields that changed in each notification the subscriber got. A
 * transition that changes nothing is a row too: the status keeps its identity. The fields and where they come from:
 *
 *   stage         booting -> ready -> disposed                                    (boot end, dispose)
 *   mode, reason, detail   OpenResult (boot), promotion, a refused promotion
 *   singleTab, notices, validation   the boot report (boot, promotion)
 *   save          SaveStatus mirror (the adapter)
 *   replica       replica_status events of the compute sync
 *   promotion, reloadFailure, rejectedRows, followerReloads   follower events
 *   workers, engines, l4, search, layoutNotice   the engine clients, the warm-up gates, the L4 service, the search sync (step 5.1b)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppServices, AppStatus } from '@/app/services';
import { createBooter, demoState, editNote, renameDataset, smallState, tamper } from '@/test-support/app-boot-kit';
import { testEnv, worldHolding } from '@/test-support/app-env-kit';
import { seedChangeSet } from '@/test-support/persistence-kit';
import { engineKit, fakeMoleculesFor } from '@/test-support/app-engines-kit';
import { request } from '@/test-support/layout-kit';

const booter = createBooter();
afterEach(() => booter.disposeAll());

type Field = keyof AppStatus;

/** The fields that differ between two statuses. */
const changedFields = (before: AppStatus, after: AppStatus): Field[] => (Object.keys(after) as Field[]).filter((key) => before[key] !== after[key]);

/** Subscribes and records the changed fields of every notification, and checks each notification really is a new value. */
function watch(services: AppServices): { readonly steps: Field[][]; readonly identity: () => AppStatus } {
  const steps: Field[][] = [];
  let last = services.status.get();
  services.status.subscribe((next) => {
    expect(next).not.toBe(last);
    steps.push(changedFields(last, next));
    last = next;
  });
  return { steps, identity: () => last };
}

const flat = (steps: readonly Field[][]): Set<Field> => new Set(steps.flat());

describe('AppStatus: every transition', () => {
  it('boot (writer, nothing stored): booting -> ready in the one value returned, nothing left to announce', async () => {
    const { services } = await booter.boot();
    const status = services.status.get();
    expect(status).toMatchObject({ stage: 'ready', mode: 'writer', reason: null, detail: null, singleTab: false, promotion: 'not_applicable', reloadFailure: null, rejectedRows: 0, followerReloads: 0 });
    expect(status.save).toMatchObject({ state: 'saved' });
    expect(status.validation).toEqual({ where: 'none', reason: expect.any(String) });
    expect(status.notices).toMatchObject({ crashSuspected: false });
  });

  it('boot without Web Locks: singleTab is set and the tab is still the writer', async () => {
    const { services } = await booter.boot({ noLocks: true, world: await worldHolding(smallState(), 2) });
    expect(services.status.get()).toMatchObject({ mode: 'writer', singleTab: true });
  });

  it('a commit: only `save` changes (saving, then saved); an edit the replica forwards changes `replica` at most', async () => {
    const { services } = await booter.boot({ world: await worldHolding(demoState(), 2) });
    const seen = watch(services);
    editNote(services, 'status table');
    await services.persistence?.flush();
    await services.replicaSync()?.settled();
    expect(flat(seen.steps)).toEqual(new Set<Field>(['save']));
    expect(services.status.get().save).toMatchObject({ state: 'saved', lastSavedRevision: 3 });
  });

  it('a revision gap: `save` goes failed with the reason, saveEverythingNow takes it back to saved', async () => {
    const { services } = await booter.boot({ world: await worldHolding(demoState(), 2) });
    const adapter = services.persistence as NonNullable<typeof services.persistence>;
    const seen = watch(services);
    const state = services.store.getState();
    expect(() => adapter.writeChanges(seedChangeSet(state, 9), state)).toThrow();
    expect(services.status.get().save).toMatchObject({ state: 'failed', failureReason: 'revision_gap' });
    await services.saveEverythingNow();
    expect(services.status.get().save).toMatchObject({ state: 'saved', failureReason: null });
    expect(flat(seen.steps)).toEqual(new Set<Field>(['save']));
  });

  it('an applied remote commit changes nothing in the status (a follower that only follows keeps the identity)', async () => {
    const world = await worldHolding(demoState(), 2);
    const a = await booter.bootEnv(testEnv({ world }));
    const b = await booter.bootEnv(testEnv({ world }));
    await b.replicaSync()?.settled();
    const seen = watch(b);
    const before = b.status.get();
    editNote(a, 'followed');
    await a.persistence?.flush();
    world.channels.deliver();
    await vi.waitFor(() => expect(b.store.getRevision()).toBe(3));
    await b.replicaSync()?.settled();
    expect(b.status.get()).toBe(before);
    expect(seen.steps).toEqual([]);
  });

  it('a follower, a promotion: mode follower -> writer, promotion waiting -> promoted, validation and notices from the promotion boot', async () => {
    const world = await worldHolding(demoState(), 2);
    const a = await booter.bootEnv(testEnv({ world }));
    const b = await booter.bootEnv(testEnv({ world }));
    expect(b.status.get()).toMatchObject({ mode: 'follower', promotion: 'waiting' });
    const seen = watch(b);
    await a.dispose();
    await vi.waitFor(() => expect(b.status.get().mode).toBe('writer'));
    expect(b.status.get()).toMatchObject({ promotion: 'promoted', reason: null, detail: null });
    expect(flat(seen.steps).has('mode')).toBe(true);
    expect(flat(seen.steps).has('promotion')).toBe(true);
    expect(flat(seen.steps).has('stage')).toBe(false);
  });

  it('a promotion: save stays read_only until the outcome is known, then takes the adapter value in the same notification as promoted', async () => {
    const world = await worldHolding(demoState(), 2);
    const a = await booter.bootEnv(testEnv({ world }));
    const b = await booter.bootEnv(testEnv({ world }));
    const seen: { promotion: string; save: string | undefined }[] = [];
    b.status.subscribe((s) => seen.push({ promotion: s.promotion, save: s.save?.state }));
    await a.dispose();
    await vi.waitFor(() => expect(b.status.get().promotion).toBe('promoted'));
    expect(b.status.get().save?.state).toBe('saved');
    expect(seen.filter((s) => s.promotion === 'waiting' && s.save !== 'read_only')).toEqual([]);
    expect(seen.at(-1)).toEqual({ promotion: 'promoted', save: 'saved' });
  });

  it('a refused promotion: mode read_only, promotion refused, the reason and detail', async () => {
    const world = await worldHolding(demoState(), 2);
    const a = await booter.bootEnv(testEnv({ world }));
    const b = await booter.bootEnv(testEnv({ world }));
    await tamper(world, (db) => db.meta.put({ key: 'schemaVersion', value: 99 }));
    const seen = watch(b);
    await a.dispose();
    await vi.waitFor(() => expect(b.status.get().promotion).toBe('refused'));
    expect(b.status.get()).toMatchObject({ mode: 'read_only', reason: 'newer_schema' });
    // the adapter's save state passes through writable while the promotion boots as the writer; the status never shows it
    expect([...flat(seen.steps)].sort()).toEqual(['detail', 'mode', 'promotion', 'reason']);
    expect(b.status.get().save?.state).toBe('read_only');
  });

  it('the replica: in_sync -> down (a worker that gave up) -> reloading -> in_sync (retryReplica)', async () => {
    let crashAll = false;
    const { services, t } = await booter.boot({
      world: await worldHolding(demoState(), 2),
      wrap: (index, api) =>
        index === 0
          ? {
              ...api,
              applyChanges: (params, ctx) => (crashAll ? Promise.reject(new Error('worker refused')) : api.applyChanges(params, ctx)),
              loadReplica: (params, ctx) => (crashAll ? Promise.reject(new Error('worker refused')) : api.loadReplica(params, ctx)),
            }
          : api,
    });
    expect(services.status.get().replica.state).toBe('in_sync');
    const seen = watch(services);
    crashAll = true;
    editNote(services, 'the worker refuses');
    await vi.waitFor(() => expect(services.status.get().replica.state).toBe('down'));
    expect(await services.retryReplica()).toEqual({ ok: true });
    expect(services.status.get().replica.state).toBe('in_sync');
    expect(t.workers).toHaveLength(2);
    const replicaSteps = seen.steps.filter((step) => step.includes('replica'));
    expect(replicaSteps.length).toBeGreaterThanOrEqual(3);
    expect(flat(seen.steps).has('stage')).toBe(false);
  });

  it('dispose: stage disposed, announced once, then no more notifications', async () => {
    const { services } = await booter.boot({ world: await worldHolding(smallState(), 2) });
    const seen = watch(services);
    await services.dispose();
    expect(services.status.get().stage).toBe('disposed');
    expect(seen.steps.flat()).toContain('stage');
    const count = seen.steps.length;
    renameDataset(services, 'after');
    expect(seen.steps).toHaveLength(count);
  });
});

describe('AppStatus: the engine fields (step 5.1b)', () => {
  const state = demoState();
  async function bootEngines(kit = engineKit({ molecules: fakeMoleculesFor(state) })) {
    const t = testEnv({ world: await worldHolding(state, 2), workers: kit.factories });
    const services = await booter.bootEnv(t);
    return { services, t, kit };
  }

  it('boot: the engine fields are in the value returned; nothing is left to announce, and no thread exists', async () => {
    const { services, kit } = await bootEngines();
    const status = services.status.get();
    expect(status.workers.chem).toEqual({ state: 'ok', started: false, reason: 'created at its first use' });
    expect(status.engines).toEqual({ chem: { state: 'cold', message: null }, layout: { state: 'cold', message: null } });
    expect(status.search).toMatchObject({ state: 'absent', loadedFrom: 'none', cache: { state: 'none' } });
    expect(status.l4.state).toBe('checking'); // checkAll was queued at boot
    expect(status.layoutNotice).toBeNull();
    expect([kit.chem.workers.length, kit.layout.workers.length, kit.search.workers.length]).toEqual([0, 0, 0]);
  });

  it('the search load changes `search` and `workers` only; an idle status keeps its identity', async () => {
    const { services, t } = await bootEngines();
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(200));
    const seen = watch(services);
    const sequence: string[] = [];
    services.status.subscribe((s) => void (sequence.at(-1) !== s.search.state && sequence.push(s.search.state)));
    t.scheduler.fireAfter(200);
    await services.searchSync()?.flush();
    expect([...flat(seen.steps)].sort()).toEqual(['search', 'workers']);
    expect(sequence).toEqual(['pending', 'idle']);
    expect(services.status.get().search).toMatchObject({ state: 'idle', loadedFrom: 'full_load', indexRevision: 2 });
    const settled = services.status.get();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(services.status.get()).toBe(settled);
  });

  it('the first L4 run: `workers` (chem started), `engines` (cold, loading, ready), `l4` (checking, idle)', async () => {
    const { services, t } = await bootEngines();
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(400));
    const seen = watch(services);
    const engine: string[] = [];
    const l4: string[] = [];
    services.status.subscribe((s) => {
      if (engine.at(-1) !== s.engines.chem.state) engine.push(s.engines.chem.state);
      if (l4.at(-1) !== s.l4.state) l4.push(s.l4.state);
    });
    t.scheduler.fireAfter(400);
    await services.l4.flush();
    expect([...flat(seen.steps)].sort()).toEqual(['engines', 'l4', 'workers']);
    expect(engine).toEqual(['cold', 'loading', 'ready']);
    expect(l4.at(-1)).toBe('idle');
  });

  it('a worker restart: `workers` (restarting, then ok) and `engines` (loading, ready: it re-warms)', async () => {
    const { services, t, kit } = await bootEngines();
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(400));
    t.scheduler.fireAfter(400);
    await services.l4.flush();
    const worker: string[] = [];
    const engine: string[] = [];
    services.status.subscribe((s) => {
      if (worker.at(-1) !== s.workers.chem.state) worker.push(s.workers.chem.state);
      if (engine.at(-1) !== s.engines.chem.state) engine.push(s.engines.chem.state);
    });
    kit.chem.workers[0]?.crash('exit');
    await vi.waitFor(() => expect(worker).toEqual(['restarting', 'ok']));
    expect(engine).toEqual(['ready', 'loading', 'ready']);
  });

  it('a toolkit that cannot load: `engines` (loading, unavailable) and `l4` (unavailable); a retry: engines (loading, ready) and l4 (checking)', async () => {
    const kit = engineKit({ molecules: fakeMoleculesFor(state) });
    kit.chem.loadFailure = new Error('blocked');
    const { services, t } = await bootEngines(kit);
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(400));
    t.scheduler.fireAfter(400);
    await services.l4.flush();
    expect(services.status.get()).toMatchObject({ engines: { chem: { state: 'unavailable' } }, l4: { state: 'unavailable' } });
    kit.chem.loadFailure = undefined;
    const engine: string[] = [];
    services.status.subscribe((s) => void (engine.at(-1) !== s.engines.chem.state && engine.push(s.engines.chem.state)));
    await services.retryEngine('chem');
    expect(engine).toEqual(['cold', 'loading', 'ready']);
    expect(services.status.get().l4.state).toBe('checking');
  });

  it('a layout fallback: `engines`, `workers` and `layoutNotice`', async () => {
    const { services, kit } = await bootEngines();
    kit.layout.elk.makeFailure = new Error('elk chunk missing');
    const seen = watch(services);
    await services.layout.layout('v', request({ nodes: ['a', 'b'], edges: [['a', 'b']] }));
    expect([...flat(seen.steps)].sort()).toEqual(['engines', 'layoutNotice', 'workers']);
    expect(services.status.get().layoutNotice).toContain('fallback layout');
  });
});
