/**
 * The Dexie schema and its upgrade scaffold (step 3.1): DB_STORES changes need a version step, an upgrade
 * function and a test like the last one here (docs/PERSISTENCE.md §2).
 */
import { describe, expect, it } from 'vitest';
import { DB_STORES, DB_VERSION } from '@/persistence/contracts';
import { DB_VERSION_STEPS } from '@/persistence/db';
import { freshAdapter, freshDb, seedChangeSet } from '@/test-support/persistence-kit';
import { loadFixtureState } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');

async function seeded() {
  const t = freshAdapter({ initialRevision: 0 });
  await t.adapter.writeChanges(seedChangeSet(base, 1), base);
  return t;
}

describe('DB upgrade scaffold', () => {
  it('the newest version step is DB_VERSION and its stores are DB_STORES', () => {
    const last = DB_VERSION_STEPS.at(-1);
    expect(last?.version).toBe(DB_VERSION);
    // Stores the newest step lists as `null` are the ones it drops (the version-2 holding store); the rest ARE DB_STORES.
    const kept = Object.fromEntries(Object.entries(last?.stores ?? {}).filter(([, definition]) => definition !== null));
    expect(kept).toEqual(DB_STORES);
    expect(Object.keys(last?.stores ?? {}).filter((name) => last?.stores[name] === null && name in DB_STORES)).toEqual([]);
    expect(DB_VERSION_STEPS.map((s) => s.version)).toEqual([...DB_VERSION_STEPS.map((s) => s.version)].sort((a, b) => a - b));
  });

  it('a fresh database has every store and index DB_STORES defines', async () => {
    const t = freshDb();
    await t.db.open();
    for (const [name, definition] of Object.entries(DB_STORES)) {
      const table = t.db.table(name);
      const [primary, ...indexes] = definition.split(',').map((part) => part.trim());
      expect(table.schema.primKey.name).toBe(primary);
      expect(table.schema.indexes.map((i) => i.name).sort()).toEqual([...indexes].sort());
    }
    expect(t.db.tables.map((table) => table.name).sort()).toEqual(Object.keys(DB_STORES).sort());
  });

  it('a later version keeps existing rows and runs its upgrade function once (test-only version 2)', async () => {
    const t = await seeded();
    await t.adapter.setLastCleanShutdownAt('kept across the upgrade');
    t.db.close();
    let upgrades = 0;
    const v2 = freshDb(
      [
        ...DB_VERSION_STEPS,
        {
          version: DB_VERSION + 1,
          stores: { ...DB_STORES, scratch: 'id' },
          upgrade: async (tx) => {
            upgrades += 1;
            await tx.table('scratch').put({ id: 'from-upgrade' });
          },
        },
      ],
      t.indexedDB,
    );
    await v2.db.open();
    expect(upgrades).toBe(1);
    expect(await v2.db.table('scratch').get('from-upgrade')).toEqual({ id: 'from-upgrade' });
    expect(await v2.db.records.count()).toBe(Object.values(base.records).reduce((n, table) => n + Object.keys(table).length, 0));
    expect((await v2.db.meta.get('lastCleanShutdownAt'))?.value).toBe('kept across the upgrade');
    v2.db.close();
    const again = freshDb([...DB_VERSION_STEPS, { version: DB_VERSION + 1, stores: { ...DB_STORES, scratch: 'id' }, upgrade: () => { upgrades += 1; } }], t.indexedDB);
    await again.db.open();
    expect(upgrades).toBe(1);
  });
});
