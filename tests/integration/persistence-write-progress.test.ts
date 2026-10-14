/**
 * Step 5.11b: the record puts of one write transaction are made in slices and the writer reports how far it has got. The
 * transaction stays ONE (INV-20): a fault in the middle commits nothing (INV-21). On fake-indexeddb.
 */
import { describe, expect, it } from 'vitest';
import type { WriteProgress } from '@/persistence/contracts';
import { WRITE_SLICE_SIZE } from '@/persistence/write-slices';
import { generateState, tierParams } from '@/test-support/generator';
import { freshAdapter, loadState, seedChangeSet } from '@/test-support/persistence-kit';

const state = generateState(tierParams('tiny', 'dense', 1));
const total = Object.values(state.records).reduce((n, byId) => n + Object.keys(byId).length, 0);

describe('write progress (5.11b)', () => {
  it('the data is large enough to need several slices', () => {
    expect(total).toBeGreaterThan(WRITE_SLICE_SIZE * 3);
  });

  it('reports {written, total} after each slice of ONE transaction; written only rises and ends at total', async () => {
    const t = freshAdapter({ initialRevision: 0 });
    const seen: WriteProgress[] = [];
    const stop = t.adapter.watchWriteProgress((p) => seen.push(p));
    const before = t.log.writes().length;
    await t.adapter.writeChanges(seedChangeSet(state, 1), state);
    stop();
    expect(t.log.writes().length - before).toBe(1);
    expect(seen).toHaveLength(Math.ceil(total / WRITE_SLICE_SIZE));
    expect(seen.map((p) => p.total)).toEqual(seen.map(() => total));
    const written = seen.map((p) => p.written);
    expect(written).toEqual([...written].sort((a, b) => a - b));
    expect(new Set(written).size).toBe(written.length);
    expect(written[0]).toBe(WRITE_SLICE_SIZE);
    expect(written[written.length - 1]).toBe(total);
    expect((await loadState(t.adapter)).state).toEqual(state);
  });

  it('a stopped listener hears nothing more, and a listener that throws never fails the write', async () => {
    const t = freshAdapter({ initialRevision: 0 });
    const seen: WriteProgress[] = [];
    t.adapter.watchWriteProgress(() => {
      throw new Error('a broken display');
    });
    t.adapter.watchWriteProgress((p) => seen.push(p))();
    await t.adapter.writeChanges(seedChangeSet(state, 1), state);
    expect(seen).toEqual([]);
    expect(t.adapter.getStatus()).toMatchObject({ state: 'saved', lastSavedRevision: 1 });
  });

  it('a fault after some slices commits NOTHING: the store is as it was, the status is failed, progress never reached the total', async () => {
    const t = freshAdapter({ initialRevision: 0, retryDelaysMs: [] });
    const seen: WriteProgress[] = [];
    t.adapter.watchWriteProgress((p) => seen.push(p));
    t.faults.failAfter('records', 2, () => new Error('disk fault in slice 3'));
    await t.adapter.writeChanges(seedChangeSet(state, 1), state);
    expect(t.adapter.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1 });
    // slices 1 and 2 may or may not have been heard before the third failed and aborted the transaction; never more, never the total
    expect(seen.every((p) => p.written <= WRITE_SLICE_SIZE * 2 && p.total === total)).toBe(true);
    expect(await t.db.records.count()).toBe(0);
    expect(await t.db.meta.count()).toBe(0);
    // positive control: with the fault cleared the same write lands whole
    t.faults.clear();
    await t.adapter.flush();
    expect(t.adapter.getStatus()).toMatchObject({ state: 'saved', lastSavedRevision: 1 });
    expect(await t.db.records.count()).toBe(total);
  });
});

