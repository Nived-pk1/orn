/**
 * Step 5.1a, boot modes of createAppServices (docs/PERSISTENCE.md §4, plan review Q6): read-only with a final reason (never
 * promoted, an empty store, nothing written) and session-only (a store in memory, no adapter, the status says nothing is saved).
 * The writer, follower and promotion modes are in app-services.test.ts, -writer and -follower.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppServices } from '@/app/services';
import { createBooter, renameDataset, smallState, storedMeta, tamper } from '@/test-support/app-boot-kit';
import { worldHolding } from '@/test-support/app-env-kit';
import { envelope } from '@/test-support/command-kit';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const empty = (services: AppServices): boolean => Object.values(services.store.getState().records).every((table) => Object.keys(table).length === 0);

describe('boot: read-only reasons are final, with an empty store', () => {
  const cases = [
    ['newer_schema', (db: Parameters<Parameters<typeof tamper>[1]>[0]) => db.meta.put({ key: 'schemaVersion', value: 99 })],
    ['integrity_failure', (db: Parameters<Parameters<typeof tamper>[1]>[0]) => db.meta.delete('datasetMeta')],
    ['migration_failed', (db: Parameters<Parameters<typeof tamper>[1]>[0]) => db.meta.put({ key: 'schemaVersion', value: 0 })],
  ] as const;

  it.each(cases)('%s: read-only with the reason and its detail, never promoted, nothing written', async (reason, change) => {
    const world = await worldHolding(smallState(), 4);
    await tamper(world, change);
    const before = await storedMeta(world);
    const { services } = await booter.boot({ world });
    const status = services.status.get();
    expect(status).toMatchObject({ mode: 'read_only', reason, promotion: 'not_applicable', stage: 'ready' });
    expect(status.detail?.length).toBeGreaterThan(5);
    expect(services.store.isReadOnly()).toBe(true);
    expect(empty(services)).toBe(true);
    expect(services.store.dispatch(envelope('Rename', { type: 'meta.update', meta: { ...services.store.getState().meta, title: 'x' } }))).toMatchObject({ ok: false, error: { code: 'READ_ONLY' } });
    // never promoted: nobody holds the lock and nobody waits for it
    expect(world.locks.held()).toEqual([]);
    expect(world.locks.waiting()).toBe(0);
    expect(services.log.get().some((entry) => entry.source === 'app' && entry.event.type === 'read_only')).toBe(true);
    expect(await storedMeta(world)).toBe(before);
    expect(await services.shutdown()).toMatchObject({ written: false, reason: 'not_writer' });
    expect(await services.saveEverythingNow()).toMatchObject({ ok: false, code: 'NOT_WRITER' });
  });
});

describe('boot: IndexedDB unavailable is session-only', () => {
  async function expectSessionOnly(services: AppServices): Promise<void> {
    const status = services.status.get();
    expect(status).toMatchObject({ mode: 'session_only', save: null, stage: 'ready' });
    expect(status.detail).toMatch(/./);
    expect(services.persistence).toBeUndefined();
    expect(services.bootReport).toBeUndefined();
    expect(services.store.isReadOnly()).toBe(false);
    expect(services.pendingWrites()).toBe(false);
    renameDataset(services, 'In memory');
    expect(services.store.getRevision()).toBe(1);
    expect(await services.saveEverythingNow()).toMatchObject({ ok: false, code: 'NO_STORAGE' });
    expect(await services.shutdown()).toMatchObject({ written: false, reason: 'no_storage' });
    expect(services.log.get().some((entry) => entry.source === 'app' && entry.event.type === 'session_only')).toBe(true);
  }

  it('no IndexedDB in the env', async () => {
    const { services } = await booter.boot({ noIndexedDb: true });
    await expectSessionOnly(services);
    expect((await services.replicaSync()?.settled())?.state).toBe('in_sync');
  });

  it('an IndexedDB that refuses to open', async () => {
    const { services } = await booter.boot({}, (t) => ({
      ...t.env,
      indexedDB: {
        open: () => {
          throw new Error('blocked by policy');
        },
      } as never,
    }));
    await expectSessionOnly(services);
  });
});
