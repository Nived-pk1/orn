/**
 * The boot sequence on fake-indexeddb (step 3.3, docs/PERSISTENCE.md §4): fresh and current databases, the writer
 * lock, damaged meta, quarantine (INV-23), asset blobs (AST-002), the crash check, uiState, markers and an
 * unavailable IndexedDB. Migration and newer-schema boots are in persistence-boot-migration.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { coreIndexEngine } from '@/core/indexes/engine';
import type { AnyRecord } from '@/core/schema';
import { validator } from '@/core/validation';
import { createOrnDb } from '@/persistence/db';
import type { OpenResult } from '@/persistence/contracts';
import { IDBKeyRange } from 'fake-indexeddb';
import { commit, loadFixtureState, must } from '@/test-support/state-fixture';
import { freshAdapter, freshDb, reopen, savedDatabase, seedChangeSet, stubLock, type TestAdapter } from '@/test-support/persistence-kit';

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

describe('boot: a fresh database', () => {
  it('opens read-write with no state, marks the session as running, and lets the first ChangeSet through', async () => {
    const t = freshAdapter();
    const { result, writes } = await boot(t);
    expect(result).toMatchObject({ mode: 'read_write', state: null, revision: 0, storedSchemaVersion: null, quarantinedCount: 0 });
    expect(result.readOnlyReason).toBeUndefined();
    expect(writes).toEqual([{ store: 'meta', keys: ['lastCleanShutdownAt'] }]);
    expect((await t.adapter.readCommitted()).meta.lastCleanShutdownAt).toBeNull();
    await t.adapter.writeChanges(seedChangeSet(base, 1), base);
    expect(t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 1, pendingRevisions: 0 });
  });
});

describe('boot: a current database', () => {
  it('loads the saved state and revision, reports what it found, and marks the session running and checked', async () => {
    const t = await savedDatabase(base, {}, 3);
    const { result, writes } = await boot(t);
    expect(result).toMatchObject({ mode: 'read_write', revision: 3, storedSchemaVersion: 1, quarantinedCount: 0 });
    expect(result.state).toEqual(base);
    const report = result.bootReport;
    expect(report).toMatchObject({ migrationSteps: [], crashSuspected: false, editorSessionIds: [], uiState: {}, uiStateReset: [], newlyQuarantined: 0, quarantineTruncated: 0 });
    expect(report?.findings).toEqual(validator.validateAll(base, coreIndexEngine.build(base, 3)));
    expect(writes).toEqual([
      { store: 'meta', keys: ['lastCleanShutdownAt'] },
      { store: 'meta', keys: ['lastIntegrityCheckAt'] },
    ]);
    const { meta } = await t.adapter.readCommitted();
    expect(meta.lastCleanShutdownAt).toBeNull();
    expect(typeof meta.lastIntegrityCheckAt).toBe('string');
  });

  it('the write queue continues from the stored revision: the next ChangeSet lands, a gap is refused', async () => {
    const t = await savedDatabase(base, {}, 3);
    await boot(t);
    expect(t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 3, pendingRevisions: 0 });
    const next = commit(base, 4, (tables) => {
      tables.species[speciesId] = { ...speciesRow, notes: 'after boot' } as AnyRecord;
    });
    await t.adapter.writeChanges(next.changes, next.after);
    expect(t.adapter.getStatus()).toMatchObject({ state: 'saved', lastSavedRevision: 4 });
    const skipped = commit(next.after, 6, (tables) => {
      tables.species[speciesId] = { ...speciesRow, notes: 'skipped a revision' } as AnyRecord;
    });
    expect(() => t.adapter.writeChanges(skipped.changes, skipped.after)).toThrow(/does not follow 4/);
    expect(t.adapter.getStatus()).toMatchObject({ state: 'failed', failureReason: 'revision_gap' });
  });

  it('a database with a meta but no records is an empty dataset, not a fresh one', async () => {
    const t = await savedDatabase({ ...base, records: { ...base.records, species: {} } }, {}, 1);
    await t.db.records.clear();
    const { result } = await boot(t);
    expect(result.state).not.toBeNull();
    expect(Object.keys(result.state?.records.species ?? { x: 1 })).toEqual([]);
  });

  it('open() runs the boot once', async () => {
    const t = await savedDatabase(base);
    const [a, b] = [t.adapter.open(), t.adapter.open()];
    expect(await a).toBe(await b);
  });
});

describe('boot: damaged meta is an integrity failure, read-only, nothing written', () => {
  it.each([
    ['the dataset meta is missing', async (t: TestAdapter) => void (await t.db.meta.delete('datasetMeta'))],
    ['the dataset meta is invalid', async (t: TestAdapter) => void (await t.db.meta.put({ key: 'datasetMeta', value: { title: 5 } }))],
    ['the revision is missing', async (t: TestAdapter) => void (await t.db.meta.delete('revision'))],
    ['the revision is not a non-negative integer', async (t: TestAdapter) => void (await t.db.meta.put({ key: 'revision', value: -2 }))],
  ])('%s', async (_name, damage) => {
    const t = await savedDatabase(base);
    await damage(t);
    const { result, writes } = await boot(t);
    expect(result).toMatchObject({ mode: 'read_only', readOnlyReason: 'integrity_failure', state: null, detail: expect.stringContaining('nothing was changed') });
    expect(writes).toEqual([]);
    expect(t.adapter.getStatus().state).toBe('read_only');
  });
});

describe('INV-23 rows that fail L1 are quarantined with their issues and raw value, never deleted', () => {
  const extra: AnyRecord = { ...speciesRow, id: 'spc_bad-extra', unexpectedField: 1 } as unknown as AnyRecord;
  const unknownKind = { id: 'zzz_unknown', kind: 'mystery', x: 1 };
  const noKind = { id: 'spc_no-kind' };
  const huge = { ...speciesRow, id: 'spc_bad-huge', junk: 'x'.repeat(100_000) };

  async function withCorruptRows(): Promise<TestAdapter> {
    const t = await savedDatabase(base);
    for (const row of [extra, unknownKind, noKind, huge]) await t.db.records.put(row as never);
    return t;
  }

  it('the state has only the valid rows; every bad row has a quarantine row with issues; no row is removed', async () => {
    const t = await withCorruptRows();
    const before = await t.db.records.count();
    const { result } = await boot(t);
    expect(result.state).toEqual(base);
    expect(result.bootReport).toMatchObject({ newlyQuarantined: 4, quarantineTruncated: 1 });
    expect(result.quarantinedCount).toBe(4);
    expect(await t.db.records.count()).toBe(before);

    const rows = await t.adapter.listQuarantine();
    const byKind = new Map(rows.map((r) => [r.claimedKind ?? '(none)', r]));
    expect(rows.every((r) => r.source === 'boot_integrity' && r.issues.length > 0)).toBe(true);
    expect(byKind.get('mystery')).toMatchObject({ raw: unknownKind, issues: [expect.stringContaining('not a record kind')] });
    expect(byKind.get('(none)')).toMatchObject({ raw: noKind });
    const small = rows.find((r) => JSON.stringify(r.raw).includes('unexpectedField'));
    expect(small?.raw).toEqual(JSON.parse(JSON.stringify(extra)));
    expect(small?.issues.join(' ')).toContain('Unknown field');
    expect(small?.rawTruncated).toBeUndefined();
  });

  it('a raw value over the cap is kept as its first 64 Ki characters and the truncation is reported', async () => {
    const t = await withCorruptRows();
    await boot(t);
    const row = (await t.adapter.listQuarantine()).find((r) => r.rawTruncated !== undefined);
    expect(typeof row?.raw).toBe('string');
    expect((row?.raw as string).length).toBe(64 * 1024);
    expect(row?.rawTruncated?.originalChars).toBe(JSON.stringify(huge).length);
    expect(JSON.stringify(huge).startsWith(row?.raw as string)).toBe(true);
  });

  it('the same rows at the next boot are not quarantined twice', async () => {
    const t = await withCorruptRows();
    await boot(t);
    const again = reopen(t);
    const { result } = await boot(again);
    expect(result.bootReport).toMatchObject({ newlyQuarantined: 0, quarantineTruncated: 0 });
    expect(result.quarantinedCount).toBe(4);
    expect(await again.adapter.listQuarantine()).toHaveLength(4);
  });

  it('a read-only tab leaves the bad rows out of its state but writes nothing', async () => {
    const t = await withCorruptRows();
    const held = stubLock('held_elsewhere');
    const follower = reopen(t, { lock: held });
    const { result, writes } = await boot(follower);
    expect(result).toMatchObject({ mode: 'read_only', readOnlyReason: 'other_tab_is_writer', quarantinedCount: 0 });
    expect(result.state).toEqual(base);
    expect(writes).toEqual([]);
  });
});

describe('boot: the writer lock', () => {
  it('not granted: read-only, the state is loaded, nothing is written, and writes are refused (INV-28)', async () => {
    const lock = stubLock('held_elsewhere');
    const t = await savedDatabase(base, { lock });
    const { result, writes } = await boot(t);
    expect(result).toMatchObject({ mode: 'read_only', readOnlyReason: 'other_tab_is_writer', revision: 1 });
    expect(result.state).toEqual(base);
    expect(writes).toEqual([]);
    expect(t.adapter.getStatus().state).toBe('read_only');
    const next = commit(base, 2, (tables) => {
      tables.species[speciesId] = { ...speciesRow, notes: 'x' } as AnyRecord;
    });
    expect(() => t.adapter.writeChanges(next.changes, next.after)).toThrow(/read-only/);
    await expect(t.adapter.setLastCleanShutdownAt('x')).rejects.toThrow(/read-only/);
    expect(lock.calls).toEqual(['acquire']);
  });

  it('a granted lock is released when the adapter closes', async () => {
    const lock = stubLock('acquired');
    const t = await savedDatabase(base, { lock });
    await boot(t);
    await t.adapter.close();
    expect(lock.calls).toEqual(['acquire', 'release']);
  });
});

describe('boot: asset blobs (AST-002)', () => {
  it('reports asset records without bytes, sorted, and not the ones that have them', async () => {
    const ids = Object.keys(base.records.asset).sort();
    expect(ids.length).toBeGreaterThan(0);
    const t = await savedDatabase(base);
    await t.db.assetBlobs.put({ assetId: ids[0] as string, sha256: must(base.records.asset[ids[0] as string]).sha256, blob: new Blob(['x']) });
    const { result } = await boot(t);
    expect(result.bootReport?.assetIdsWithoutBlob).toEqual(ids.slice(1));
    expect(await t.adapter.listAssetBlobIds()).toEqual([ids[0]]);
  });
});

describe('boot: the crash check', () => {
  it('a session that never recorded a clean shutdown is suspected, and its drafts are offered; a clean one is not', async () => {
    const first = await savedDatabase(base);
    await boot(first);
    await first.adapter.saveEditorSession({ id: 'ses_one', kind: 'species', target: null, baseRevision: 1, baseRecord: null, draft: { half: 'done' }, past: [], future: [], updatedAt: '2026-09-28T10:00:00.000Z' });
    await first.adapter.saveEditorSession({ id: 'ses_two', kind: 'reaction', target: null, baseRevision: 1, baseRecord: null, draft: {}, past: [], future: [], updatedAt: '2026-09-28T10:00:01.000Z' });

    const afterCrash = reopen(first);
    const crashed = (await boot(afterCrash)).result;
    expect(crashed.bootReport).toMatchObject({ crashSuspected: true, editorSessionIds: ['ses_one', 'ses_two'] });

    await afterCrash.adapter.setLastCleanShutdownAt('2026-09-28T12:00:00.000Z');
    const afterClean = reopen(afterCrash);
    const clean = (await boot(afterClean)).result;
    expect(clean.bootReport).toMatchObject({ crashSuspected: false, editorSessionIds: [] });
    expect(await afterClean.adapter.listEditorSessions()).toHaveLength(2);
  });

  it('a marker that is neither null nor a time counts as no clean shutdown', async () => {
    const t = await savedDatabase(base);
    await t.db.meta.put({ key: 'lastCleanShutdownAt', value: 42 });
    expect((await boot(t)).result.bootReport?.crashSuspected).toBe(true);
  });
});

describe('boot: uiState is restored tolerantly', () => {
  it('keeps valid entries, resets invalid ones (not JSON, or failing the key’s validator) and says which', async () => {
    const t = await savedDatabase(base, { uiStateValidators: { viewport: (v) => typeof (v as { zoom?: unknown }).zoom === 'number' } });
    await t.db.uiState.bulkPut([
      { key: 'panels', value: { left: 240, open: ['inspector'] } },
      { key: 'viewport', value: { zoom: 'wide' } },
      { key: 'notJson-nan', value: Number.NaN },
      { key: 'notJson-date', value: new Date(0) },
      { key: 'selection', value: null },
    ]);
    const { result } = await boot(t);
    expect(result.bootReport?.uiState).toEqual({ panels: { left: 240, open: ['inspector'] }, selection: null });
    expect(result.bootReport?.uiStateReset).toEqual(['notJson-date', 'notJson-nan', 'viewport']);
    expect((await t.db.uiState.toArray()).map((r) => r.key).sort()).toEqual(['panels', 'selection']);
    expect(await t.adapter.getUiState('panels')).toEqual({ left: 240, open: ['inspector'] });
  });

  it('a validator that throws counts as invalid; a read-only tab reports resets but deletes nothing', async () => {
    const t = await savedDatabase(base, {
      lock: stubLock('held_elsewhere'),
      uiStateValidators: { boom: () => { throw new Error('bad validator'); } },
    });
    await t.db.uiState.put({ key: 'boom', value: 1 });
    const { result, writes } = await boot(t);
    expect(result.bootReport?.uiStateReset).toEqual(['boom']);
    expect(writes).toEqual([]);
    expect(await t.db.uiState.count()).toBe(1);
  });
});

describe('boot: IndexedDB unavailable', () => {
  const failing = (make: () => unknown) => ({ open: () => { throw make(); } }) as never;
  const bootWith = async (factory: unknown) => {
    const t = freshAdapter({}, { ...freshDb(), db: createOrnDb({ indexedDB: factory as never, IDBKeyRange }) });
    return t.adapter.open();
  };

  it('a browser that refuses IndexedDB (private mode, policy) is session-only, with the reason', async () => {
    const result = await bootWith(failing(() => new DOMException('denied', 'SecurityError')));
    expect(result).toMatchObject({ mode: 'unavailable', reason: 'indexeddb_blocked', detail: expect.any(String) });
  });

  it('no IndexedDB at all', async () => {
    expect(await bootWith(undefined)).toMatchObject({ mode: 'unavailable', reason: 'indexeddb_blocked' });
  });

  it('storage out of quota at open', async () => {
    expect(await bootWith(failing(() => new DOMException('full', 'QuotaExceededError')))).toMatchObject({ mode: 'unavailable', reason: 'private_mode_quota' });
  });

  it('anything else is unknown, with the message kept', async () => {
    expect(await bootWith(failing(() => new Error('weird failure')))).toMatchObject({ mode: 'unavailable', reason: 'unknown', detail: expect.stringContaining('weird failure') });
  });
});
