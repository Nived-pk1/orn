/**
 * Step 6.1b part 4 (openItem 119, PERSISTENCE §9): automatic snapshots built by the COMPUTE WORKER, in the writer tab only, over the real
 * app services with an injected clock. 200 revisions -> one snapshot; 30 minutes of activity -> one; an idle gap and then one edit -> none; a
 * sixth prunes the oldest (five kept); STALE_REVISION stores nothing and the NEXT ChangeSet stores one; a follower, a session with nothing
 * saved take none; a failure is an event and words in the status; a periodic snapshot restores like any other.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppServices } from '@/app/services';
import { periodicTextOf } from '@/app/window/banners';
import { PERIODIC_ACTIVITY_MS, PERIODIC_REVISIONS } from '@/persistence';
import { createBooter, demoState, editNote, renameDataset } from '@/test-support/app-boot-kit';
import { testEnv, worldHolding, type TestEnv } from '@/test-support/app-env-kit';
import type { ComputeWorkerApi } from '@/workers/rpc/contracts';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const periodic = async (services: AppServices) => ((await services.persistence?.listSnapshots()) ?? []).filter((s) => s.reason === 'periodic');
const builds = (t: TestEnv): number => t.calls.filter((call) => call.endsWith(':snapshotBuild')).length;
let counter = 0;
const edit = (services: AppServices): void => editNote(services, `note ${(counter += 1)}`);
async function edits(services: AppServices, n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) edit(services);
  await services.snapshotsIdle();
}
/** One window of activity: an edit, 30 minutes, an edit (the second one makes a snapshot due). */
async function activityWindow(services: AppServices, t: TestEnv): Promise<void> {
  edit(services);
  t.advanceMs(PERIODIC_ACTIVITY_MS + 1);
  edit(services);
  await services.snapshotsIdle();
}

async function writer(options: Parameters<typeof testEnv>[0] = {}) {
  const world = await worldHolding(demoState(), 2);
  const t = testEnv({ world, ...options });
  const services = await booter.bootEnv(t);
  expect(services.status.get().mode).toBe('writer');
  return { world, t, services };
}

describe('when a periodic snapshot is taken', () => {
  it('200 revisions: ONE snapshot, built by the compute worker, of the revision the 200th change reached', async () => {
    const { t, services } = await writer();
    await edits(services, PERIODIC_REVISIONS - 1);
    expect(await periodic(services)).toHaveLength(0);
    expect(builds(t)).toBe(0);
    await edits(services, 1);
    const snapshots = await periodic(services);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ reason: 'periodic', revision: services.store.getRevision() });
    expect(builds(t)).toBe(1);
    expect(services.status.get().periodicSnapshots).toMatchObject({ kept: 1, failure: null });
    expect(services.status.get().periodicSnapshots?.lastAt).toBe(snapshots[0]?.createdAt);
  });

  it('30 minutes of activity: ONE snapshot at the edit that reaches 30 minutes', async () => {
    const { t, services } = await writer();
    edit(services);
    await services.snapshotsIdle();
    expect(await periodic(services)).toHaveLength(0);
    t.advanceMs(PERIODIC_ACTIVITY_MS - 1_000);
    edit(services);
    await services.snapshotsIdle();
    expect(await periodic(services)).toHaveLength(0);
    t.advanceMs(2_000);
    edit(services);
    await services.snapshotsIdle();
    expect(await periodic(services)).toHaveLength(1);
  });

  it('an idle gap and then one edit: none (activity starts with the first change after the last snapshot)', async () => {
    const { t, services } = await writer();
    t.advanceMs(3 * PERIODIC_ACTIVITY_MS);
    edit(services);
    await services.snapshotsIdle();
    expect(await periodic(services)).toHaveLength(0);
    expect(services.status.get().periodicSnapshots).toEqual({ lastAt: null, kept: 0, failure: null });
  });

  it('a sixth snapshot prunes the oldest: five are kept, the status says so', async () => {
    const { t, services } = await writer();
    const seen: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      await activityWindow(services, t);
      const now = await periodic(services);
      for (const s of now) if (!seen.includes(s.id)) seen.push(s.id);
      expect(now).toHaveLength(Math.min(i + 1, 5));
    }
    const kept = (await periodic(services)).map((s) => s.id);
    expect(seen).toHaveLength(6);
    expect(kept).not.toContain(seen[0]);
    expect([...kept].sort()).toEqual(seen.slice(1).sort());
    expect(services.status.get().periodicSnapshots?.kept).toBe(5);
  });

  it('a follower and a session with nothing saved take none (no build is even asked)', async () => {
    const world = await worldHolding(demoState(), 2);
    const a = await booter.bootEnv(testEnv({ world }));
    const tb = testEnv({ world });
    const b = await booter.bootEnv(tb);
    expect(b.status.get().mode).toBe('follower');
    await edits(a, PERIODIC_REVISIONS);
    expect(await periodic(a)).toHaveLength(1);
    expect(b.status.get().periodicSnapshots).toBeNull();
    expect(builds(tb)).toBe(0);

    const ts = testEnv({ noIndexedDb: true });
    const s = await booter.bootEnv(ts);
    expect(s.status.get().mode).toBe('session_only');
    for (let i = 0; i < PERIODIC_REVISIONS + 5; i += 1) renameDataset(s, `title ${i}`);
    await s.snapshotsIdle();
    expect(s.status.get().periodicSnapshots).toBeNull();
    expect(builds(ts)).toBe(0);
  });

  it('a promoted follower starts taking them', async () => {
    const world = await worldHolding(demoState(), 2);
    const a = await booter.bootEnv(testEnv({ world }));
    const b = await booter.bootEnv(testEnv({ world }));
    expect(b.status.get().periodicSnapshots).toBeNull();
    await a.dispose();
    await new Promise<void>((resolve) => {
      const off = b.status.subscribe((s) => {
        if (s.mode === 'writer') {
          off();
          resolve();
        }
      });
    });
    expect(b.status.get().periodicSnapshots).toMatchObject({ kept: 0, failure: null });
    await edits(b, PERIODIC_REVISIONS);
    expect(await periodic(b)).toHaveLength(1);
  });
});

describe('when the data moves on, or the build fails', () => {
  it('STALE_REVISION: nothing is stored, no failure is shown, and the NEXT ChangeSet stores one', async () => {
    let moveOn: (() => void) | undefined;
    const wrap = (_index: number, api: ComputeWorkerApi): ComputeWorkerApi => ({
      ...api,
      snapshotBuild: async (params, ctx) => {
        const answer = await api.snapshotBuild(params, ctx);
        const hook = moveOn;
        moveOn = undefined;
        hook?.(); // the data moves on while the bytes are made
        return answer;
      },
    });
    const { t, services } = await writer({ wrap });
    moveOn = () => edit(services);
    await edits(services, PERIODIC_REVISIONS);
    expect(builds(t)).toBe(1);
    expect(await periodic(services)).toHaveLength(0);
    expect(services.status.get().periodicSnapshots).toEqual({ lastAt: null, kept: 0, failure: null });
    expect(services.log.get().some((entry) => entry.event.type === 'periodic_snapshot_stale')).toBe(true);
    // no timer and no loop: nothing more happens until the next ChangeSet
    expect(builds(t)).toBe(1);
    await edits(services, 1);
    const snapshots = await periodic(services);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.revision).toBe(services.store.getRevision());
    expect(builds(t)).toBe(2);
  });

  it('a build that fails: an event in the log and words in the status (no banner); still due, the next ChangeSet tries again and clears it', async () => {
    let fail = true;
    const wrap = (_index: number, api: ComputeWorkerApi): ComputeWorkerApi => ({
      ...api,
      snapshotBuild: async (params, ctx) => (fail ? { ok: false, code: 'SERIALIZE_FAILED', message: 'a record does not serialise' } : api.snapshotBuild(params, ctx)),
    });
    const { services } = await writer({ wrap });
    await edits(services, PERIODIC_REVISIONS);
    expect(await periodic(services)).toHaveLength(0);
    const view = services.status.get().periodicSnapshots;
    expect(view?.failure).toBe('the snapshot could not be built (a record does not serialise)');
    expect(periodicTextOf(services.status.get())).toBe('Automatic snapshots: last attempt failed: the snapshot could not be built (a record does not serialise)');
    expect(services.log.get().some((entry) => entry.event.type === 'periodic_snapshot_failed')).toBe(true);
    fail = false;
    await edits(services, 1);
    expect(await periodic(services)).toHaveLength(1);
    expect(services.status.get().periodicSnapshots?.failure).toBeNull();
  });
});

describe('a periodic snapshot is a snapshot', () => {
  it('restores like any other: the data is the data of its revision', async () => {
    const { services } = await writer();
    await edits(services, PERIODIC_REVISIONS);
    const [snapshot] = await periodic(services);
    expect(snapshot).toBeDefined();
    const atSnapshot = services.store.getState();
    edit(services);
    expect(services.store.getState()).not.toEqual(atSnapshot);
    const restored = await services.flows.restore(snapshot?.id as string);
    expect(restored.ok, JSON.stringify(restored)).toBe(true);
    expect(services.store.getState().records).toEqual(atSnapshot.records);
  });
});
