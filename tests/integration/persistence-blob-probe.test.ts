/** The Blob probe at boot (step 5.10a, docs/PERSISTENCE.md §4 step 1): a window that refuses Blobs is session-only; the probe never commits. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeBlobStorage } from '@/persistence/blob-probe';
import { loadFixtureState } from '@/test-support/state-fixture';
import { freshAdapter, savedDatabase, type TestAdapter } from '@/test-support/persistence-kit';

const base = loadFixtureState('maximal-valid');

describe('boot: the Blob probe (step 5.10a)', () => {
  const STORES = ['records', 'meta', 'assetBlobs', 'assetBlobsUnverified', 'snapshots', 'editorSessions', 'derivedCache', 'uiState', 'importBatches', 'quarantine'] as const;
  afterEach(() => vi.restoreAllMocks());
  const counts = async (t: TestAdapter) => {
    const db = t.db as unknown as Record<string, { count(): Promise<number> }>;
    return Object.fromEntries(await Promise.all(STORES.map(async (name) => [name, await (db[name] as { count(): Promise<number> }).count()] as const)));
  };

  it('a window that refuses a Blob in IndexedDB is session-only with its own reason, and nothing was written', async () => {
    const t = freshAdapter();
    // A fake whose Blob put fails: the database opens, and the put of any row holding a Blob is refused.
    vi.spyOn(t.db.snapshots, 'put').mockRejectedValue(new DOMException('Blob refused', 'UnknownError'));
    const result = await t.adapter.open();
    expect(result).toMatchObject({ mode: 'unavailable', reason: 'blob_storage_refused', detail: expect.stringContaining('refused to store a Blob') });
    expect(t.mutations).toEqual([]);
    vi.restoreAllMocks();
    expect(await counts(t)).toEqual(Object.fromEntries(STORES.map((name) => [name, 0])));
  });

  it('the aborted probe leaves every store exactly as it was, on a database that holds data', async () => {
    const t = await savedDatabase(base, {}, 3);
    const before = await counts(t);
    expect(await probeBlobStorage(t.db)).toEqual({ ok: true });
    expect(await counts(t)).toEqual(before);
    expect(await t.db.snapshots.get('__blob_probe__')).toBeUndefined();
    const result = await t.adapter.open();
    expect(result).toMatchObject({ mode: 'read_write', revision: 3 });
  });
});
