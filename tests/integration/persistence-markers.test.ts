/**
 * The meta markers (clean shutdown, integrity check) go through the write queue (SONNET_HANDOFF §18.8), and a
 * read-only adapter never writes (INV-28). Step 3.1 and its review.
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalState } from '@/core/schema';
import { emptyLike, freshAdapter, seedChangeSet, type TestAdapter } from '@/test-support/persistence-kit';
import { commit, loadFixtureState, must } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const speciesIds = Object.keys(base.records.species).sort();

async function seeded(): Promise<TestAdapter> {
  const t = freshAdapter({ initialRevision: 0 });
  await t.adapter.writeChanges(seedChangeSet(base, 1), base);
  return t;
}

function annotate(before: CanonicalState, id: string, revision: number, note = `note ${revision}`) {
  return commit(before, revision, (tables) => {
    tables.species[id] = { ...must(before.records.species[id]), notes: note };
  });
}

describe('meta markers and read-only', () => {
  it('stores the clean-shutdown and integrity-check markers as meta rows', async () => {
    const t = await seeded();
    await t.adapter.setLastCleanShutdownAt('2026-09-28T10:00:00.000Z');
    await t.adapter.setLastIntegrityCheckAt('2026-09-28T10:00:01.000Z');
    const { meta } = await t.adapter.readCommitted();
    expect(meta).toMatchObject({ lastCleanShutdownAt: '2026-09-28T10:00:00.000Z', lastIntegrityCheckAt: '2026-09-28T10:00:01.000Z', revision: 1 });
  });

  it('a marker set while a write is pending lands after it (SONNET_HANDOFF §18.8: no IndexedDB write outside the queue)', async () => {
    const t = await seeded();
    const { after, changes } = annotate(base, speciesIds[0] as string, 2);
    const mark = t.mutations.length;
    const write = t.adapter.writeChanges(changes, after);
    const marker = t.adapter.setLastCleanShutdownAt('2026-09-28T11:00:00.000Z');
    const integrity = t.adapter.setLastIntegrityCheckAt('2026-09-28T11:00:01.000Z');
    await Promise.all([write, marker, integrity]);
    const keys = t.mutations.slice(mark).flatMap((m) => (m.store === 'meta' ? (m.values as { key: string }[]).map((v) => `meta:${v.key}`) : [m.store]));
    expect(keys.indexOf('records')).toBeLessThan(keys.indexOf('meta:lastCleanShutdownAt'));
    expect(keys.indexOf('meta:revision')).toBeLessThan(keys.indexOf('meta:lastCleanShutdownAt'));
    expect(keys.indexOf('meta:lastCleanShutdownAt')).toBeLessThan(keys.indexOf('meta:lastIntegrityCheckAt'));
  });

  it('a marker set during a retry backoff waits for the write ahead of it', async () => {
    const t = await seeded();
    const { after, changes } = annotate(base, speciesIds[0] as string, 2);
    t.faults.fail('records', () => new Error('transient'));
    const write = t.adapter.writeChanges(changes, after);
    await t.scheduler.waitForTimer();
    const marker = t.adapter.setLastIntegrityCheckAt('2026-09-28T11:00:02.000Z');
    t.faults.clear();
    t.scheduler.fire();
    await Promise.all([write, marker]);
    const order = t.mutations.filter((m) => m.store === 'meta').flatMap((m) => (m.values as { key: string }[]).map((v) => v.key));
    expect(order.slice(-2)).toEqual(['revision', 'lastIntegrityCheckAt']);
    expect((await t.adapter.readCommitted()).meta.revision).toBe(2);
  });

  it('a read-only adapter reports read_only and never writes (INV-28)', () => {
    const t = freshAdapter({ readOnly: true });
    expect(t.adapter.getStatus().state).toBe('read_only');
    const { after, changes } = annotate(base, speciesIds[0] as string, 1);
    expect(() => t.adapter.writeChanges(changes, after)).toThrow(/read-only/);
    expect(t.log.writes()).toEqual([]);
  });

  it('an empty database reads back as no rows and no meta', async () => {
    const t = freshAdapter();
    expect(await t.adapter.readCommitted()).toEqual({ rows: [], meta: {} });
    expect(emptyLike(base).meta).toBe(base.meta);
  });

  it('status subscribers see saving then saved; close flushes and closes the database', async () => {
    const t = freshAdapter({ initialRevision: 1 });
    const seen: string[] = [];
    t.adapter.subscribeStatus((s) => seen.push(`${s.state}:${s.pendingRevisions}`));
    const { after, changes } = annotate(base, speciesIds[0] as string, 2);
    const done = t.adapter.writeChanges(changes, after);
    await t.adapter.close();
    await done;
    expect(seen).toEqual(['saving:1', 'saved:0']);
    expect(t.db.isOpen()).toBe(false);
  });
});
