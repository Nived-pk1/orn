/**
 * The boot sequence on fake-indexeddb (step 3.3, docs/PERSISTENCE.md §4): fresh and current databases, the writer
 * lock, damaged meta, quarantine (INV-23), asset blobs (AST-002), the crash check, uiState, markers and an
 * unavailable IndexedDB. Migration and newer-schema boots are in persistence-boot-migration.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { coreIndexEngine } from '@/core/indexes/engine';
import { CURRENT_SCHEMA_VERSION, type AnyRecord, type CanonicalState } from '@/core/schema';
import { validator } from '@/core/validation';
import { quarantineIdOf, quarantineRow } from '@/persistence/boot-load';
import { createOrnDb } from '@/persistence/db';
import type { OpenResult } from '@/persistence/contracts';
import { IDBKeyRange } from 'fake-indexeddb';
import { commit, loadFixtureState, must } from '@/test-support/state-fixture';
import { freshAdapter, freshDb, reopen, rowsToState, savedDatabase, seedChangeSet, stubLock, type TestAdapter } from '@/test-support/persistence-kit';

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
    expect(result).toMatchObject({ mode: 'read_write', revision: 3, storedSchemaVersion: CURRENT_SCHEMA_VERSION, quarantinedCount: 0 });
    expect(result.state).toEqual(base);
    const report = result.bootReport;
    expect(report).toMatchObject({ migrationSteps: [], crashSuspected: false, editorSessionIds: [], uiState: {}, uiStateReset: [], newlyQuarantined: 0 });
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

describe('INV-23 rows that fail L1 are MOVED to quarantine whole, with their issues (records always equal the state)', () => {
  const extra: AnyRecord = { ...speciesRow, id: 'spc_bad-extra', unexpectedField: 1 } as unknown as AnyRecord;
  const unknownKind = { id: 'zzz_unknown', kind: 'mystery', x: 1 };
  const noKind = { id: 'spc_no-kind' };
  const huge = { ...speciesRow, id: 'spc_bad-huge', junk: 'x'.repeat(100_000) };
  const badIds = [extra.id, unknownKind.id, noKind.id, huge.id];

  async function withCorruptRows(): Promise<TestAdapter> {
    const t = await savedDatabase(base);
    for (const row of [extra, unknownKind, noKind, huge]) await t.db.records.put(row as never);
    return t;
  }

  it('the state has only the valid rows; every bad row is gone from records and has a quarantine row with issues', async () => {
    const t = await withCorruptRows();
    const validCount = (await t.db.records.count()) - badIds.length;
    const { result } = await boot(t);
    expect(result.state).toEqual(base);
    expect(result.bootReport).toMatchObject({ newlyQuarantined: 4 });
    expect(result.quarantinedCount).toBe(4);
    expect(await t.db.records.count()).toBe(validCount);
    for (const id of badIds) expect(await t.db.records.get(id)).toBeUndefined();
    // records equal the in-memory state exactly
    expect(rowsToState((await t.adapter.readCommitted()).rows, base.meta)).toEqual(base);

    const rows = await t.adapter.listQuarantine();
    const byKind = new Map(rows.map((r) => [r.claimedKind ?? '(none)', r]));
    expect(rows.every((r) => r.source === 'boot_integrity' && r.issues.length > 0)).toBe(true);
    expect(byKind.get('mystery')).toMatchObject({ raw: unknownKind, issues: [expect.stringContaining('not a record kind')] });
    expect(byKind.get('(none)')).toMatchObject({ raw: noKind });
    const small = rows.find((r) => JSON.stringify(r.raw).includes('unexpectedField'));
    expect(small?.raw).toEqual(JSON.parse(JSON.stringify(extra)));
    expect(small?.issues.join(' ')).toContain('Unknown field');
  });

  it('a large raw value is kept WHOLE, never truncated (the row is moved, so this is the only copy)', async () => {
    const t = await withCorruptRows();
    await boot(t);
    const rows = await t.adapter.listQuarantine();
    const row = rows.find((r) => (r.raw as { id?: string }).id === huge.id);
    expect(row?.rawTruncated).toBeUndefined();
    expect(row?.raw).toEqual(JSON.parse(JSON.stringify(huge)));
    expect(JSON.stringify(row?.raw).length).toBeGreaterThan(64 * 1024);
    expect(rows.some((r) => r.rawTruncated !== undefined)).toBe(false);
  });

  it('a value that is not plain JSON (a Date, NaN) is kept exactly as stored and the issues say so', async () => {
    const t = await savedDatabase(base);
    const odd = { ...speciesRow, id: 'spc_odd', when: new Date(0), ratio: Number.NaN };
    await t.db.records.put(odd as never);
    await boot(t);
    const row = (await t.adapter.listQuarantine())[0];
    expect((row?.raw as { when?: unknown }).when).toEqual(new Date(0));
    expect(Number.isNaN((row?.raw as { ratio?: number }).ratio)).toBe(true);
    expect(row?.issues.join(' ')).toContain('not plain JSON');
    expect(await t.db.records.get('spc_odd')).toBeUndefined();
  });

  it('the move is ONE transaction over records and quarantine, run through the queue (runOrdered)', async () => {
    const t = await withCorruptRows();
    const mark = t.log.writes().length;
    await boot(t);
    const moves = t.log.writes().slice(mark).filter((w) => w.stores.includes('quarantine'));
    expect(moves).toHaveLength(1);
    expect([...(moves[0]?.stores ?? [])].sort()).toEqual(['quarantine', 'records']);
    expect(t.mutations.filter((m) => m.store === 'quarantine')).toHaveLength(1);
    expect(t.mutations.filter((m) => m.store === 'records' && m.type === 'delete')).toHaveLength(1);
  });

  it('a failure in the same transaction leaves both stores as they were: a crash between the two is impossible', async () => {
    const t = await withCorruptRows();
    const recordsBefore = await t.db.records.count();
    t.faults.fail('records', () => new Error('disk failure'));
    await expect(t.adapter.open()).rejects.toThrow(/disk failure/);
    t.faults.clear();
    expect(await t.db.records.count()).toBe(recordsBefore);
    expect(await t.db.quarantine.count()).toBe(0);
    // and the next boot completes the move
    const again = reopen(t);
    const { result } = await boot(again);
    expect(result.bootReport).toMatchObject({ newlyQuarantined: 4 });
    expect(await again.db.quarantine.count()).toBe(4);
  });

  it('a reboot does not quarantine again: the rows are gone from records, the quarantine rows are unchanged', async () => {
    const t = await withCorruptRows();
    await boot(t);
    const first = await t.adapter.listQuarantine();
    const again = reopen(t);
    const { result } = await boot(again);
    expect(result.bootReport).toMatchObject({ newlyQuarantined: 0 });
    expect(result.quarantinedCount).toBe(4);
    expect(await again.adapter.listQuarantine()).toEqual(first);
  });

  it('a later replaceAll (or a restore) rewrites records only: quarantine rows survive', async () => {
    const t = await withCorruptRows();
    const { result } = await boot(t);
    const first = await t.adapter.listQuarantine();
    await t.adapter.replaceAll(result.state as CanonicalState, result.revision + 1);
    expect(await t.adapter.listQuarantine()).toEqual(first);
    expect(rowsToState((await t.adapter.readCommitted()).rows, base.meta)).toEqual(base);
  });

  it('a truncated quarantine row left by a copy-style boot is replaced by the full value before its row is removed', async () => {
    const t = await withCorruptRows();
    const old = quarantineRow(huge, ['old copy'], '2026-09-28T09:00:00.000Z');
    const text = JSON.stringify(huge);
    await t.db.quarantine.put({ ...old, raw: text.slice(0, 1000), rawTruncated: { originalChars: text.length } } as never);
    await boot(t);
    const row = (await t.adapter.listQuarantine()).find((r) => r.id === quarantineIdOf(huge.id));
    expect(row?.rawTruncated).toBeUndefined();
    expect(row?.raw).toEqual(JSON.parse(text));
    expect(await t.db.records.get(huge.id)).toBeUndefined();
  });

  it('a different value already quarantined under the same derived ID is kept; the new one gets its own ID', async () => {
    const t = await savedDatabase(base);
    await t.db.records.put(extra as never);
    const earlier = quarantineRow({ ...extra, unexpectedField: 'earlier' }, ['earlier'], '2026-09-28T09:00:00.000Z');
    await t.db.quarantine.put(earlier as never);
    await boot(t);
    const rows = await t.adapter.listQuarantine();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === earlier.id)).toEqual(earlier);
    expect(rows.find((r) => r.id !== earlier.id)?.raw).toEqual(JSON.parse(JSON.stringify(extra)));
    expect(await t.db.records.get(extra.id)).toBeUndefined();
  });

  it('a read-only tab leaves the bad rows out of its state but writes nothing and moves nothing', async () => {
    const t = await withCorruptRows();
    const before = await t.db.records.count();
    const held = stubLock('held_elsewhere');
    const follower = reopen(t, { lock: held });
    const { result, writes } = await boot(follower);
    expect(result).toMatchObject({ mode: 'read_only', readOnlyReason: 'other_tab_is_writer', quarantinedCount: 0 });
    expect(result.state).toEqual(base);
    expect(writes).toEqual([]);
    expect(await follower.db.records.count()).toBe(before);
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
    const firstHash = must(base.records.asset[ids[0] as string]).sha256;
    await t.db.assetBlobs.put({ sha256: firstHash, blob: new Blob(['x']) });
    const { result } = await boot(t);
    expect(result.bootReport?.assetIdsWithoutBlob).toEqual(ids.slice(1));
    expect(await t.adapter.listAssetBlobHashes()).toEqual([firstHash]);
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

describe('boot: uiState of a database with no dataset yet (step 5.2: "Start empty" and the panels outlive a reload)', () => {
  it('a fresh database still restores the uiState rows it holds, resets invalid ones and says which', async () => {
    const t = freshAdapter({ uiStateValidators: { viewport: (v) => typeof (v as { zoom?: unknown }).zoom === 'number' } });
    await t.db.uiState.bulkPut([
      { key: 'panels', value: { inspectorWidth: 448, startEmptyDismissed: true } },
      { key: 'viewport', value: { zoom: 'wide' } },
    ]);
    const { result } = await boot(t);
    expect(result).toMatchObject({ mode: 'read_write', state: null, revision: 0 });
    expect(result.bootReport?.uiState).toEqual({ panels: { inspectorWidth: 448, startEmptyDismissed: true } });
    expect(result.bootReport?.uiStateReset).toEqual(['viewport']);
    expect((await t.db.uiState.toArray()).map((r) => r.key)).toEqual(['panels']);
  });

  it('a read-only tab of an empty database reports the rows and deletes nothing', async () => {
    const t = freshAdapter({ lock: stubLock('held_elsewhere'), uiStateValidators: { boom: () => false } });
    await t.db.uiState.bulkPut([{ key: 'panels', value: { inspectorOpen: false } }, { key: 'boom', value: 1 }]);
    const { result, writes } = await boot(t);
    expect(result.bootReport?.uiState).toEqual({ panels: { inspectorOpen: false } });
    expect(result.bootReport?.uiStateReset).toEqual(['boom']);
    expect(writes).toEqual([]);
    expect(await t.db.uiState.count()).toBe(2);
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
