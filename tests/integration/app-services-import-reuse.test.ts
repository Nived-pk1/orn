/**
 * Step 5.9a (item h, PERSISTENCE section 6): a legacy file imported a second time. When its SHA-256 matches an earlier batch, the
 * clock of that batch is reused, so the same records come out and every one is `identical_skip`; the preview says it was imported
 * before. A different file gets no such answer. `lastImport` names the newest batch for the words of Undo import.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createBooter } from '@/test-support/app-boot-kit';
import { newWorld } from '@/test-support/app-env-kit';
import { legacyBytes } from '@/test-support/legacy-import-kit';
import { blobOf } from '@/test-support/app-flow-kit';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const v6 = (): Blob => blobOf(legacyBytes('v6-demo-export.json'));

describe('a legacy file imported a second time', () => {
  it('reuses the earlier clock: every record is identical, and the preview says the file was imported before', async () => {
    const { services } = await booter.boot({ world: newWorld() });
    const first = await services.flows.preview(v6(), 'v6.json', { mode: 'merge' });
    if (!first.ok) throw new Error(first.message);
    expect(first.earlierImport).toBeUndefined();
    const applied = await services.flows.apply(first.plan.preview.batchId, first.plan);
    if (!applied.ok) throw new Error(applied.message);
    const recordsAfterFirst = services.store.getState().records;

    // the injected clock has moved on (a counting clock), yet the second preview reproduces the first import's records
    const second = await services.flows.preview(v6(), 'v6-copy.json', { mode: 'merge' });
    if (!second.ok) throw new Error(second.message);
    expect(second.earlierImport).toMatchObject({ fileName: 'v6.json' });
    const conflicts = second.plan.conflicts;
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.filter((c) => !c.identical)).toEqual([]);
    expect(conflicts.every((c) => c.resolution === 'identical_skip')).toBe(true);
    const counts = Object.values(second.plan.preview.counts);
    expect(counts.reduce((sum, c) => sum + (c?.conflicting ?? 0), 0)).toBe(0);
    expect(counts.reduce((sum, c) => sum + (c?.new ?? 0), 0)).toBe(0);
    // preview changed nothing
    expect(services.store.getState().records).toEqual(recordsAfterFirst);
  });

  it('a revise keeps the clock of its preview, so the records do not change under the user', async () => {
    const { services } = await booter.boot({ world: newWorld() });
    const first = await services.flows.preview(v6(), 'v6.json', { mode: 'merge' });
    if (!first.ok) throw new Error(first.message);
    const revised = await services.flows.revise(first.plan.preview.batchId, { mode: 'merge' });
    if (!revised.ok) throw new Error(revised.message);
    expect(revised.plan.preview.mergedRecordCount).toBe(first.plan.preview.mergedRecordCount);
    const applied = await services.flows.apply(revised.plan.preview.batchId, revised.plan);
    if (!applied.ok) throw new Error(applied.message);
    const again = await services.flows.preview(v6(), 'v6.json', { mode: 'merge' });
    if (!again.ok) throw new Error(again.message);
    expect(again.plan.conflicts.every((c) => c.identical)).toBe(true);
  });

  it('a different file has no earlier import', async () => {
    const { services } = await booter.boot({ world: newWorld() });
    const first = await services.flows.preview(v6(), 'v6.json', { mode: 'merge' });
    if (!first.ok) throw new Error(first.message);
    await services.flows.apply(first.plan.preview.batchId, first.plan);
    const other = await services.flows.preview(blobOf(legacyBytes('v4-sample.json')), 'v4.json', { mode: 'merge' });
    if (!other.ok) throw new Error(other.message);
    expect(other.earlierImport).toBeUndefined();
  });

  it('lastImport names the newest import; none before any', async () => {
    const { services } = await booter.boot({ world: newWorld() });
    expect(await services.flows.lastImport()).toBeUndefined();
    const first = await services.flows.preview(v6(), 'v6.json', { mode: 'merge' });
    if (!first.ok) throw new Error(first.message);
    await services.flows.apply(first.plan.preview.batchId, first.plan);
    expect(await services.flows.lastImport()).toMatchObject({ fileName: 'v6.json', format: 'legacy_v6', mode: 'merge', undoable: true });
  });
});
