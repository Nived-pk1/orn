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
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppServices, AppStatus } from '@/app/services';
import { createBooter, demoState, editNote, renameDataset, smallState, tamper } from '@/test-support/app-boot-kit';
import { testEnv, worldHolding } from '@/test-support/app-env-kit';
import { seedChangeSet } from '@/test-support/persistence-kit';

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

  it('a refused promotion: mode read_only, promotion refused, the reason and detail', async () => {
    const world = await worldHolding(demoState(), 2);
    const a = await booter.bootEnv(testEnv({ world }));
    const b = await booter.bootEnv(testEnv({ world }));
    await tamper(world, (db) => db.meta.put({ key: 'schemaVersion', value: 99 }));
    const seen = watch(b);
    await a.dispose();
    await vi.waitFor(() => expect(b.status.get().promotion).toBe('refused'));
    expect(b.status.get()).toMatchObject({ mode: 'read_only', reason: 'newer_schema' });
    // the adapter's save state flickers while the promotion boots as the writer and is refused: read_only at the end
    expect([...flat(seen.steps)].sort()).toEqual(['detail', 'mode', 'promotion', 'reason', 'save']);
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
