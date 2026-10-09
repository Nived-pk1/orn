/**
 * Boot with a database that is not at the current schema version (step 3.3): ADV-041 (disk part), ADV-045
 * (migration part), the migration failure paths and their rollback. An "older" database is a synthetic version 0
 * (test-support `SYNTHETIC_STEPS` through `withVersionOffsetToCurrent`, Q10); the real runner is used wherever the question
 * is which stored versions are refused outright. Real IndexedDB is fake-indexeddb.
 */
import { CURRENT_SCHEMA_VERSION } from '@/core/schema';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { createMigrationRunner } from '@/core/migrations';
import type { MigrationRunner, SchemaMigration } from '@/core/migrations/contracts';
import type { CanonicalState } from '@/core/schema';
import type { OpenResult } from '@/persistence/contracts';
import { writeRawDocument } from '@/persistence/replace';
import { loadState, reopen, savedDatabase, stubLock, type TestAdapter } from '@/test-support/persistence-kit';
import { must, loadFixtureState } from '@/test-support/state-fixture';
import { SYNTHETIC_STEPS, SYNTHETIC_SYSTEM } from '@/test-support/synthetic-migration';
import { withVersionOffsetToCurrent } from '@/test-support/version-offset';

const base = loadFixtureState('minimal-valid');
/** A schema version one past the app's (the newer-version refusals). */
const NEWER = CURRENT_SCHEMA_VERSION + 1;
const speciesId = Object.keys(base.records.species).sort()[0] as string;
const RUNNER = withVersionOffsetToCurrent(SYNTHETIC_STEPS);

/** The state the synthetic steps must produce from `downgrade`d rows. */
const migrated: CanonicalState = produce(base, (draft) => {
  const species = draft.records.species[speciesId] as unknown as { provenance: { legacy?: unknown } };
  species.provenance.legacy = { system: SYNTHETIC_SYSTEM, unmapped: { legacyColor: 'blue' } };
});

/** Rewrites a current database into the made-up version 0 shape (raw rows, bypassing every queue: a test fixture). */
async function downgrade(t: TestAdapter): Promise<void> {
  await t.db.records.put({ ...must(await t.db.records.get(speciesId)), legacyColor: 'blue' } as never);
  const { title, ...rest } = must(await t.db.meta.get('datasetMeta')).value as Record<string, unknown>;
  await t.db.meta.put({ key: 'datasetMeta', value: { ...rest, name: title } as never });
  await t.db.meta.put({ key: 'schemaVersion', value: 0 });
}
const v0Database = async (options: Parameters<typeof savedDatabase>[1] = {}, revision = 4): Promise<TestAdapter> => {
  const t = await savedDatabase(base, {}, revision);
  await downgrade(t);
  return reopen(t, { runner: RUNNER, ...options });
};

const noSnapshotsOrWrites = (t: TestAdapter, mark: number) => {
  expect(t.mutations.slice(mark)).toEqual([]);
};
function opened(result: OpenResult): Exclude<OpenResult, { mode: 'unavailable' }> {
  if (result.mode === 'unavailable') throw new Error(result.detail);
  return result;
}
async function rawSnapshot(t: TestAdapter) {
  const rows = await t.db.snapshots.toArray();
  return rows;
}

describe('ADV-041 newer schema version on disk (disk part): read-only with an explanation, nothing changed', () => {
  it('opens read-only with no state, says why, writes nothing, keeps writes refused, and releases the lock', async () => {
    const lock = stubLock();
    const t = await savedDatabase(base, { lock });
    await t.db.meta.put({ key: 'schemaVersion', value: NEWER });
    const mark = t.mutations.length;
    const result = opened(await t.adapter.open());
    expect(result).toMatchObject({ mode: 'read_only', readOnlyReason: 'newer_schema', state: null, storedSchemaVersion: NEWER, revision: 1 });
    expect(result.detail).toMatch(new RegExp(`newer version.*schema version ${NEWER}.*up to ${CURRENT_SCHEMA_VERSION}.*read-only`));
    noSnapshotsOrWrites(t, mark);
    expect(t.adapter.getStatus().state).toBe('read_only');
    expect(lock.calls).toEqual(['acquire', 'release']);
    expect(await rawSnapshot(t)).toEqual([]);
    expect(((await t.adapter.readCommitted()).meta.schemaVersion)).toBe(NEWER);
  });

  it.each([
    ['0 (below the first version)', 0],
    ['-3', -3],
    ['1.5 (not an integer)', 1.5],
    ['"1" (not a number)', '1'],
  ])('a stored schemaVersion of %s is refused by the real runner: migration_failed, read-only, nothing written, no snapshot', async (_label, value) => {
    const t = await savedDatabase(base);
    await t.db.meta.put({ key: 'schemaVersion', value: value as never });
    const mark = t.mutations.length;
    const result = opened(await t.adapter.open());
    expect(result).toMatchObject({ mode: 'read_only', readOnlyReason: 'migration_failed', state: null, detail: expect.stringContaining('not a positive integer') });
    noSnapshotsOrWrites(t, mark);
    expect(await rawSnapshot(t)).toEqual([]);
    expect(t.adapter.getStatus().state).toBe('read_only');
  });

  it('a missing schemaVersion next to stored records is refused the same way', async () => {
    const t = await savedDatabase(base);
    await t.db.meta.delete('schemaVersion');
    const mark = t.mutations.length;
    expect(opened(await t.adapter.open())).toMatchObject({ readOnlyReason: 'migration_failed', storedSchemaVersion: null });
    noSnapshotsOrWrites(t, mark);
  });

  it('a version-0 database is refused when the runner has no step for it (the real runner, no offset)', async () => {
    const t = await savedDatabase(base);
    await downgrade(t);
    const result = opened(await reopen(t).adapter.open());
    expect(result).toMatchObject({ readOnlyReason: 'migration_failed', storedSchemaVersion: 0 });
  });
});

describe('ADV-045 redo after migration (migration part): the migrated data starts with no history', () => {
  it('pre_migration snapshot, migrate, strict parse, L1–L3, replaceAll: the database ends current and the state is the migrated one', async () => {
    const t = await v0Database();
    const oldRows = await t.db.records.toArray();
    const result = opened(await t.adapter.open());
    expect(result).toMatchObject({ mode: 'read_write', revision: 5, storedSchemaVersion: 0, quarantinedCount: 0 });
    expect(result.state).toEqual(migrated);
    expect(result.bootReport?.migrationSteps).toEqual([expect.objectContaining({ from: 0, to: 1, changedRecordIds: [speciesId] }), expect.objectContaining({ from: 1, to: 2, changedRecordIds: [] })]);
    expect(result.bootReport?.findings.filter((f) => f.severity === 'error')).toEqual([]);

    const stored = await loadState(t.adapter);
    expect(stored.state).toEqual(migrated);
    expect(stored).toMatchObject({ revision: 5, schemaVersion: CURRENT_SCHEMA_VERSION });

    const snapshots = await t.adapter.listSnapshots();
    expect(snapshots).toEqual([expect.objectContaining({ reason: 'pre_migration', schemaVersion: 0, revision: 4 })]);
    const read = await t.adapter.readSnapshot(snapshots[0]?.id ?? '');
    if (!read.ok) throw new Error(read.message);
    expect(read.doc.schemaVersion).toBe(0);
    expect((read.doc.records['species'] as { id: string; legacyColor?: string }[]).find((r) => r.id === speciesId)?.legacyColor).toBe('blue');
    expect(Object.values(read.doc.records).flat()).toHaveLength(oldRows.length);
  });

  const byId = (rows: readonly unknown[]) => [...(rows as { id: string }[])].sort((a, b) => (a.id < b.id ? -1 : 1));

  it('the pre_migration snapshot holds the ORIGINAL stored rows and meta at the OLD schemaVersion, not the migrated document', async () => {
    const t = await v0Database();
    const oldRows = await t.db.records.toArray();
    const oldMeta = must(await t.db.meta.get('datasetMeta')).value;
    opened(await t.adapter.open());
    // the live rows changed (migrated) ...
    expect(byId(await t.db.records.toArray())).not.toEqual(byId(oldRows));
    // ... the snapshot did not
    const read = await t.adapter.readSnapshot((await t.adapter.listSnapshots())[0]?.id ?? '');
    if (!read.ok) throw new Error(read.message);
    expect(read.summary).toMatchObject({ reason: 'pre_migration', schemaVersion: 0, revision: 4 });
    expect(read.doc.schemaVersion).toBe(0);
    expect(byId(Object.values(read.doc.records).flat())).toEqual(byId(oldRows));
    expect(read.doc['meta']).toEqual(oldMeta);
    expect(read.doc['meta']).toHaveProperty('name');
    expect(read.doc['meta']).not.toHaveProperty('title');
  });

  it('rolling back from that snapshot puts back exactly the original rows, schemaVersion, meta and revision', async () => {
    const t = await v0Database();
    const oldRows = await t.db.records.toArray();
    const oldMeta = must(await t.db.meta.get('datasetMeta')).value;
    opened(await t.adapter.open());
    const read = await t.adapter.readSnapshot((await t.adapter.listSnapshots())[0]?.id ?? '');
    if (!read.ok) throw new Error(read.message);
    // the database now holds the migrated data; rolling back must undo all of it
    await writeRawDocument(t.db, read.doc, read.summary.revision);
    expect(byId(await t.db.records.toArray())).toEqual(byId(oldRows));
    expect((await t.db.meta.get('schemaVersion'))?.value).toBe(0);
    expect((await t.db.meta.get('datasetMeta'))?.value).toEqual(oldMeta);
    expect((await t.db.meta.get('revision'))?.value).toBe(4);
  });

  it('a store built from the boot result has no undo and no redo, and the queue continues from the new revision', async () => {
    const t = await v0Database();
    const result = opened(await t.adapter.open());
    const store = createCanonicalStore({ initial: result.state as CanonicalState, revision: result.revision, validateInitial: false });
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect(store.undo()).toBeNull();
    expect(store.redo()).toBeNull();
    expect(t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 5, pendingRevisions: 0 });
    store.subscribe((changes) => void t.adapter.writeChanges(changes, store.getState()));
    const record = { ...must(store.getState().records.species[speciesId]), notes: 'after migration' };
    expect(store.dispatch({ label: 'edit', commands: [{ type: 'record.update', record }] }).ok).toBe(true);
    await t.adapter.flush();
    expect(t.adapter.getStatus()).toMatchObject({ state: 'saved', lastSavedRevision: 6 });
    expect((await loadState(t.adapter)).state).toEqual(store.getState());
  });

  it('booting the migrated database again finds it current: no migration, no second snapshot', async () => {
    const t = await v0Database();
    await t.adapter.open();
    const again = reopen(t, { runner: RUNNER });
    const result = opened(await again.adapter.open());
    expect(result.bootReport?.migrationSteps).toEqual([]);
    expect(result.storedSchemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(await again.adapter.listSnapshots()).toHaveLength(1);
  });

  it('a read-only tab cannot migrate: it opens read-only without data and writes nothing', async () => {
    const t = await v0Database({ lock: stubLock('held_elsewhere') });
    const mark = t.mutations.length;
    const result = opened(await t.adapter.open());
    expect(result).toMatchObject({ mode: 'read_only', readOnlyReason: 'other_tab_is_writer', state: null });
    noSnapshotsOrWrites(t, mark);
  });
});

describe('a migration that fails ends read-only with the stored data exactly as it was, and says why', () => {
  const failingStep = (migrate: SchemaMigration['migrate']): MigrationRunner => withVersionOffsetToCurrent([{ from: 0, to: 1, description: 'failing', migrate }]);

  /** Runs boot against a failing runner and returns what a user needs: the result, the rows before and after. */
  async function failed(runner: MigrationRunner, prepare?: (t: TestAdapter) => void) {
    const t = await v0Database({ runner });
    prepare?.(t);
    const rowsBefore = await t.db.records.toArray();
    const metaBefore = await t.db.meta.toArray();
    const result = opened(await t.adapter.open());
    return { t, result, rowsBefore, metaBefore };
  }
  async function expectPutBack(f: Awaited<ReturnType<typeof failed>>) {
    const byId = (rows: { id: string }[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(byId(await f.t.db.records.toArray() as never)).toEqual(byId(f.rowsBefore as never));
    const meta = Object.fromEntries((await f.t.db.meta.toArray()).map((m) => [m.key, m.value]));
    expect(meta['schemaVersion']).toBe(0);
    expect(meta['datasetMeta']).toEqual(f.metaBefore.find((m) => m.key === 'datasetMeta')?.value);
    expect(meta['revision']).toBe(4);
    expect(f.t.adapter.getStatus().state).toBe('read_only');
  }

  it('a step that throws: migration_failed, the pre_migration snapshot is kept, the rows are put back', async () => {
    const f = await failed(failingStep(() => { throw new Error('the step exploded'); }));
    expect(f.result).toMatchObject({ mode: 'read_only', readOnlyReason: 'migration_failed', state: null, revision: 4, storedSchemaVersion: 0 });
    expect(f.result.detail).toMatch(/the step exploded.*put back from snapshot snp_/);
    expect(await f.t.adapter.listSnapshots()).toEqual([expect.objectContaining({ reason: 'pre_migration' })]);
    await expectPutBack(f);
    // exactly the rows the snapshot holds, which are the original stored rows at the old version
    const read = await f.t.adapter.readSnapshot((await f.t.adapter.listSnapshots())[0]?.id ?? '');
    if (!read.ok) throw new Error(read.message);
    expect(read.doc.schemaVersion).toBe(0);
    const byKey = (rows: readonly unknown[]) => [...(rows as { id: string }[])].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(byKey(Object.values(read.doc.records).flat())).toEqual(byKey(f.rowsBefore));
    expect(byKey(await f.t.db.records.toArray())).toEqual(byKey(Object.values(read.doc.records).flat()));
  });

  it('a migrated document that fails the strict schema', async () => {
    const f = await failed(failingStep((doc) => ({
      doc: { ...doc, schemaVersion: 1, meta: { ...(doc['meta'] as object), title: 5 } },
      report: { from: 0, to: 1, description: 'bad', changedRecordIds: [], notes: [] },
    })));
    expect(f.result).toMatchObject({ readOnlyReason: 'migration_failed', detail: expect.stringContaining('does not pass validation') });
    await expectPutBack(f);
  });

  it('migrated data with an L2 error (a dangling reference) is not accepted', async () => {
    const f = await failed(failingStep((doc) => {
      const good = (SYNTHETIC_STEPS[0] as SchemaMigration).migrate(doc);
      const species = (good.doc.records['species'] as Record<string, unknown>[]).map((s, i) => (i === 0 ? { ...s, classIds: ['cls_does-not-exist'] } : s));
      return { ...good, doc: { ...good.doc, records: { ...good.doc.records, species } } };
    }));
    expect(f.result).toMatchObject({ readOnlyReason: 'migration_failed', detail: expect.stringMatching(/L1–L3 error/) });
    await expectPutBack(f);
  });

  it('writing the migrated data fails once: the snapshot is restored, the rows are as before', async () => {
    const t = await v0Database();
    t.faults.fail('records', () => {
      t.faults.clear();
      return new Error('disk hiccup');
    });
    const rowsBefore = await t.db.records.toArray();
    const result = opened(await t.adapter.open());
    expect(result).toMatchObject({ readOnlyReason: 'migration_failed', detail: expect.stringMatching(/writing the migrated data failed.*disk hiccup.*put back from snapshot/) });
    expect((await t.db.records.toArray()).length).toBe(rowsBefore.length);
    expect((await t.db.meta.get('schemaVersion'))?.value).toBe(0);
    expect(await t.db.records.get(speciesId)).toMatchObject({ legacyColor: 'blue' });
  });

  it('writing fails and so does the restore: both are reported, and the data is still untouched (one atomic transaction)', async () => {
    const t = await v0Database();
    t.faults.fail('records', () => new Error('disk is gone'));
    const rowsBefore = await t.db.records.toArray();
    const result = opened(await t.adapter.open());
    expect(result).toMatchObject({ readOnlyReason: 'migration_failed', detail: expect.stringMatching(/disk is gone.*restoring snapshot snp_.* also failed/) });
    t.faults.clear();
    expect((await t.db.records.toArray()).length).toBe(rowsBefore.length);
    expect((await t.db.meta.get('schemaVersion'))?.value).toBe(0);
  });

  it('a pre_migration snapshot that cannot be written stops the migration before it starts', async () => {
    const t = await v0Database();
    t.faults.fail('snapshots', () => new Error('no room for a snapshot'));
    const mark = t.mutations.length;
    const result = opened(await t.adapter.open());
    expect(result).toMatchObject({ readOnlyReason: 'migration_failed', detail: expect.stringContaining('pre_migration snapshot could not be written') });
    expect(t.mutations.slice(mark).filter((m) => m.store === 'records' || m.store === 'meta')).toEqual([]);
    t.faults.clear();
    expect(await rawSnapshot(t)).toEqual([]);
  });

  it('the injected runner is the judge: one that refuses the stored version outright gives migration_failed with its own message', async () => {
    const f = await failed(createMigrationRunner([], 1));
    expect(f.result).toMatchObject({ readOnlyReason: 'migration_failed', detail: expect.stringContaining('not a positive integer') });
  });
});
