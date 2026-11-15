/**
 * Step 8.4s, S6 (audit DA-08): a build that rejects most of the data must not move it all to quarantine. More than 20 rejected rows AND
 * more than 2% of the rows is a read-only integrity failure with nothing written; at or under either limit the old quarantine path runs.
 * (Split from persistence-boot.test.ts to stay under the 400-line limit.)
 */
import { describe, expect, it } from 'vitest';
import type { OpenResult } from '@/persistence/contracts';
import { loadFixtureState, must } from '@/test-support/state-fixture';
import { savedDatabase, type TestAdapter } from '@/test-support/persistence-kit';

const base = loadFixtureState('maximal-valid');
const speciesId = Object.keys(base.records.species).sort()[0] as string;
const speciesRow = must(base.records.species[speciesId]);

function opened(result: OpenResult): Exclude<OpenResult, { mode: 'unavailable' }> {
  if (result.mode === 'unavailable') throw new Error(`unavailable: ${result.detail}`);
  return result;
}
/** Boots and returns the result with the mutations boot itself made. */
async function boot(t: TestAdapter): Promise<{ result: Exclude<OpenResult, { mode: 'unavailable' }>; writes: { store: string; keys: string[] }[] }> {
  const mark = t.mutations.length;
  const result = opened(await t.adapter.open());
  const writes = t.mutations.slice(mark).map((m) => ({ store: m.store, keys: m.values.map((v) => String((v as { key?: string; id?: string }).key ?? (v as { id?: string }).id)) }));
  return { result, writes };
}

describe('step 8.4s, S6 (DA-08): a build that rejects most of the data never empties the dataset', () => {
  const badRow = (n: number) => ({ ...speciesRow, id: `spc_bad-${n}`, unexpectedField: n });

  it('more than 20 rejected rows AND more than 2% of the rows: read-only integrity_failure, nothing moved, nothing written', async () => {
    const t = await savedDatabase(base);
    await t.db.records.bulkPut(Array.from({ length: 25 }, (_, n) => badRow(n) as never));
    const total = await t.db.records.count();
    const { result, writes } = await boot(t);
    expect(result).toMatchObject({ mode: 'read_only', readOnlyReason: 'integrity_failure', state: null });
    expect(result.detail).toBe(`25 of ${total} records do not fit this version of the app. Nothing was changed. Export them, then reload with the newest version.`);
    expect(writes).toEqual([]);
    expect(await t.db.records.count()).toBe(total);
    expect(await t.adapter.listQuarantine()).toEqual([]);
    expect(t.adapter.getStatus().state).toBe('read_only');
  });

  it('exactly 20 rejected rows still go to quarantine, as before', async () => {
    const t = await savedDatabase(base);
    for (let n = 0; n < 20; n += 1) await t.db.records.put(badRow(n) as never);
    const { result } = await boot(t);
    expect(result).toMatchObject({ mode: 'read_write', quarantinedCount: 20 });
    expect(result.bootReport).toMatchObject({ newlyQuarantined: 20 });
  });

  it('more than 20 rejected rows but 2% or fewer of the rows go to quarantine, as before', async () => {
    const t = await savedDatabase(base);
    await t.db.records.bulkPut(Array.from({ length: 1500 }, (_, n) => ({ ...speciesRow, id: `spc_clone-${n}` }) as never));
    await t.db.records.bulkPut(Array.from({ length: 25 }, (_, n) => badRow(n) as never));
    const { result } = await boot(t);
    expect(result).toMatchObject({ mode: 'read_write', quarantinedCount: 25 });
  }, 60_000); // a new test with its own limit: it boots 1,500 rows through the full validation

  it('one damaged row is quarantined as always', async () => {
    const t = await savedDatabase(base);
    await t.db.records.put(badRow(1) as never);
    const { result } = await boot(t);
    expect(result).toMatchObject({ mode: 'read_write', quarantinedCount: 1 });
  });
});
