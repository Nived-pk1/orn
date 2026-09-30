/**
 * The persistence adapter's bytes entry point (step 4.2c): `storeSnapshotBytes` stores worker-built snapshot bytes AS THEY ARE
 * and refuses as a value, writing nothing, when their revision is not the adapter's current revision. Bytes built by the
 * compute worker's code read back with `readSnapshot` and restore to the same state.
 */
import { describe, expect, it } from 'vitest';
import { createMigrationRunner } from '@/core/migrations';
import { restoreSnapshot } from '@/persistence/restore';
import { attachWriteQueue } from '@/persistence/write-wiring';
import { envelope, makeStore, mustCommit } from '@/test-support/command-kit';
import { freshAdapter, seedChangeSet } from '@/test-support/persistence-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import { buildSnapshotBytes } from '@/workers/compute/snapshot-build';

const base = loadFixtureState('maximal-valid');
const built = (state = base) => {
  const out = buildSnapshotBytes(state, '2026-09-30T12:00:00.000Z');
  if (!out.ok) throw new Error(out.message);
  return out;
};

async function adapterAt(revision: number) {
  const t = freshAdapter({ initialRevision: 0 });
  await t.adapter.writeChanges(seedChangeSet(base, 1), base);
  const store = makeStore(base, { revision: 1 });
  const wiring = attachWriteQueue(store, t.adapter);
  if (!wiring.ok) throw new Error(wiring.message);
  while (store.getRevision() < revision) {
    mustCommit(store.dispatch(envelope('edit', { type: 'meta.update', meta: { ...store.getState().meta, title: `T${store.getRevision()}` } as never })));
  }
  return { t, store };
}

describe('storeSnapshotBytes', () => {
  it('stores the bytes untouched; the summary is the one listSnapshots shows; readSnapshot and restoreSnapshot bring the state back', async () => {
    const { t, store } = await adapterAt(1);
    const { bytes, schemaVersion } = built();
    const kept = new Uint8Array(bytes);
    const stored = await t.adapter.storeSnapshotBytes({ bytes, reason: 'pre_import', revision: 1, schemaVersion, note: 'before importing x' });
    if (!stored.ok) throw new Error(stored.message);
    expect(stored.summary).toMatchObject({ reason: 'pre_import', revision: 1, schemaVersion, byteSize: kept.length, note: 'before importing x' });
    expect((await t.adapter.listSnapshots()).map((s) => s.id)).toEqual([stored.summary.id]);

    const row = await t.db.snapshots.get(stored.summary.id);
    expect(new Uint8Array(await (row?.blob as Blob).arrayBuffer())).toEqual(kept);
    const read = await t.adapter.readSnapshot(stored.summary.id);
    expect(read.ok).toBe(true);

    mustCommit(store.dispatch(envelope('later', { type: 'meta.update', meta: { ...store.getState().meta, title: 'Later' } as never })));
    const restored = await restoreSnapshot({ id: stored.summary.id, snapshots: t.adapter, runner: createMigrationRunner(), store });
    if (!restored.ok) throw new Error(restored.message);
    expect(store.getState().records).toEqual(base.records);
    expect(store.getState().meta).toEqual(base.meta);
  });

  it('refuses another revision as a value and writes nothing: older, newer, and after the queue moved on', async () => {
    const { t, store } = await adapterAt(3);
    const { bytes, schemaVersion } = built();
    for (const revision of [1, 2, 4, 99]) {
      const stored = await t.adapter.storeSnapshotBytes({ bytes, reason: 'pre_import', revision, schemaVersion });
      expect(stored, `revision ${revision}`).toMatchObject({ ok: false, code: 'STALE_REVISION', current: 3 });
    }
    expect(await t.adapter.listSnapshots()).toEqual([]);
    expect(store.getRevision()).toBe(3);
    // The adapter's revision is the newest one it was given, durable or not.
    mustCommit(store.dispatch(envelope('one more', { type: 'meta.update', meta: { ...store.getState().meta, title: 'More' } as never })));
    expect(await t.adapter.storeSnapshotBytes({ bytes, reason: 'pre_import', revision: 3, schemaVersion })).toMatchObject({ ok: false, code: 'STALE_REVISION', current: 4 });
    expect((await t.adapter.storeSnapshotBytes({ bytes, reason: 'pre_import', revision: 4, schemaVersion })).ok).toBe(true);
  });

  it('bytes that are not a zlib stream are BAD_BYTES; an adapter that does not know its revision refuses too', async () => {
    const { t } = await adapterAt(1);
    const schemaVersion = built().schemaVersion;
    expect(await t.adapter.storeSnapshotBytes({ bytes: new Uint8Array(0), reason: 'pre_import', revision: 1, schemaVersion })).toMatchObject({ ok: false, code: 'BAD_BYTES' });
    expect(await t.adapter.storeSnapshotBytes({ bytes: new TextEncoder().encode('{"not":"zlib at all"}'), reason: 'pre_import', revision: 1, schemaVersion })).toMatchObject({ ok: false, code: 'BAD_BYTES' });
    expect(await t.adapter.listSnapshots()).toEqual([]);
    const blank = freshAdapter();
    expect(await blank.adapter.storeSnapshotBytes({ bytes: built().bytes, reason: 'pre_import', revision: 0, schemaVersion })).toMatchObject({ ok: false, code: 'STALE_REVISION' });
  });

  it('is stored in the write queue\'s order: after the ChangeSets pending when it was called', async () => {
    const { t, store } = await adapterAt(1);
    const { bytes, schemaVersion } = built();
    mustCommit(store.dispatch(envelope('edit', { type: 'meta.update', meta: { ...store.getState().meta, title: 'Pending' } as never })));
    const stored = await t.adapter.storeSnapshotBytes({ bytes, reason: 'pre_import', revision: 2, schemaVersion });
    expect(stored.ok).toBe(true);
    const writes = t.log.writes();
    const stores = writes.map((w) => w.stores);
    const snapshotAt = stores.findIndex((s) => s.includes('snapshots'));
    const recordsAt = stores.map((s, i) => (s.includes('records') ? i : -1)).filter((i) => i >= 0);
    expect(recordsAt.some((i) => i < snapshotAt)).toBe(true);
    expect(recordsAt.filter((i) => i > snapshotAt)).toEqual([]);
  });
});
