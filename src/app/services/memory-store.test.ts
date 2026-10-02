import { describe, expect, it } from 'vitest';
import { createIdFactory } from '@/core/dataset';
import { mulberry32 } from '@/test-support/command-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import { createMemoryStore, MEMORY_SNAPSHOT_LIMIT } from './memory-store';

const state = loadFixtureState('minimal-valid');
const rig = (revision = 0) => {
  let live = revision;
  const store = createMemoryStore({ ids: createIdFactory({ nowMs: () => 1_790_000_000_000 }, { next: mulberry32(1) }), revision: () => live, generator: { app: 'test', version: '0' } });
  return { store, setRevision: (value: number) => void (live = value) };
};

describe('the session-only memory store', () => {
  it('keeps at most the limit, drops the oldest and reports it once', async () => {
    const { store } = rig();
    const ids: string[] = [];
    for (let i = 0; i < MEMORY_SNAPSHOT_LIMIT + 2; i += 1) ids.push((await store.createSnapshot('manual', state, 0)).id);
    expect(store.takeDropped()).toEqual(ids.slice(0, 2));
    expect(store.takeDropped()).toEqual([]);
    expect((await store.listSnapshots()).map((summary) => summary.id)).toEqual(ids.slice(2).reverse());
    expect(await store.readSnapshotBytes(ids[0] as string)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await store.readSnapshot(ids[4] as string)).toMatchObject({ ok: true });
  });

  it('storeSnapshotBytes refuses bytes of another revision and empty bytes, as the adapter does', async () => {
    const { store, setRevision } = rig(3);
    expect(await store.storeSnapshotBytes({ bytes: new Uint8Array([1]), reason: 'pre_import', revision: 2, schemaVersion: 1 })).toMatchObject({ ok: false, code: 'STALE_REVISION' });
    expect(await store.storeSnapshotBytes({ bytes: new Uint8Array(), reason: 'pre_import', revision: 3, schemaVersion: 1 })).toMatchObject({ ok: false, code: 'BAD_BYTES' });
    const stored = await store.storeSnapshotBytes({ bytes: new Uint8Array([1, 2, 3]), reason: 'pre_import', revision: 3, schemaVersion: 1, note: 'n' });
    expect(stored).toMatchObject({ ok: true, summary: { revision: 3, byteSize: 3, note: 'n' } });
    setRevision(4);
    expect(await store.readSnapshotBytes((stored as { summary: { id: string } }).summary.id)).toMatchObject({ ok: true });
  });

  it('a damaged snapshot reads as CORRUPT; delete of an unknown id is fine', async () => {
    const { store } = rig();
    const stored = await store.storeSnapshotBytes({ bytes: new Uint8Array([9, 9, 9]), reason: 'pre_import', revision: 0, schemaVersion: 1 });
    if (!stored.ok) throw new Error('stored');
    expect(await store.readSnapshot(stored.summary.id)).toMatchObject({ ok: false, code: 'CORRUPT' });
    await store.deleteSnapshot('snp_nothing');
    await store.deleteSnapshot(stored.summary.id);
    expect(await store.listSnapshots()).toEqual([]);
  });

  it('batches and their quarantine rows are bounded together; a repeated quarantine id is kept as it is', async () => {
    const { store } = rig();
    for (let i = 0; i < MEMORY_SNAPSHOT_LIMIT + 1; i += 1) {
      await store.saveImportBatch({ id: `imp_${i}`, createdAt: 't', report: {} });
      await store.addQuarantine([{ id: `q_${i}`, createdAt: 't', source: 'import', importBatchId: `imp_${i}`, raw: {}, issues: [] }]);
    }
    expect(await store.addQuarantine([{ id: 'q_3', createdAt: 't', source: 'import', importBatchId: 'imp_3', raw: {}, issues: [] }])).toEqual([]);
    expect((await store.listImportBatches()).map((row) => row.id)).toEqual(['imp_3', 'imp_2', 'imp_1']);
    expect(store.takeDropped()).toEqual(['imp_0']);
  });
});
