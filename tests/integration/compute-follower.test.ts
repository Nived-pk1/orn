/**
 * Step 4.2d, the follower and the promotion through the compute worker (ADR-033, Q4; two in-process tabs over one fake IndexedDB,
 * the follower's validation port is a `BootReplica` over in-memory workers). A follower's full reload validates in the worker
 * (`loadReplica`) and calls `store.reload(state, revision, precomputed)`; the replica sync is told (`noteLoaded`) so the ChangeSet
 * of that reload is not forwarded to a replica that already holds it; a promotion runs boot with the same port; a worker that
 * cannot validate makes the reload validate in this thread, said as an event. INV-28 is unchanged (a follower never writes).
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { coreIndexEngine } from '@/core/indexes/engine';
import type { CanonicalState } from '@/core/schema';
import { validator } from '@/core/validation';
import { mustCommit } from '@/test-support/command-kit';
import { bootRig, type BootRig } from '@/test-support/compute-boot-kit';
import { loadState } from '@/test-support/persistence-kit';
import { expectReplicaEqualsStore, sortedFindings } from '@/test-support/replica-kit';
import { must } from '@/test-support/state-fixture';
import { openTab, type Tab } from '@/test-support/tab-kit';
import { base, edit, fakeRig, notesOf, settle, SPECIES, storeOf } from '@/test-support/tab-rig';
import { createReplicaSync, type ReplicaSync } from '@/workers/compute/sync';

const renamed = (state: CanonicalState, name: string): CanonicalState =>
  produce(state, (draft) => {
    (draft.records.species[SPECIES] as unknown as { names: { canonical: string } }).names.canonical = name;
  });

/** What a full L1-L3 pass over a fresh index build finds for the store's state: the reference the worker's findings must equal. */
const fullFindings = (tab: Tab) => {
  const store = storeOf(tab);
  return sortedFindings(validator.validateAll(store.getState(), coreIndexEngine.build(store.getState(), store.getRevision())));
};

/** A follower tab whose validation port and replica sync both belong to `boot`'s worker. */
async function followerWithWorker(rig: Awaited<ReturnType<typeof fakeRig>>, boot: BootRig): Promise<{ readonly b: Tab; readonly sync: ReplicaSync }> {
  const b = await openTab(rig.env, { validate: boot.boot.validate }, { validate: boot.boot.validate, precomputed: true });
  const adoption = boot.boot.adoption();
  const sync = createReplicaSync({ factory: boot.factory, store: storeOf(b), ...(adoption === undefined ? {} : { adopt: adoption }) });
  return { b, sync };
}
const loads = (boot: BootRig): number => boot.calls.filter((c) => c.endsWith('loadReplica')).length;
const applies = (boot: BootRig): number => boot.calls.filter((c) => c.endsWith('applyChanges')).length;

describe('a follower reloads through the worker', () => {
  it('validates in the worker, adopts with precomputed findings, and the replica is loaded ONCE per reload (not again for the reload’s ChangeSet)', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const boot = bootRig();
    const { b, sync } = await followerWithWorker(rig, boot);
    expect(b.open).toMatchObject({ mode: 'read_only', readOnlyReason: 'other_tab_is_writer' });
    expect(loads(boot)).toBe(1);
    expect(sync.status()).toMatchObject({ state: 'in_sync', reloads: 1 });

    // The writer replaces everything at the next revision: followers reload rather than trust a list of IDs.
    await a.t.adapter.replaceAll(renamed(base, 'Replaced by the writer'), 2);
    await settle(rig, b, () => b.store()?.getRevision() === 2);
    await sync.settled();

    expect(b.events.map((e) => e.type)).toContain('reloaded');
    expect(b.events.some((e) => e.type === 'validation_fallback')).toBe(false);
    expect(loads(boot)).toBe(2);
    expect(applies(boot)).toBe(0);
    expect(sync.status()).toMatchObject({ state: 'in_sync', replicaRevision: 2, reloads: 2 });
    expect(storeOf(b).getState()).toEqual(renamed(base, 'Replaced by the writer'));
    expect(sortedFindings(storeOf(b).findings.all())).toEqual(fullFindings(b));
    expectReplicaEqualsStore(must(boot.replicas[0]), storeOf(b), 'after the follower reload');
    expect(storeOf(b).isReadOnly()).toBe(true);
    expect(b.t.mutations).toEqual([]);

    sync.stop();
    boot.boot.stop();
  });

  it('a worker that is gone: the reload validates in this thread, says so as an event, and the store is the same', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const boot = bootRig({ client: { maxRestarts: 0 } });
    const { b, sync } = await followerWithWorker(rig, boot);
    boot.workers[0]?.crash('exit');
    await sync.settled();
    expect(sync.status().state).toBe('down');

    await a.t.adapter.replaceAll(renamed(base, 'Replaced after the crash'), 2);
    await settle(rig, b, () => b.store()?.getRevision() === 2);
    expect(b.events.filter((e) => e.type === 'validation_fallback')).toEqual([{ type: 'validation_fallback', reason: expect.stringMatching(/could not validate|down for good/) }]);
    expect(b.events.map((e) => e.type)).toContain('reloaded');
    expect(storeOf(b).getState()).toEqual(renamed(base, 'Replaced after the crash'));
    expect(sortedFindings(storeOf(b).findings.all())).toEqual(fullFindings(b));
    sync.stop();
    boot.boot.stop();
  });

  it('a worker that answers wrongly: the store’s checks refuse it, the reload validates in this thread', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const boot = bootRig({
      wrap: (_, api) => ({
        ...api,
        loadReplica: async (params, ctx) => {
          const answer = await api.loadReplica(params, ctx);
          return params.revision === 2 ? { ...answer, recordCounts: { ...answer.recordCounts, species: 999 } } : answer;
        },
      }),
    });
    const { b, sync } = await followerWithWorker(rig, boot);
    await a.t.adapter.replaceAll(renamed(base, 'Replaced'), 2);
    await settle(rig, b, () => b.store()?.getRevision() === 2);
    expect(b.events.filter((e) => e.type === 'validation_fallback')).toHaveLength(1);
    expect(sortedFindings(storeOf(b).findings.all())).toEqual(fullFindings(b));
    sync.stop();
    boot.boot.stop();
  });
});

describe('a promotion runs boot through the same port', () => {
  it('validates in the worker, reloads the store with precomputed findings, and the replica is not loaded a second time for it', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const boot = bootRig();
    const { b, sync } = await followerWithWorker(rig, boot);
    mustCommit(edit(a, 'first'));
    await a.t.adapter.flush();
    await settle(rig, b, () => b.store()?.getRevision() === 2);
    await sync.settled();
    expect(loads(boot)).toBe(1);

    await a.t.adapter.setLastCleanShutdownAt('2026-09-30T12:00:00.000Z');
    await a.t.adapter.close();
    await settle(rig, b, () => b.follower?.isReadOnly() === false);

    const promoted = b.events.find((event) => event.type === 'promoted');
    expect(promoted).toMatchObject({ type: 'promoted', revision: 2 });
    expect(promoted?.type === 'promoted' ? promoted.bootReport?.validation : undefined).toMatchObject({ where: 'worker' });
    expect(storeOf(b).isReadOnly()).toBe(false);
    await sync.settled();
    expect(loads(boot), 'boot at open, then the promotion: one load each').toBe(2);
    expect(boot.calls.filter((c) => c.endsWith('applyChanges')).length).toBe(1);
    expect(sync.status()).toMatchObject({ state: 'in_sync', replicaRevision: 2 });
    expect(sortedFindings(storeOf(b).findings.all())).toEqual(fullFindings(b));
    expectReplicaEqualsStore(must(boot.replicas[0]), storeOf(b), 'after the promotion');
    expect(storeOf(b).getState()).toEqual((await loadState(b.t.adapter)).state);

    // The promoted tab writes; the replica follows it through the ordinary path.
    mustCommit(edit(b, 'after promotion'));
    await b.t.adapter.flush();
    await sync.settled();
    expect(notesOf(b)).toBe('after promotion');
    expectReplicaEqualsStore(must(boot.replicas[0]), storeOf(b), 'after a commit of the promoted tab');
    sync.stop();
    boot.boot.stop();
  });

  it('a worker that is gone at promotion: the tab still becomes the writer, validated in this thread, and the report says so', async () => {
    const rig = await fakeRig();
    const a = await openTab(rig.env);
    const boot = bootRig({ client: { maxRestarts: 0 } });
    const { b, sync } = await followerWithWorker(rig, boot);
    boot.workers[0]?.crash('exit');
    await sync.settled();
    await a.t.adapter.setLastCleanShutdownAt('2026-09-30T12:00:00.000Z');
    await a.t.adapter.close();
    await settle(rig, b, () => b.follower?.isReadOnly() === false);
    const promoted = b.events.find((event) => event.type === 'promoted');
    expect(promoted?.type === 'promoted' ? promoted.bootReport?.validation : undefined).toMatchObject({ where: 'main', reason: expect.stringMatching(/could not validate|down for good/) });
    expect(boot.events.filter((e) => e.type === 'validation_fallback').length).toBeGreaterThan(0);
    expect(storeOf(b).isReadOnly()).toBe(false);
    expect(sortedFindings(storeOf(b).findings.all())).toEqual(fullFindings(b));
    sync.stop();
    boot.boot.stop();
  });
});
