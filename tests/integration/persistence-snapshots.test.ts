/**
 * Snapshots on fake-indexeddb (step 3.2): create, list, read, delete, retention, ordering in the write queue,
 * damage reported as values, and the quota sequence's stage 2 (ADV-040 snapshot stage).
 */
import { strToU8, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import { DatasetDocumentSchema } from '@/core/schema';
import type { SnapshotReason } from '@/persistence/contracts';
import { freshAdapter, quotaError, seedChangeSet, type TestAdapter } from '@/test-support/persistence-kit';
import { commit, loadFixtureState } from '@/test-support/state-fixture';
import { produce } from 'immer';

const base = loadFixtureState('maximal-valid');
const speciesId = Object.keys(base.records.species).sort()[0] as string;

async function seeded(options: Parameters<typeof freshAdapter>[0] = {}): Promise<TestAdapter> {
  const t = freshAdapter({ initialRevision: 0, ...options });
  await t.adapter.writeChanges(seedChangeSet(base, 1), base);
  return t;
}
const make = (t: TestAdapter, reason: SnapshotReason, note?: string) => t.adapter.createSnapshot(reason, base, 1, note);

/** Replaces a stored snapshot's bytes, keeping its summary (`byteSize` follows unless given). */
async function overwriteBytes(t: TestAdapter, id: string, bytes: Uint8Array, byteSize = bytes.length): Promise<void> {
  const row = await t.db.snapshots.get(id);
  if (row === undefined) throw new Error('no such row');
  await t.db.snapshots.put({ ...row, byteSize, blob: new Blob([bytes as Uint8Array<ArrayBuffer>]) });
}

describe('snapshots: create, list, read, delete', () => {
  it('a snapshot reads back as a document that rebuilds the state it was made from (round trip)', async () => {
    const t = await seeded();
    const summary = await make(t, 'manual', 'my note');
    expect(summary).toMatchObject({ reason: 'manual', revision: 1, schemaVersion: 1, note: 'my note' });
    expect(summary.id).toMatch(/^snp_[0-9a-z]{26}$/);
    const read = await t.adapter.readSnapshot(summary.id);
    if (!read.ok) throw new Error(read.message);
    expect(read.summary).toEqual(summary);
    const back = documentToState(DatasetDocumentSchema.parse(read.doc));
    expect(back.ok && back.state).toEqual(base);
  });

  it('lists newest first with the summary only, and deletes; deleting an unknown ID is not an error', async () => {
    const t = await seeded();
    const a = await make(t, 'manual');
    const b = await make(t, 'pre_import');
    const c = await make(t, 'periodic');
    expect((await t.adapter.listSnapshots()).map((s) => s.id)).toEqual([c.id, b.id, a.id]);
    expect(Object.keys((await t.adapter.listSnapshots())[0] ?? {})).not.toContain('blob');
    await t.adapter.deleteSnapshot(b.id);
    await t.adapter.deleteSnapshot('snp_nothing');
    expect((await t.adapter.listSnapshots()).map((s) => s.id)).toEqual([c.id, a.id]);
  });

  it('an unknown ID reads as NOT_FOUND', async () => {
    const t = await seeded();
    expect(await t.adapter.readSnapshot('snp_nothing')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('each snapshot is one read-write transaction over the snapshots store alone', async () => {
    const t = await seeded();
    const before = t.log.writes().length;
    await make(t, 'periodic');
    const writes = t.log.writes().slice(before);
    expect(writes).toEqual([{ stores: ['snapshots'], mode: 'readwrite' }]);
  });

  it('runs in the write queue’s order: after the ChangeSets pending when it was requested', async () => {
    const t = await seeded();
    const { after, changes } = commit(base, 2, (tables) => {
      tables.species[speciesId] = { ...(base.records.species[speciesId] as object), notes: 'pending' };
    });
    const mark = t.mutations.length;
    const write = t.adapter.writeChanges(changes, after);
    const snapshot = t.adapter.createSnapshot('manual', after, 2);
    await Promise.all([write, snapshot]);
    const stores = t.mutations.slice(mark).map((m) => m.store);
    expect(stores.indexOf('records')).toBeLessThan(stores.indexOf('snapshots'));
  });

  it('a read-only adapter refuses to write a snapshot (INV-28)', async () => {
    const t = freshAdapter({ readOnly: true });
    await expect(t.adapter.createSnapshot('manual', base, 1)).rejects.toThrow(/read-only/);
    await expect(t.adapter.deleteSnapshot('snp_x')).rejects.toThrow(/read-only/);
    expect(await t.adapter.listSnapshots()).toEqual([]);
  });

  it('a state that cannot be serialised is refused, and nothing is stored', async () => {
    const t = await seeded();
    const broken = produce(base, (draft) => {
      (draft.records.species[speciesId] as unknown as { id: string }).id = 'not-an-id';
    });
    await expect(t.adapter.createSnapshot('manual', broken, 1)).rejects.toThrow(/does not serialise/);
    expect(await t.adapter.listSnapshots()).toEqual([]);
  });
});

describe('snapshots: retention', () => {
  it('keeps the newest five periodic snapshots and prunes the older ones in the same transaction, reporting them', async () => {
    const t = await seeded();
    const mandatory = [await make(t, 'pre_import'), await make(t, 'pre_migration'), await make(t, 'pre_restore'), await make(t, 'manual')];
    const periodic: Awaited<ReturnType<typeof make>>[] = [];
    for (let i = 0; i < 7; i += 1) periodic.push(await make(t, 'periodic'));
    const kept = (await t.adapter.listSnapshots()).map((s) => s.id);
    expect(kept.filter((id) => periodic.some((p) => p.id === id))).toEqual(periodic.slice(2).map((p) => p.id).reverse());
    for (const m of mandatory) expect(kept).toContain(m.id);
    expect(t.events.filter((e) => e.type === 'snapshots_pruned')).toEqual([
      { type: 'snapshots_pruned', ids: [periodic[0]?.id] },
      { type: 'snapshots_pruned', ids: [periodic[1]?.id] },
    ]);
  });

  it('a manual or mandatory snapshot never prunes anything, however many periodic ones exist', async () => {
    const t = await seeded();
    for (let i = 0; i < 5; i += 1) await make(t, 'periodic');
    for (const reason of ['manual', 'pre_import', 'pre_migration', 'pre_restore'] as const) await make(t, reason);
    expect((await t.adapter.listSnapshots()).filter((s) => s.reason === 'periodic')).toHaveLength(5);
    expect(t.events.filter((e) => e.type === 'snapshots_pruned')).toEqual([]);
  });
});

describe('snapshots: damage is reported, never thrown', () => {
  it('garbage of the right size, a wrong size, valid zlib that is not JSON, and a lying summary are all CORRUPT', async () => {
    const t = await seeded();
    const good = await make(t, 'manual');
    const size = good.byteSize;

    await overwriteBytes(t, good.id, new Uint8Array(size).fill(7));
    expect(await t.adapter.readSnapshot(good.id)).toMatchObject({ ok: false, code: 'CORRUPT', message: expect.stringContaining('not a readable snapshot') });

    await overwriteBytes(t, good.id, new Uint8Array(size - 3).fill(7), size);
    expect(await t.adapter.readSnapshot(good.id)).toMatchObject({ ok: false, code: 'CORRUPT', message: expect.stringContaining(`${size - 3} bytes but was written with ${size}`) });

    await overwriteBytes(t, good.id, zlibSync(strToU8('not json at all')));
    expect(await t.adapter.readSnapshot(good.id)).toMatchObject({ ok: false, code: 'CORRUPT' });

    const other = await make(t, 'manual');
    const row = await t.db.snapshots.get(other.id);
    await t.db.snapshots.put({ ...(row as NonNullable<typeof row>), schemaVersion: 9 });
    expect(await t.adapter.readSnapshot(other.id)).toMatchObject({ ok: false, code: 'CORRUPT', message: expect.stringContaining('schema version 9') });
  });
});

describe('ADV-040 quota exceeded while saving: the snapshot stage (stage 2)', () => {
  async function fullDisk(t: TestAdapter) {
    t.faults.fail('records', quotaError);
    const { after, changes } = commit(base, 2, (tables) => {
      tables.species[speciesId] = { ...(base.records.species[speciesId] as object), notes: 'needs room' };
    });
    await t.adapter.writeChanges(changes, after);
    return after;
  }

  it('reports the periodic snapshots the user may delete, oldest first; mandatory and manual ones are never offered', async () => {
    const t = await seeded({ retryDelaysMs: [] });
    const p1 = await make(t, 'periodic');
    await make(t, 'manual');
    await make(t, 'pre_import');
    const p2 = await make(t, 'periodic');
    await fullDisk(t);
    expect(t.adapter.getStatus()).toMatchObject({
      state: 'failed',
      pendingRevisions: 1,
      lastError: expect.stringContaining('QuotaExceededError'),
      deletablePeriodicSnapshotIds: [p1.id, p2.id],
    });
  });

  it('deleting them updates the offer, and a flush then saves; with no periodic snapshots nothing is offered', async () => {
    const t = await seeded({ retryDelaysMs: [] });
    const p1 = await make(t, 'periodic');
    const p2 = await make(t, 'periodic');
    const after = await fullDisk(t);
    await t.adapter.deleteSnapshot(p1.id);
    expect(t.adapter.getStatus().deletablePeriodicSnapshotIds).toEqual([p2.id]);
    expect(t.adapter.getStatus().state).toBe('failed');
    await t.adapter.deleteSnapshot(p2.id);
    expect('deletablePeriodicSnapshotIds' in t.adapter.getStatus()).toBe(false);
    t.faults.clear();
    await t.adapter.flush();
    expect(t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 2, pendingRevisions: 0 });
    expect((await t.adapter.readCommitted()).meta.revision).toBe(2);
    expect(after.records.species[speciesId]).toMatchObject({ notes: 'needs room' });
  });
});
