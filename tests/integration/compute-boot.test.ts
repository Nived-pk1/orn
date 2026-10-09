/**
 * Step 4.2d, boot through the compute worker (Q4, in memory: real handlers behind a port pair that clones every message, the real
 * adapter over fake IndexedDB). `BootPorts.validate` is `BootReplica.validate`: boot through the port equals the in-process boot
 * (state, revision, quarantine, findings), a migrated boot keeps its ERROR gate, `open()` builds no indexes (the store builds them
 * once: counted), a worker that cannot validate never blocks boot (fallback, visible in the report and as a WorkerEvent), and
 * the replica sync starts from the replica boot loaded (no second `loadReplica`). Follower reload and promotion are in
 * compute-follower.test.ts; a real thread is in compute-boot-threads.test.ts.
 */
import { produce } from 'immer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { coreIndexEngine } from '@/core/indexes/engine';
import type { MigrationRunner, SchemaMigration } from '@/core/migrations/contracts';
import type { CanonicalState } from '@/core/schema';
import type { OpenResult } from '@/persistence/contracts';
import { bootRig, type BootRig } from '@/test-support/compute-boot-kit';
import { buildDemoDocument } from '@/test-support/demo';
import { documentToState } from '@/core/dataset';
import { loadState, reopen, savedDatabase, type TestAdapter } from '@/test-support/persistence-kit';
import { expectReplicaEqualsStore, sortedFindings } from '@/test-support/replica-kit';
import { loadFixtureState, must } from '@/test-support/state-fixture';
import { SYNTHETIC_STEPS, SYNTHETIC_SYSTEM } from '@/test-support/synthetic-migration';
import { withVersionOffsetToCurrent } from '@/test-support/version-offset';
import { createReplicaSync } from '@/workers/compute/sync';

afterEach(() => vi.restoreAllMocks());

const base = loadFixtureState('maximal-valid');
const small = loadFixtureState('minimal-valid');
const speciesId = Object.keys(small.records.species).sort()[0] as string;
const RUNNER = withVersionOffsetToCurrent(SYNTHETIC_STEPS);
const demo = (() => {
  const parsed = documentToState(buildDemoDocument());
  if (!parsed.ok) throw new Error('setup');
  return parsed.state;
})();

function opened(result: OpenResult): Exclude<OpenResult, { mode: 'unavailable' }> {
  if (result.mode === 'unavailable') throw new Error(result.detail);
  return result;
}
type Opened = ReturnType<typeof opened>;

/** What two boots must agree on: everything but where validation ran. */
function comparable(result: Opened): unknown {
  const { bootReport, ...rest } = result;
  if (bootReport === undefined) return rest;
  const { validation: _validation, precomputed, findings, ...report } = bootReport;
  return { ...rest, report, findings: sortedFindings(findings), precomputed: precomputed === undefined ? undefined : { ...precomputed, findings: sortedFindings(precomputed.findings) } };
}

/** Rewrites a current database into the made-up version 0 shape (a test fixture, as in persistence-boot-migration.test.ts). */
async function downgrade(t: TestAdapter): Promise<void> {
  await t.db.records.put({ ...must(await t.db.records.get(speciesId)), legacyColor: 'blue' } as never);
  const { title, ...rest } = must(await t.db.meta.get('datasetMeta')).value as Record<string, unknown>;
  await t.db.meta.put({ key: 'datasetMeta', value: { ...rest, name: title } as never });
  await t.db.meta.put({ key: 'schemaVersion', value: 0 });
}
async function v0Database(runner: MigrationRunner, validate?: BootRig['boot']['validate']): Promise<TestAdapter> {
  const t = await savedDatabase(small, {}, 4);
  await downgrade(t);
  return reopen(t, { runner, ...(validate === undefined ? {} : { validate }) });
}

describe('boot through the worker port equals the in-process boot', () => {
  it.each([['the minimal fixture', small], ['the maximal fixture', base], ['the demo', demo]] as const)('%s: state, revision, findings, report', async (_label, state) => {
    const local = opened(await (await savedDatabase(state)).adapter.open());
    const rig = bootRig();
    const remote = opened(await (await savedDatabase(state, { validate: rig.boot.validate })).adapter.open());
    expect(comparable(remote)).toEqual(comparable(local));
    expect(remote.bootReport?.validation).toMatchObject({ where: 'worker' });
    expect(local.bootReport?.validation).toMatchObject({ where: 'main' });
    expect(rig.calls).toEqual(['0:loadReplica']);
    rig.boot.stop();
  });

  it('rows that fail L1 are quarantined the same way, and the findings are those of the state without them', async () => {
    const withBadRow = async (options: Partial<Parameters<typeof reopen>[1]>): Promise<TestAdapter> => {
      const t = await savedDatabase(base);
      await t.db.records.put({ id: 'spc_broken', kind: 'species', names: 5 } as never);
      return reopen(t, options);
    };
    const local = opened(await (await withBadRow({})).adapter.open());
    const rig = bootRig();
    const remote = opened(await (await withBadRow({ validate: rig.boot.validate })).adapter.open());
    expect(remote.bootReport?.newlyQuarantined).toBe(1);
    expect(comparable(remote)).toEqual(comparable(local));
    rig.boot.stop();
  });

  it('a store built from the boot result with its precomputed findings equals one that validated for itself; a wrong revision is refused loudly', async () => {
    const rig = bootRig();
    const result = opened(await (await savedDatabase(base, { validate: rig.boot.validate })).adapter.open());
    const { state, revision, bootReport } = result;
    if (state === null || bootReport?.precomputed === undefined) throw new Error('no boot data');
    const fast = createCanonicalStore({ initial: state, revision, precomputed: bootReport.precomputed, verifyPrecomputed: true });
    const slow = createCanonicalStore({ initial: state, revision });
    expect(sortedFindings(fast.findings.all())).toEqual(sortedFindings(slow.findings.all()));
    expect(() => createCanonicalStore({ initial: state, revision: revision + 1, precomputed: bootReport.precomputed })).toThrow(/revision/);
    expect(() => createCanonicalStore({ initial: small, revision, precomputed: bootReport.precomputed })).toThrow(/count|not in the new state/);
    rig.boot.stop();
  });
});

describe('a migrated boot through the port keeps its ERROR gate', () => {
  const migrated: CanonicalState = produce(small, (draft) => {
    (draft.records.species[speciesId] as unknown as { provenance: { legacy?: unknown } }).provenance.legacy = { system: SYNTHETIC_SYSTEM, unmapped: { legacyColor: 'blue' } };
  });

  it('migrates, validates in the worker before replaceAll, and gives the in-process result', async () => {
    const local = opened(await (await v0Database(RUNNER)).adapter.open());
    const rig = bootRig();
    const t = await v0Database(RUNNER, rig.boot.validate);
    const remote = opened(await t.adapter.open());
    expect(remote).toMatchObject({ mode: 'read_write', revision: 5, storedSchemaVersion: 0 });
    expect(remote.state).toEqual(migrated);
    expect(comparable(remote)).toEqual(comparable(local));
    expect(remote.bootReport?.validation).toMatchObject({ where: 'worker' });
    expect(rig.calls).toEqual(['0:loadReplica']);
    expect((await loadState(t.adapter)).state).toEqual(migrated);
    expect(await t.adapter.listSnapshots()).toEqual([expect.objectContaining({ reason: 'pre_migration', schemaVersion: 0, revision: 4 })]);
    rig.boot.stop();
  });

  it('migrated data with an L2 error (a dangling reference) is refused although the worker validated it: rows put back, nothing accepted', async () => {
    const failing: MigrationRunner = withVersionOffsetToCurrent([
      {
        from: 0,
        to: 1,
        description: 'dangling',
        migrate(doc) {
          const good = (SYNTHETIC_STEPS[0] as SchemaMigration).migrate(doc);
          const species = (good.doc.records['species'] as Record<string, unknown>[]).map((s, i) => (i === 0 ? { ...s, classIds: ['cls_does-not-exist'] } : s));
          return { ...good, doc: { ...good.doc, records: { ...good.doc.records, species } } };
        },
      },
    ]);
    const rig = bootRig();
    const t = await v0Database(failing, rig.boot.validate);
    const rowsBefore = await t.db.records.toArray();
    const result = opened(await t.adapter.open());
    expect(result).toMatchObject({ mode: 'read_only', readOnlyReason: 'migration_failed', detail: expect.stringMatching(/L1–L3 error/) });
    expect(rig.calls).toEqual(['0:loadReplica']);
    const byId = (rows: { id: string }[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(byId((await t.db.records.toArray()) as never)).toEqual(byId(rowsBefore as never));
    expect((await t.db.meta.get('schemaVersion'))?.value).toBe(0);
    rig.boot.stop();
  });
});

describe('open() builds no indexes when a validation port answers: the store builds them once', () => {
  it('in process (no port): boot builds one and the store builds one, as before', async () => {
    const t = await savedDatabase(base);
    const spy = vi.spyOn(coreIndexEngine, 'build');
    const result = opened(await t.adapter.open());
    expect(spy).toHaveBeenCalledTimes(1);
    createCanonicalStore({ initial: result.state as CanonicalState, revision: result.revision, validateInitial: false });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('through the worker port: open() builds none on this side; the worker builds one; the store builds one (counted)', async () => {
    const rig = bootRig();
    const t = await savedDatabase(base, { validate: rig.boot.validate });
    const spy = vi.spyOn(coreIndexEngine, 'build');
    const result = opened(await t.adapter.open());
    const total = spy.mock.calls.length;
    expect(rig.workerBuilds()).toBe(1);
    expect(total - rig.workerBuilds(), 'builds on the main side during open()').toBe(0);
    const { state, revision, bootReport } = result;
    createCanonicalStore({ initial: state as CanonicalState, revision, ...(bootReport?.precomputed === undefined ? {} : { precomputed: bootReport.precomputed }) });
    expect(spy.mock.calls.length - rig.workerBuilds(), 'builds on the main side in all').toBe(1);
    rig.boot.stop();
  });
});

describe('a worker that cannot validate never blocks boot: it validates in process, and says so', () => {
  async function bootedWith(rig: BootRig): Promise<Opened> {
    return opened(await (await savedDatabase(base, { validate: rig.boot.validate })).adapter.open());
  }
  const expectFallback = (result: Opened, rig: BootRig, reason: RegExp): void => {
    expect(result).toMatchObject({ mode: 'read_write', revision: 1 });
    expect(result.state).toEqual(base);
    expect(result.bootReport?.validation).toMatchObject({ where: 'main', reason: expect.stringMatching(reason) });
    expect(rig.events.filter((e) => e.type === 'validation_fallback')).toEqual([{ type: 'validation_fallback', reason: expect.stringMatching(reason) }]);
    // the findings are still there: the in-process pass ran
    expect(result.bootReport?.findings.length).toBeGreaterThanOrEqual(0);
    expect(result.bootReport?.precomputed?.revision).toBe(1);
  };

  it('the worker cannot be started', async () => {
    const rig = bootRig({
      factory: () => {
        throw new Error('no Worker constructor');
      },
    });
    expectFallback(await bootedWith(rig), rig, /could not be started|down for good|WORKER_CRASHED/);
  });

  it('the worker crashes under the call and the client gives up', async () => {
    const rig = bootRig({ client: { maxRestarts: 0 }, wrap: (_, api, worker) => ({ ...api, loadReplica: async (p, c) => (worker.crash('exit'), api.loadReplica(p, c)) }) });
    expectFallback(await bootedWith(rig), rig, /WORKER_CRASHED|down for good/);
  });

  it('the worker answers with the wrong rule set, or for another revision: refused by the store’s own checks', async () => {
    const wrongRules = bootRig({ wrap: (_, api) => ({ ...api, loadReplica: async (p, c) => ({ ...(await api.loadReplica(p, c)), ruleSet: 'another-rule-set' }) }) });
    expectFallback(await bootedWith(wrongRules), wrongRules, /refused.*rule set/s);
    const wrongRevision = bootRig({ wrap: (_, api) => ({ ...api, loadReplica: async (p, c) => ({ ...(await api.loadReplica(p, c)), revision: p.revision + 1 }) }) });
    expectFallback(await bootedWith(wrongRevision), wrongRevision, /refused.*revision/s);
  });

  it('the worker refuses the request (BAD_REQUEST)', async () => {
    const rig = bootRig({
      wrap: (_, api) => ({
        ...api,
        loadReplica: async () => {
          throw Object.assign(new Error('nope'), { name: 'RpcHostError', code: 'BAD_REQUEST' });
        },
      }),
    });
    expectFallback(await bootedWith(rig), rig, /could not validate/);
  });

  it('after a fallback the sync gets no adoption and starts a worker of its own', async () => {
    const rig = bootRig({ wrap: (_, api, worker) => ({ ...api, loadReplica: async (p, c) => (worker.crash('exit'), api.loadReplica(p, c)) }), client: { maxRestarts: 0 } });
    const result = await bootedWith(rig);
    expect(rig.boot.adoption()).toBeUndefined();
    const store = createCanonicalStore({ initial: result.state as CanonicalState, revision: result.revision, ...(result.bootReport?.precomputed === undefined ? {} : { precomputed: result.bootReport.precomputed }) });
    const other = bootRig();
    const sync = createReplicaSync({ factory: other.factory, store });
    expect(await sync.settled()).toMatchObject({ state: 'in_sync', replicaRevision: 1, reloads: 1 });
    sync.stop();
  });
});

describe('the replica sync starts from the replica boot loaded', () => {
  it('ONE loadReplica in all: boot loaded it, the sync adopted it, and the replica follows later commits', async () => {
    const rig = bootRig();
    const t = await savedDatabase(base, { validate: rig.boot.validate });
    const result = opened(await t.adapter.open());
    const store = createCanonicalStore({ initial: result.state as CanonicalState, revision: result.revision, ...(result.bootReport?.precomputed === undefined ? {} : { precomputed: result.bootReport.precomputed }) });
    const adoption = rig.boot.adoption();
    expect(adoption).toMatchObject({ revision: 1 });
    const sync = createReplicaSync({ factory: rig.factory, store, ...(adoption === undefined ? {} : { adopt: adoption }) });
    expect(sync.status()).toMatchObject({ state: 'in_sync', replicaRevision: 1, reloads: 1 });
    expect(rig.workers).toHaveLength(1);
    expect(rig.calls.filter((c) => c.endsWith('loadReplica'))).toHaveLength(1);

    const target = Object.keys(store.getState().records.species).sort()[0] as string;
    const changed = store.dispatch({ label: 'edit', commands: [{ type: 'record.update', record: { ...(store.getState().records.species[target] as object), notes: 'after boot' } as never }] });
    expect(changed.ok).toBe(true);
    await sync.settled();
    expect(rig.calls.filter((c) => c.endsWith('loadReplica'))).toHaveLength(1);
    expect(rig.calls.filter((c) => c.endsWith('applyChanges'))).toHaveLength(1);
    expectReplicaEqualsStore(must(rig.replicas[0]), store, 'after a commit on the adopted replica');
    // The client is the sync's now: a crash reloads the replica from the store (the sync's restart hook), not from boot.
    rig.workers[0]?.crash('exit');
    const later = await sync.settled();
    expect(later.state === 'in_sync' || later.state === 'reloading').toBe(true);
    sync.stop();
  });

  it('a store at another revision than the boot replica: the sync says so and reloads', async () => {
    const rig = bootRig();
    const result = opened(await (await savedDatabase(base, { validate: rig.boot.validate })).adapter.open());
    const store = createCanonicalStore({ initial: result.state as CanonicalState, revision: result.revision + 3, validateInitial: false });
    const adoption = rig.boot.adoption();
    const sync = createReplicaSync({ factory: rig.factory, store, ...(adoption === undefined ? {} : { adopt: adoption }) });
    expect(sync.status().reason).toMatch(/boot replica is at revision 1, the store at 4/);
    expect(await sync.settled()).toMatchObject({ state: 'in_sync', replicaRevision: 4 });
    expect(rig.calls.filter((c) => c.endsWith('loadReplica'))).toHaveLength(2);
    sync.stop();
  });

  it('adoption() is handed over once, and only when the worker holds a replica', async () => {
    const rig = bootRig();
    expect(rig.boot.adoption()).toBeUndefined();
    const t = await savedDatabase(base, { validate: rig.boot.validate });
    await t.adapter.open();
    expect(rig.boot.adoption()).toBeDefined();
    expect(rig.boot.adoption()).toBeUndefined();
  });
});
