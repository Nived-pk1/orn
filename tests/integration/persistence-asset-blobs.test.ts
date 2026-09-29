/**
 * Content-addressed asset blobs (step 3.7 review, item b; docs/PERSISTENCE.md §5). `assetBlobs` is keyed by SHA-256: a write
 * verifies the bytes' hash first and adds a row only if none has that hash; nothing is ever overwritten or deleted. The
 * DB version 1 → 2 upgrade re-keys the old rows (verifying each; a row that does not verify is kept aside and reported).
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { AnyRecord, CanonicalState } from '@/core/schema';
import { DB_STORES, DB_VERSION } from '@/persistence/contracts';
import { DB_STORES_V1, DB_VERSION_STEPS, type DbVersionStep } from '@/persistence/db';
import { freshAdapter, freshDb, hashedBlob, loadState, quotaError, seedChangeSet, type TestDb } from '@/test-support/persistence-kit';
import { commit, loadFixtureState, must, remove } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const template = must(Object.values(base.records.asset)[0]) as unknown as Record<string, unknown>;
const TABLES_OF_V1 = Object.keys(DB_STORES_V1).sort();

const assetRecord = (id: string, sha256: string): AnyRecord => ({ ...template, id, sha256 }) as unknown as AnyRecord;

/** `base` without its own asset, plus the given asset records. */
function stateWith(...assets: AnyRecord[]): CanonicalState {
  return produce(base, (draft) => {
    (draft.records as { asset: Record<string, AnyRecord> }).asset = Object.fromEntries(assets.map((record) => [record.id, record]));
  });
}

interface OldRow {
  readonly assetId: string;
  readonly sha256: unknown;
  readonly blob: Blob;
}

/** A database exactly as DB version 1 left it: the frozen v1 stores, asset rows keyed by asset ID, plus every record and the meta. */
async function version1Database(state: CanonicalState, oldRows: readonly OldRow[]): Promise<TestDb> {
  const v1 = freshDb(DB_VERSION_STEPS.slice(0, 1));
  await v1.db.open();
  expect(v1.db.tables.map((t) => t.name).sort()).toEqual(TABLES_OF_V1);
  await v1.db.table('records').bulkPut(Object.values(state.records).flatMap((table) => Object.values(table as Record<string, unknown>)));
  await v1.db.table('meta').bulkPut([
    { key: 'revision', value: 1 },
    { key: 'schemaVersion', value: 1 },
    { key: 'datasetMeta', value: state.meta },
  ]);
  await v1.db.table('assetBlobs').bulkPut([...oldRows]);
  v1.db.close();
  return v1;
}

const upgrade = (old: TestDb): TestDb => freshDb(undefined, old.indexedDB);
const text = (blob: Blob | undefined): Promise<string | undefined> => (blob === undefined ? Promise.resolve(undefined) : blob.text());

describe('DB version 1 → 2: assetBlobs re-keyed by SHA-256', () => {
  it('files each verified row under its hash, stores equal bytes once, and keeps every other row', async () => {
    const [a, b] = [await hashedBlob('bytes A'), await hashedBlob('bytes B')];
    const state = stateWith(assetRecord('ast_a1', a.sha256), assetRecord('ast_a2', a.sha256), assetRecord('ast_b', b.sha256));
    const old = await version1Database(state, [
      { assetId: 'ast_a1', sha256: a.sha256, blob: a.blob },
      { assetId: 'ast_a2', sha256: a.sha256, blob: new Blob(['bytes A']) },
      { assetId: 'ast_b', sha256: b.sha256, blob: b.blob },
    ]);
    const t = upgrade(old);
    await t.db.open();
    expect(t.db.verno).toBe(DB_VERSION);
    expect(t.db.tables.map((table) => table.name).sort()).toEqual(Object.keys(DB_STORES).sort());
    expect(t.db.table('assetBlobs').schema.primKey.name).toBe('sha256');
    const rows = await t.db.assetBlobs.toArray();
    expect(rows.map((row) => row.sha256).sort()).toEqual([a.sha256, b.sha256].sort());
    expect(await text(rows.find((row) => row.sha256 === a.sha256)?.blob)).toBe('bytes A');
    expect(await text(rows.find((row) => row.sha256 === b.sha256)?.blob)).toBe('bytes B');
    expect(await t.db.assetBlobsUnverified.count()).toBe(0);
    expect(await t.db.records.count()).toBe(Object.values(state.records).reduce((n, table) => n + Object.keys(table).length, 0));
    expect((await t.db.meta.get('revision'))?.value).toBe(1);
  });

  it('keeps a row whose bytes do not match its recorded hash, whole, in assetBlobsUnverified: reported, never dropped, never served', async () => {
    const real = await hashedBlob('the real bytes');
    const state = stateWith(assetRecord('ast_good', real.sha256), assetRecord('ast_liar', real.sha256));
    // Two rows claim the same hash: only one of them really has it. The other must not be lost to the key collision.
    const old = await version1Database(state, [
      { assetId: 'ast_liar', sha256: real.sha256, blob: new Blob(['NOT the real bytes']) },
      { assetId: 'ast_good', sha256: real.sha256, blob: real.blob },
      { assetId: 'ast_short', sha256: 'x', blob: new Blob(['malformed hash']) },
    ]);
    const t = upgrade(old);
    await t.db.open();
    const stored = await t.db.assetBlobs.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.sha256).toBe(real.sha256);
    expect(await text(stored[0]?.blob)).toBe('the real bytes');
    const parked = await t.db.assetBlobsUnverified.toArray();
    expect(parked.map((row) => row.assetId).sort()).toEqual(['ast_liar', 'ast_short']);
    const liar = parked.find((row) => row.assetId === 'ast_liar');
    expect(liar).toMatchObject({ recordedSha256: real.sha256 });
    expect(liar?.actualSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(liar?.actualSha256).not.toBe(real.sha256);
    expect(await text(liar?.blob)).toBe('NOT the real bytes');
    expect(await text(parked.find((row) => row.assetId === 'ast_short')?.blob)).toBe('malformed hash');
  });

  it('boot reports the parked rows and the asset records that have no verified bytes (AST-002)', async () => {
    const real = await hashedBlob('good');
    const state = stateWith(assetRecord('ast_good', real.sha256), assetRecord('ast_bad', 'f'.repeat(64)));
    const old = await version1Database(state, [
      { assetId: 'ast_good', sha256: real.sha256, blob: real.blob },
      { assetId: 'ast_bad', sha256: 'f'.repeat(64), blob: new Blob(['does not hash to f…f']) },
    ]);
    const t = freshAdapter({}, upgrade(old));
    const opened = await t.adapter.open();
    if (opened.mode !== 'read_write') throw new Error(`boot did not open read-write: ${JSON.stringify(opened)}`);
    expect(opened.bootReport?.assetIdsWithoutBlob).toEqual(['ast_bad']);
    expect(opened.bootReport?.unverifiedAssetBlobs).toEqual([
      { assetId: 'ast_bad', recordedSha256: 'f'.repeat(64), actualSha256: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown as string, byteSize: 'does not hash to f…f'.length + 2 },
    ]);
    expect(await text(await t.adapter.getAssetBlob('ast_good'))).toBe('good');
    expect(await t.adapter.getAssetBlob('ast_bad')).toBeUndefined();
  });

  it('a version-1 database with no asset rows, and a brand-new database, open at version 2 with nothing parked', async () => {
    const empty = upgrade(await version1Database(base, []));
    await empty.db.open();
    expect(empty.db.verno).toBe(DB_VERSION);
    expect(await empty.db.assetBlobs.count()).toBe(0);
    const fresh = freshDb();
    await fresh.db.open();
    expect(fresh.db.verno).toBe(DB_VERSION);
    expect(fresh.db.tables.map((table) => table.name).sort()).toEqual(Object.keys(DB_STORES).sort());
  });

  it('is atomic: an upgrade that fails later changes nothing, and the next open upgrades the untouched v1 rows', async () => {
    const a = await hashedBlob('kept through a failed upgrade');
    const old = await version1Database(stateWith(assetRecord('ast_a', a.sha256)), [{ assetId: 'ast_a', sha256: a.sha256, blob: a.blob }]);
    const failing: DbVersionStep = {
      version: DB_VERSION + 1,
      stores: { ...DB_STORES, scratch: 'id' },
      upgrade: () => {
        throw new Error('a later step broke');
      },
    };
    const broken = freshDb([...DB_VERSION_STEPS, failing], old.indexedDB);
    await expect(broken.db.open()).rejects.toThrow(/later step broke/);
    broken.db.close();
    const layout = freshDb(DB_VERSION_STEPS.slice(0, 1), old.indexedDB);
    await layout.db.open();
    expect((await layout.db.table('assetBlobs').get('ast_a')) as OldRow | undefined).toMatchObject({ assetId: 'ast_a', sha256: a.sha256 });
    layout.db.close();
    const t = upgrade(old);
    await t.db.open();
    expect(await text((await t.db.assetBlobs.get(a.sha256))?.blob)).toBe('kept through a failed upgrade');
  });
});

describe('content-addressed writes', () => {
  const hashed = { a: hashedBlob('first bytes'), b: hashedBlob('second bytes') };

  async function seededWithoutAsset(assetIds: readonly string[]) {
    const state = stateWith();
    const t = freshAdapter({ initialRevision: 0, retryDelaysMs: [] });
    await t.adapter.writeChanges(seedChangeSet(state, 1), state);
    return { t, state, assetIds };
  }

  it('the same bytes under two asset IDs are stored once (and each record reads them back)', async () => {
    const { sha256, blob } = await hashed.a;
    const { t, state } = await seededWithoutAsset([]);
    const { after, changes } = commit(state, 2, (tables) => {
      (tables.asset as Record<string, unknown>)['ast_one'] = assetRecord('ast_one', sha256);
      (tables.asset as Record<string, unknown>)['ast_two'] = assetRecord('ast_two', sha256);
    });
    await t.adapter.writeChanges(changes, after, [
      { assetId: 'ast_one', sha256, blob },
      { assetId: 'ast_two', sha256, blob: new Blob(['first bytes']) },
    ]);
    expect(t.adapter.getStatus().state).toBe('saved');
    expect(await t.db.assetBlobs.count()).toBe(1);
    expect(await text(await t.adapter.getAssetBlob('ast_one'))).toBe('first bytes');
    expect(await text(await t.adapter.getAssetBlob('ast_two'))).toBe('first bytes');
    // A later write of the same bytes finds the row and adds nothing.
    const mark = t.mutations.length;
    const again = commit(after, 3, (tables) => {
      (tables.asset as Record<string, unknown>)['ast_three'] = assetRecord('ast_three', sha256);
    });
    await t.adapter.writeChanges(again.changes, again.after, [{ assetId: 'ast_three', sha256, blob: new Blob(['first bytes']) }]);
    expect(t.mutations.slice(mark).filter((m) => m.store === 'assetBlobs')).toEqual([]);
    expect(await t.db.assetBlobs.count()).toBe(1);
  });

  it('replacing an asset with different bytes ADDS a row: the old bytes stay under their hash', async () => {
    const [a, b] = [await hashed.a, await hashed.b];
    const { t, state } = await seededWithoutAsset([]);
    const created = commit(state, 2, (tables) => {
      (tables.asset as Record<string, unknown>)['ast_x'] = assetRecord('ast_x', a.sha256);
    });
    await t.adapter.writeChanges(created.changes, created.after, [{ assetId: 'ast_x', sha256: a.sha256, blob: a.blob }]);
    const replaced = commit(created.after, 3, (tables) => {
      (tables.asset as Record<string, unknown>)['ast_x'] = assetRecord('ast_x', b.sha256);
    });
    await t.adapter.writeChanges(replaced.changes, replaced.after, [{ assetId: 'ast_x', sha256: b.sha256, blob: b.blob }]);
    expect(await text(await t.adapter.getAssetBlob('ast_x'))).toBe('second bytes');
    expect(await text((await t.db.assetBlobs.get(a.sha256))?.blob)).toBe('first bytes');
    // Undo is an ordinary commit that puts the OLD record back: its bytes are still there.
    const undone = commit(replaced.after, 4, (tables) => {
      (tables.asset as Record<string, unknown>)['ast_x'] = assetRecord('ast_x', a.sha256);
    }, 'undo');
    await t.adapter.writeChanges(undone.changes, undone.after);
    expect(await text(await t.adapter.getAssetBlob('ast_x'))).toBe('first bytes');
  });

  it('two ChangeSets coalesced into one transaction that give one asset ID different bytes store BOTH', async () => {
    const [a, b] = [await hashed.a, await hashed.b];
    const { t, state } = await seededWithoutAsset([]);
    const first = commit(state, 2, (tables) => {
      (tables.asset as Record<string, unknown>)['ast_y'] = assetRecord('ast_y', a.sha256);
    });
    const second = commit(first.after, 3, (tables) => {
      (tables.asset as Record<string, unknown>)['ast_y'] = assetRecord('ast_y', b.sha256);
    });
    const before = t.log.writes().length;
    await Promise.all([
      t.adapter.writeChanges(first.changes, first.after, [{ assetId: 'ast_y', sha256: a.sha256, blob: a.blob }]),
      t.adapter.writeChanges(second.changes, second.after, [{ assetId: 'ast_y', sha256: b.sha256, blob: b.blob }]),
    ]);
    expect(t.log.writes().length - before).toBe(1);
    expect((await t.db.assetBlobs.toArray()).map((row) => row.sha256).sort()).toEqual([a.sha256, b.sha256].sort());
  });

  it('bytes that do not hash to the recorded SHA-256 are refused: nothing is written, memory-side status says why', async () => {
    const a = await hashed.a;
    const { t, state } = await seededWithoutAsset([]);
    const { after, changes } = commit(state, 2, (tables) => {
      (tables.asset as Record<string, unknown>)['ast_bad'] = assetRecord('ast_bad', a.sha256);
    });
    await t.adapter.writeChanges(changes, after, [{ assetId: 'ast_bad', sha256: a.sha256, blob: new Blob(['some other bytes']) }]);
    expect(t.adapter.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1 });
    expect(t.adapter.getStatus().lastError).toMatch(/hash to [0-9a-f]{64}, not the recorded SHA-256/);
    expect(await t.db.assetBlobs.count()).toBe(0);
    expect((await loadState(t.adapter)).state).toEqual(state);
  });

  it('a failed write leaves the store as it was, and its retry stores the bytes once', async () => {
    const a = await hashed.a;
    const { t, state } = await seededWithoutAsset([]);
    const { after, changes } = commit(state, 2, (tables) => {
      (tables.asset as Record<string, unknown>)['ast_q'] = assetRecord('ast_q', a.sha256);
    });
    t.faults.fail('assetBlobs', quotaError);
    await t.adapter.writeChanges(changes, after, [{ assetId: 'ast_q', sha256: a.sha256, blob: a.blob }]);
    expect(t.adapter.getStatus().state).toBe('failed');
    t.faults.clear();
    await t.adapter.flush();
    expect(t.adapter.getStatus().state).toBe('saved');
    expect(await t.db.assetBlobs.count()).toBe(1);
  });

  it('deleting the asset record never deletes its bytes', async () => {
    const a = await hashed.a;
    const { t, state } = await seededWithoutAsset([]);
    const created = commit(state, 2, (tables) => {
      (tables.asset as Record<string, unknown>)['ast_d'] = assetRecord('ast_d', a.sha256);
    });
    await t.adapter.writeChanges(created.changes, created.after, [{ assetId: 'ast_d', sha256: a.sha256, blob: a.blob }]);
    const deleted = commit(created.after, 3, (tables) => {
      remove(tables, 'asset', 'ast_d');
    });
    await t.adapter.writeChanges(deleted.changes, deleted.after);
    expect(await t.adapter.getAssetBlob('ast_d')).toBeUndefined(); // no record, so nothing to look the bytes up by
    expect(await t.db.assetBlobs.get(a.sha256)).toBeDefined();
  });
});
