/**
 * 7.3b A1: every record an import ADDS or REPLACES carries `provenance.importBatchId` = that import's batch id (a value in the file is
 * overwritten); a record the import leaves alone keeps what it had; Undo import still restores the earlier state.
 */
import { describe, expect, it } from 'vitest';
import { emptyRecordTables, type AnyRecord, type CanonicalState } from '@/core/schema';
import { makeStore } from '@/test-support/command-kit';
import { exportBytes, parseBytes, parsedFrom, testSession } from '@/test-support/import-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import type { ImportPlan } from './contracts';

const base = loadFixtureState('maximal-valid');
const empty: CanonicalState = { meta: base.meta, records: emptyRecordTables() };

const every = (state: CanonicalState): AnyRecord[] => Object.values(state.records).flatMap((table) => Object.values(table as Record<string, AnyRecord>));

function planOf(outcome: Awaited<ReturnType<ReturnType<typeof testSession>['session']['preview']>>): ImportPlan {
  if (!outcome.ok) throw new Error(`preview refused: ${outcome.code} ${outcome.message}`);
  return outcome.plan;
}

describe('import batch id on the records an import writes (7.3b A1)', () => {
  it('a merge into an empty store stamps every added record with the batch id', async () => {
    const store = makeStore(empty);
    const { session } = testSession(store);
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'a.orn.json' }));
    const applied = await session.apply(plan.preview.batchId, plan);
    expect(applied.ok).toBe(true);
    const records = every(store.getState());
    expect(records.length).toBeGreaterThan(10);
    for (const record of records) expect(record.provenance.importBatchId, `${record.kind} ${record.id}`).toBe(plan.preview.batchId);
  });

  it('records the import leaves alone (keep_current) keep their own provenance; the preview itself changes nothing', async () => {
    const store = makeStore(base);
    const before = store.getState();
    const { session } = testSession(store);
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'again.orn.json' }));
    expect(store.getState()).toBe(before);
    await session.apply(plan.preview.batchId, plan);
    // identical records are skipped, so nothing is stamped with this batch
    expect(every(store.getState()).filter((record) => record.provenance.importBatchId === plan.preview.batchId)).toEqual([]);
  });

  it('replace_all stamps every record of the file', async () => {
    const store = makeStore(base);
    const { session } = testSession(store);
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'all.orn.json', request: { mode: 'replace_all' } }));
    await session.apply(plan.preview.batchId, plan);
    for (const record of every(store.getState())) expect(record.provenance.importBatchId).toBe(plan.preview.batchId);
  });

  it('the same file imported again still reads as identical: the batch id is not part of what a record says', async () => {
    const store = makeStore(empty);
    const { session } = testSession(store);
    const parsed = await parsedFrom(base);
    const first = planOf(await session.preview({ parsed, fileName: 'a.orn.json' }));
    await session.apply(first.preview.batchId, first);
    const second = planOf(await session.preview({ parsed, fileName: 'a-again.orn.json' }));
    expect(second.conflicts.every((entry) => entry.identical)).toBe(true);
    expect(Object.values(second.preview.counts).every((entry) => entry.conflicting === 0 && entry.new === 0)).toBe(true);
  });

  it('export leaves the batch id out (it names a row of this browser journal), so export -> import -> export stays byte-identical (INV-19)', async () => {
    const store = makeStore(empty);
    const { session } = testSession(store);
    const first = await exportBytes(base);
    const plan = planOf(await session.preview({ parsed: await parseBytes(first), fileName: 'a.orn.json' }));
    await session.apply(plan.preview.batchId, plan);
    expect(every(store.getState()).every((record) => record.provenance.importBatchId === plan.preview.batchId)).toBe(true);
    const second = await exportBytes(store.getState());
    expect(new TextDecoder().decode(second)).not.toContain('importBatchId');
    expect(second).toEqual(first);
  });
});
