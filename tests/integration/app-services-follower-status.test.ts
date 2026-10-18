/**
 * Step 6.1b part 3 (openItem 171): a follower's status follows the other tab. A promoted follower shows the quarantine count of ITS promotion's
 * boot (not the count of its first boot); a follower re-reads the count (read only) after each applied remote change and each full reload, so
 * another tab's import that sets records aside shows "N records set aside" here too.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBooter, demoState, editNote, tamper } from '@/test-support/app-boot-kit';
import { testEnv, worldHolding } from '@/test-support/app-env-kit';
import { demoFile, importFile } from '@/test-support/app-flow-kit';
import type { QuarantineRow } from '@/persistence/contracts';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const row = (id: string): QuarantineRow => ({ id, createdAt: '2026-10-01T00:00:00.000Z', source: 'boot_integrity', claimedKind: 'species', issues: ['planted by the test'], raw: { id: 'spc_x', broken: true } });

async function twoTabs() {
  const world = await worldHolding(demoState(), 2);
  const a = await booter.bootEnv(testEnv({ world }));
  const b = await booter.bootEnv(testEnv({ world }));
  expect(b.status.get().mode).toBe('follower');
  return { world, a, b };
}
const countInDb = async (world: Awaited<ReturnType<typeof twoTabs>>['world']): Promise<number> => {
  let n = 0;
  await tamper(world, async (db) => {
    n = await db.quarantine.count();
  });
  return n;
};

describe('the follower\'s quarantine count', () => {
  it('a promoted follower shows the count of its promotion\'s boot, not of its first boot', async () => {
    const { world, a, b } = await twoTabs();
    expect(b.status.get().quarantinedCount).toBe(0);
    await tamper(world, (db) => db.quarantine.bulkAdd([row('q1'), row('q2')])); // set aside while this tab only follows
    await a.dispose();
    await vi.waitFor(() => expect(b.status.get().promotion).toBe('promoted'));
    expect(b.status.get().quarantinedCount).toBe(2);
  });

  it('a change applied from the writer re-reads the count (read only): rows set aside by another tab show up', async () => {
    const { world, a, b } = await twoTabs();
    expect(b.status.get().quarantinedCount).toBe(0);
    await tamper(world, (db) => db.quarantine.bulkAdd([row('q1')]));
    editNote(a, 'a commit after the rows were set aside');
    await a.persistence?.flush();
    world.channels.deliver();
    await vi.waitFor(() => expect(b.status.get().quarantinedCount).toBe(1));
    expect(b.status.get().mode).toBe('follower');
    expect(await countInDb(world)).toBe(1); // the follower wrote nothing
  });

  it('the writer\'s import with a bad record raises the follower\'s count to what the database holds (a full reload follows an import)', async () => {
    const { world, a, b } = await twoTabs();
    const doc = JSON.parse(await (await demoFile()).text()) as { records: Record<string, unknown> };
    const species = doc.records.species;
    const first = (Array.isArray(species) ? species[0] : Object.values(species as Record<string, unknown>)[0]) as { names: unknown };
    first.names = 'not an object';
    const applied = await importFile(a, new Blob([JSON.stringify(doc)]), 'one-bad-record.orn.json');
    expect(applied.report.quarantinedCount).toBeGreaterThan(0);
    await a.persistence?.flush();
    world.channels.deliver();
    await vi.waitFor(() => expect(b.status.get().quarantinedCount).toBe(applied.report.quarantinedCount));
    expect(b.status.get().quarantinedCount).toBe(await countInDb(world));
    expect(b.status.get().mode).toBe('follower');
  });
});
