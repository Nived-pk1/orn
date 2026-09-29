/**
 * Write path of the Dexie adapter on fake-indexeddb (step 3.1): INV-20, ADV-038 (integration part), ADV-040
 * (write-path part), the one-transaction asset write, the meta markers and the DB upgrade scaffold.
 * Real IndexedDB timing and the real-browser halves of ADV-038 belong to Gate E.
 */
import { describe, expect, it } from 'vitest';
import { serializeDocument, stateToDocument } from '@/core/dataset';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { AnyRecord, CanonicalState } from '@/core/schema';
import { freshAdapter, hashedBlob, loadState, quotaError, reopen, seedChangeSet, type TestAdapter } from '@/test-support/persistence-kit';
import { commit, loadFixtureState, must, remove } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const speciesIds = Object.keys(base.records.species).sort();
const asRecord = (state: CanonicalState, id: string): AnyRecord => must(state.records.species[id]);

/** Seeds an empty database with `state` at revision 1 and returns the adapter, ready for revision 2. */
async function seeded(state: CanonicalState = base, options: Parameters<typeof freshAdapter>[0] = {}): Promise<TestAdapter> {
  const t = freshAdapter({ initialRevision: 0, ...options });
  await t.adapter.writeChanges(seedChangeSet(state, 1), state);
  expect(t.adapter.getStatus()).toMatchObject({ state: 'saved', lastSavedRevision: 1 });
  return t;
}

/** A ChangeSet that adds a note to species `id`. */
function annotate(before: CanonicalState, id: string, revision: number, note = `note ${revision}`) {
  return commit(before, revision, (tables) => {
    tables.species[id] = { ...asRecord(before, id), notes: note };
  });
}

describe('INV-20 persistence is atomic: one transaction per write, covering records + meta', () => {
  it('each ChangeSet written on its own is exactly one read-write transaction over records, meta and asset blobs', async () => {
    const t = await seeded();
    const before = t.log.writes().length;
    let state = base;
    for (const [i, id] of speciesIds.slice(0, 3).entries()) {
      const { after, changes } = annotate(state, id, i + 2);
      await t.adapter.writeChanges(changes, after);
      state = after;
    }
    const writes = t.log.writes().slice(before);
    expect(writes).toHaveLength(3);
    for (const w of writes) expect([...w.stores].sort()).toEqual(['assetBlobs', 'meta', 'records']);
  });

  it('ChangeSets committed in the same tick coalesce into one transaction that lands on the newest revision', async () => {
    const t = await seeded();
    const before = t.log.writes().length;
    let state = base;
    const pending: Promise<void>[] = [];
    for (const [i, id] of speciesIds.slice(0, 4).entries()) {
      const { after, changes } = annotate(state, id, i + 2);
      pending.push(t.adapter.writeChanges(changes, after));
      state = after;
    }
    await Promise.all(pending);
    expect(t.log.writes().length - before).toBe(1);
    const loaded = await loadState(t.adapter);
    expect(loaded.state).toEqual(state);
    expect(loaded.revision).toBe(5);
    expect(t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 5, pendingRevisions: 0 });
  });

  it('writes the revision, the schema version and the dataset meta; the meta is rewritten only when it changed', async () => {
    const t = await seeded();
    expect(await loadState(t.adapter)).toMatchObject({ revision: 1, schemaVersion: 1 });
    const metaKeys = () => t.mutations.filter((m) => m.store === 'meta').flatMap((m) => (m.values as { key: string }[]).map((v) => v.key));
    expect(metaKeys()).toEqual(['revision', 'schemaVersion', 'datasetMeta']);

    const edited = annotate(base, speciesIds[0] as string, 2);
    await t.adapter.writeChanges(edited.changes, edited.after);
    expect(metaKeys().slice(3)).toEqual(['revision']);

    const retitled = { ...edited.after, meta: { ...edited.after.meta, title: 'Retitled' } };
    await t.adapter.writeChanges({ revision: 3, label: 'retitle', cause: 'command', created: [], updated: [], deleted: [], patches: [], inversePatches: [] }, retitled);
    expect(metaKeys().slice(4)).toEqual(['revision', 'schemaVersion', 'datasetMeta']);
    expect((await loadState(t.adapter)).state.meta.title).toBe('Retitled');
  });

  it('deleted records are removed from the store', async () => {
    const t = await seeded();
    const id = speciesIds[0] as string;
    const { after, changes } = commit(base, 2, (tables) => {
      remove(tables, 'species', id);
    });
    await t.adapter.writeChanges(changes, after);
    const rows = (await t.adapter.readCommitted()).rows as AnyRecord[];
    expect(rows.some((r) => r.id === id)).toBe(false);
    expect(await loadState(t.adapter).then((l) => l.state)).toEqual(after);
  });

  it('readCommitted reads records and meta in one read transaction (one revision)', async () => {
    const t = await seeded();
    const before = t.log.transactions.length;
    await t.adapter.readCommitted();
    const reads = t.log.transactions.slice(before);
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({ mode: 'readonly' });
    expect([...(reads[0]?.stores ?? [])].sort()).toEqual(['meta', 'records']);
  });
});

const stored = await hashedBlob('PNG bytes');

describe('INV-20 one transaction covers the asset record, its blob and meta', () => {
  const asset = { ...must(Object.values(base.records.asset)[0]), sha256: stored.sha256 };
  const withoutAsset = commit(base, 1, (tables) => {
    remove(tables, 'asset', asset.id);
  }).after;
  const bytes = () => new Blob(['PNG bytes'], { type: asset.mediaType });
  const withRecord = (tables: Parameters<typeof remove>[0], record = asset) => {
    (tables.asset as Record<string, AnyRecord>)[record.id] = record as AnyRecord;
  };

  it('a created asset and its bytes are written together and read back', async () => {
    const t = await seeded(withoutAsset);
    const before = t.log.writes().length;
    const { after, changes } = commit(withoutAsset, 2, (tables) => {
      withRecord(tables);
    });
    await t.adapter.writeChanges(changes, after, [{ assetId: asset.id, sha256: asset.sha256, blob: bytes() }]);
    expect(t.log.writes().length - before).toBe(1);
    const blob = await t.adapter.getAssetBlob(asset.id);
    expect(await blob?.text()).toBe('PNG bytes');
    expect((await loadState(t.adapter)).state).toEqual(after);
  });

  it('deleting the record keeps the blob (undo needs it); undo writes the record back without blobs', async () => {
    const t = await seeded(withoutAsset);
    const created = commit(withoutAsset, 2, (tables) => {
      withRecord(tables);
    });
    await t.adapter.writeChanges(created.changes, created.after, [{ assetId: asset.id, sha256: asset.sha256, blob: bytes() }]);
    const deleted = commit(created.after, 3, (tables) => {
      remove(tables, 'asset', asset.id);
    });
    await t.adapter.writeChanges(deleted.changes, deleted.after);
    // No record, nothing to look the bytes up by; they are still stored under their hash.
    expect(await t.adapter.getAssetBlob(asset.id)).toBeUndefined();
    expect(await t.db.assetBlobs.get(asset.sha256)).toBeDefined();
    const restored = commit(deleted.after, 4, (tables) => {
      withRecord(tables);
    }, 'undo');
    await t.adapter.writeChanges(restored.changes, restored.after);
    expect((await loadState(t.adapter)).state).toEqual(restored.after);
    expect(await (await t.adapter.getAssetBlob(asset.id))?.text()).toBe('PNG bytes');
  });

  it('a failing write stores neither the record nor the blob', async () => {
    const t = await seeded(withoutAsset, { retryDelaysMs: [] });
    const { after, changes } = commit(withoutAsset, 2, (tables) => {
      withRecord(tables);
    });
    t.faults.fail('assetBlobs', () => new Error('blob store broken'));
    await t.adapter.writeChanges(changes, after, [{ assetId: asset.id, sha256: asset.sha256, blob: bytes() }]);
    expect(t.adapter.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1 });
    t.faults.clear();
    expect(await t.adapter.getAssetBlob(asset.id)).toBeUndefined();
    expect((await loadState(t.adapter)).state).toEqual(withoutAsset);
  });

  it('a blob for an asset the ChangeSet did not create is refused before anything is queued', async () => {
    const t = await seeded();
    const { after, changes } = annotate(base, speciesIds[0] as string, 2);
    expect(() => t.adapter.writeChanges(changes, after, [{ assetId: asset.id, sha256: asset.sha256, blob: bytes() }])).toThrow(/no asset record/);
    expect(t.adapter.getStatus()).toMatchObject({ state: 'saved', pendingRevisions: 0 });
  });
});

describe('ADV-038 a write aborted mid-ChangeSet leaves the last committed revision (integration part)', () => {
  /** A state whose ChangeSet writes good rows, a delete, a meta change and one row IndexedDB cannot store. */
  function poisoned(state: CanonicalState, revision: number): { after: CanonicalState; changes: ChangeSet } {
    const [a, b, c, d] = speciesIds as [string, string, string, string];
    return commit(state, revision, (tables) => {
      tables.species[a] = { ...asRecord(state, a), notes: 'good before the bad row' };
      tables.species[b] = { ...asRecord(state, b), notes: 'the bad row', unstorable: () => 'a function cannot be cloned' };
      tables.species[d] = { ...asRecord(state, d), notes: 'good after the bad row' };
      remove(tables, 'species', c);
    });
  }

  it('reopening shows the last committed revision and no partial record', async () => {
    const t = await seeded(base, { retryDelaysMs: [] });
    const { after, changes } = poisoned(base, 2);
    await t.adapter.writeChanges(changes, { ...after, meta: { ...after.meta, title: 'never persisted' } });
    expect(t.adapter.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1, lastSavedRevision: 1, lastError: expect.stringContaining('DataCloneError') });

    const again = reopen(t);
    const loaded = await loadState(again.adapter);
    expect(loaded.revision).toBe(1);
    expect(loaded.state).toEqual(base);
    expect(loaded.state.meta.title).not.toBe('never persisted');
  });

  it('memory stays authoritative: the failed batch is kept pending and lands, whole, with the next ChangeSet', async () => {
    const t = await seeded(base, { retryDelaysMs: [] });
    const { after, changes } = poisoned(base, 2);
    await t.adapter.writeChanges(changes, after);
    expect(t.adapter.getStatus().state).toBe('failed');
    // Revision 3 repairs the bad record; the pending revision 2 is written together with it, so the database
    // never holds a state memory did not have.
    const next = commit(after, 3, (tables) => {
      tables.species[speciesIds[1] as string] = asRecord(base, speciesIds[1] as string);
    });
    await t.adapter.writeChanges(next.changes, next.after);
    expect(t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 3, pendingRevisions: 0 });
    const loaded = await loadState(reopen(t).adapter);
    expect(loaded.state).toEqual(next.after);
    expect(loaded.revision).toBe(3);
  });

  it('a retry that fails again with the same cause still leaves no partial record (backoff delays run on the fake scheduler)', async () => {
    const t = await seeded();
    const { after, changes } = poisoned(base, 2);
    const done = t.adapter.writeChanges(changes, after);
    for (const delay of [250, 1000, 4000]) {
      expect(await t.scheduler.waitForTimer()).toBe(delay);
      t.scheduler.fire();
    }
    await done;
    expect(t.adapter.getStatus().state).toBe('failed');
    expect((await loadState(reopen(t).adapter)).state).toEqual(base);
  });
});

describe('ADV-040 quota exceeded while saving (write-path part)', () => {
  it('evicts the derived cache (least recently used first), retries at once, and the write lands', async () => {
    const t: TestAdapter = freshAdapter({
      initialRevision: 0,
      onEvent: (e) => {
        if (e.type === 'derived_cache_evicted') t.faults.clear();
      },
    });
    await t.adapter.writeChanges(seedChangeSet(base, 1), base);
    for (const key of ['old', 'mid', 'new']) await t.adapter.putDerived({ key, cacheKind: 'depiction', value: key, byteSize: 10 });
    await t.adapter.getDerived('old');
    t.faults.fail('records', quotaError);
    const { after, changes } = annotate(base, speciesIds[0] as string, 2);
    await t.adapter.writeChanges(changes, after);
    expect((await t.db.derivedCache.toArray()).map((r) => r.key)).toEqual(['old']);
    expect(t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 2, pendingRevisions: 0 });
    expect((await loadState(t.adapter)).state).toEqual(after);
    expect(t.scheduler.delays).toEqual([]);
  });

  it('when eviction cannot make room the state is failed with the quota named, memory is kept, and export still works', async () => {
    const t = await seeded(base, { retryDelaysMs: [] });
    await t.adapter.putDerived({ key: 'only', cacheKind: 'layout', value: 1, byteSize: 10 });
    t.faults.fail('records', quotaError);
    const { after, changes } = annotate(base, speciesIds[0] as string, 2, 'kept in memory');
    await t.adapter.writeChanges(changes, after);
    expect(t.adapter.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1, lastSavedRevision: 1, lastError: expect.stringContaining('QuotaExceededError') });
    expect(await t.db.derivedCache.count()).toBe(0);
    expect(asRecord(after, speciesIds[0] as string)).toMatchObject({ notes: 'kept in memory' });
    const exported = serializeDocument(stateToDocument(after, { exportedAt: '2026-01-01T00:00:00.000Z', exportScope: 'full', generator: { app: 'test', version: '0' } }));
    expect(exported.ok).toBe(true);
    t.faults.clear();
    await t.adapter.flush();
    expect(t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 2, pendingRevisions: 0 });
    expect((await loadState(t.adapter)).state).toEqual(after);
  });
});
