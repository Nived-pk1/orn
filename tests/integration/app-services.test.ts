/**
 * Step 5.1a, createAppServices over fake-indexeddb with in-memory lock and channel fakes and the compute host over the in-memory
 * port pair (docs/IMPLEMENTATION_PLAN.md §2, 5.1a): the shape (headless, importable in Node), boot into every mode, the compute
 * worker that cannot start, session-only, retryReplica and dispose. Writer wiring is in app-services-writer.test.ts, the
 * follower in app-services-follower.test.ts, status in app-services-status.test.ts, a real thread in app-services-threads.test.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '@/app/services';
import { createBooter, demoState, renameDataset, smallState } from '@/test-support/app-boot-kit';
import { testEnv, worldHolding, type TestEnv } from '@/test-support/app-env-kit';
import { expectReplicaEqualsStore } from '@/test-support/replica-kit';

const booter = createBooter();
afterEach(() => booter.disposeAll());
const boot = booter.boot;
const demo = demoState();
const small = smallState();

describe('the services are plain TypeScript (E1)', () => {
  it('imports and runs in Node: no React, no DOM, no browser global in the source', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    const dir = new URL('../../src/app/services/', import.meta.url);
    const sources = readdirSync(dir).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
    expect(sources.length).toBeGreaterThan(5);
    for (const name of sources) {
      const code = readFileSync(new URL(name, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, name).not.toMatch(/from 'react|from "react|\bdocument\.|\bwindow\.|\blocalStorage\b|\bsessionStorage\b|\bnavigator\b|\bglobalThis\b|Math\.random|Date\.now|new Date\(|new Worker|new BroadcastChannel|indexedDB\./);
    }
  });

  it('createAppServices returns a value and a status; the env is the only input', async () => {
    const { services } = await boot({ world: await worldHolding(small) });
    expect(services.status.get().stage).toBe('ready');
    expect(services.status.get().mode).toBe('writer');
    expect(Object.keys(services).sort()).toEqual(
      [
        'bootReport', 'chem', 'depictions', 'dispose', 'flows', 'indexes', 'l4', 'layout', 'log', 'pendingWrites', 'persistence', 'replicaSync', 'retryEngine', 'retryReplica',
        'saveEverythingNow', 'search', 'searchSync', 'shutdown', 'status', 'store',
      ].sort(),
    );
  });
});

describe('boot: a fresh database (nothing stored yet) is an empty writer', () => {
  it('has an empty store at revision 0, a write queue, a replica in sync and a saved status', async () => {
    const { services, t } = await boot();
    const status = services.status.get();
    expect(status).toMatchObject({ mode: 'writer', reason: null, singleTab: false, promotion: 'not_applicable', save: { state: 'saved', pendingRevisions: 0 }, validation: { where: 'none' } });
    expect(services.store.getRevision()).toBe(0);
    expect(services.store.isReadOnly()).toBe(false);
    expect(Object.values(services.store.getState().records).every((table) => Object.keys(table).length === 0)).toBe(true);
    const sync = services.replicaSync();
    expect((await sync?.settled())?.state).toBe('in_sync');
    expect(t.calls.filter((call) => call.endsWith(':loadReplica'))).toHaveLength(1);
  });

  it('the first commit is saved and a second boot finds it', async () => {
    const { services, t } = await boot();
    renameDataset(services, 'Renamed');
    expect(services.pendingWrites()).toBe(true);
    await services.persistence?.flush();
    expect(services.pendingWrites()).toBe(false);
    await services.dispose();
    const again = await booter.bootEnv(testEnv({ world: t.world }));
    expect(again.store.getState().meta.title).toBe('Renamed');
    expect(again.store.getRevision()).toBe(1);
  });
});

describe('boot: a database holding the demo', () => {
  it('takes its findings from the compute worker, loads the replica ONCE and builds the full indexes once, lazily', async () => {
    const { services, t } = await boot({ world: await worldHolding(demo, 5) });
    const status = services.status.get();
    expect(status).toMatchObject({ mode: 'writer', validation: { where: 'worker' }, replica: { state: 'in_sync' } });
    expect(services.bootReport?.validation.where).toBe('worker');
    expect(services.store.getRevision()).toBe(5);
    expect(services.store.findings.all().length).toBe(services.bootReport?.findings.length);
    expect(t.calls.filter((call) => call.endsWith(':loadReplica'))).toEqual(['0:loadReplica']);
    expect(t.workers).toHaveLength(1);
    expect((await services.replicaSync()?.settled())?.replicaRevision).toBe(5);
    expectReplicaEqualsStore(t.replicas[0] as never, services.store, 'boot');
    // Lazy: nothing is built until the first read; then once, and a second read reuses it.
    expect(services.indexes.stats().builds).toBe(0);
    expect(services.indexes.current().revision).toBe(5);
    services.indexes.current();
    expect(services.indexes.stats()).toMatchObject({ builds: 1, applies: 0, lastBuildReason: 'first' });
  });

  it('carries the boot report notices into the status', async () => {
    const { services } = await boot({ world: await worldHolding(small) });
    expect(services.status.get().notices).toEqual({ crashSuspected: false, quarantinedRows: 0, assetsWithoutBytes: 0, unverifiedAssetBlobs: 0, migrationSteps: 0 });
  });
});

describe('the compute worker cannot validate: boot goes on in this thread and says so', () => {
  const asserting = async (t: TestEnv, services: AppServices): Promise<void> => {
    const status = services.status.get();
    expect(status.validation?.where).toBe('main');
    expect(status.validation?.reason).not.toBe('');
    expect(services.bootReport?.validation.where).toBe('main');
    expect(status.mode).toBe('writer');
    expect(services.store.getRevision()).toBe(3);
    expect(services.store.findings.all().length).toBe(services.bootReport?.findings.length);
    expect(services.log.get().some((entry) => entry.source === 'worker' && entry.event.type === 'validation_fallback')).toBe(true);
    void t;
  };

  it('a worker that cannot start', async () => {
    const world = await worldHolding(demo, 3);
    const { services, t } = await boot({ world, computeFactory: () => { throw new Error('no workers here'); } });
    await asserting(t, services);
    await vi.waitFor(() => expect(services.status.get().replica.state).toBe('down'));
  });

  it('a worker that keeps crashing: the client gives up, boot validates here, the replica is down', async () => {
    const world = await worldHolding(demo, 3);
    const { services, t } = await boot({
      world,
      wrap: (_i, api, worker) => ({
        ...api,
        loadReplica: () => {
          worker.crash('exit');
          return new Promise(() => undefined);
        },
      }),
    });
    await asserting(t, services);
    await vi.waitFor(() => expect(services.status.get().replica.state).toBe('down'));
    expect(services.log.get().some((entry) => entry.source === 'worker' && entry.event.type === 'gave_up')).toBe(true);
  });

  it('a worker that refuses the whole-state load', async () => {
    const world = await worldHolding(demo, 3);
    const { services, t } = await boot({ world, wrap: (_i, api) => ({ ...api, loadReplica: () => Promise.reject(new Error('refused')) }) });
    await asserting(t, services);
  });

  it('a worker that answers findings the store refuses', async () => {
    const world = await worldHolding(demo, 3);
    const { services, t } = await boot({
      world,
      wrap: (_i, api) => ({ ...api, loadReplica: async (params, ctx) => ({ ...(await api.loadReplica(params, ctx)), ruleSet: 'not-the-rule-set' }) }),
    });
    await asserting(t, services);
    expect(services.status.get().validation?.reason).toMatch(/refused/);
  });
});
