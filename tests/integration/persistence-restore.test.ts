/**
 * Restoring snapshots into a live store (step 3.2): ADV-045 (snapshot-restore part) and every way a restore can
 * fail without changing anything. The store is wired to the adapter like the app will: each ChangeSet, `replace`
 * ones included, goes through `writeChanges`.
 */
import { CURRENT_SCHEMA_VERSION } from '@/core/schema';
import { strToU8, zlibSync } from 'fflate';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { StoreHandle } from '@/core/commands';
import type { MigratableDocument, MigrationRunner } from '@/core/migrations/contracts';
import { createMigrationRunner } from '@/core/migrations';
import type { CanonicalState } from '@/core/schema';
import type { PersistenceAdapter, SnapshotSummary } from '@/persistence/contracts';
import { restoreSnapshot } from '@/persistence/restore';
import { buildSnapshot } from '@/persistence/snapshot-codec';
import { envelope, makeStore, recordIn, withFields } from '@/test-support/command-kit';
import { freshAdapter, loadState, seedChangeSet, type TestAdapter } from '@/test-support/persistence-kit';
import { loadFixtureState } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const speciesId = Object.keys(base.records.species).sort()[0] as string;
const IDENTITY: MigrationRunner = { target: 1, run: (doc) => ({ ok: true, doc, steps: [] }) };

async function wired(state: CanonicalState = base, readOnly = false): Promise<{ t: TestAdapter; store: StoreHandle }> {
  const store = makeStore(state, { readOnly: () => readOnly });
  const t = freshAdapter();
  await t.adapter.writeChanges(seedChangeSet(state, store.getRevision()), state);
  store.subscribe((changes) => void t.adapter.writeChanges(changes, store.getState()));
  return { t, store };
}

let edits = 0;
function edit(store: StoreHandle): void {
  edits += 1;
  const record = recordIn(store.getState(), 'species', speciesId);
  const result = store.dispatch(envelope(`edit ${edits}`, { type: 'record.update', record: withFields(record, { notes: `edit ${edits}` }) }));
  if (!result.ok) throw new Error(result.error.message);
}

/** Stores hand-made bytes as a snapshot row, the way an older or damaged one would sit in IndexedDB. */
async function putRow(t: TestAdapter, id: string, bytes: Uint8Array, schemaVersion = CURRENT_SCHEMA_VERSION): Promise<void> {
  await t.db.snapshots.put({ id, createdAt: '2026-09-28T09:00:00.000Z', reason: 'manual', revision: 1, schemaVersion, byteSize: bytes.length, blob: new Blob([bytes as Uint8Array<ArrayBuffer>]) });
}
const putDoc = (t: TestAdapter, id: string, doc: unknown, schemaVersion = CURRENT_SCHEMA_VERSION) => putRow(t, id, zlibSync(strToU8(JSON.stringify(doc))), schemaVersion);

/** A snapshot's document as stored, decoded to a plain object a test can damage. */
async function docOf(t: TestAdapter, summary: SnapshotSummary): Promise<MigratableDocument & { meta: Record<string, unknown>; records: Record<string, unknown[]> }> {
  const read = await t.adapter.readSnapshot(summary.id);
  if (!read.ok) throw new Error(read.message);
  return structuredClone(read.doc) as never;
}

interface Untouched {
  readonly state: CanonicalState;
  readonly revision: number;
  readonly labels: ReturnType<StoreHandle['historyLabels']>;
  readonly snapshotIds: readonly string[];
}
async function capture(store: StoreHandle, t: TestAdapter): Promise<Untouched> {
  return { state: store.getState(), revision: store.getRevision(), labels: store.historyLabels(), snapshotIds: (await t.adapter.listSnapshots()).map((s) => s.id) };
}
async function expectUntouched(store: StoreHandle, t: TestAdapter, before: Untouched): Promise<void> {
  expect(store.getState()).toBe(before.state);
  expect(store.getRevision()).toBe(before.revision);
  expect(store.historyLabels()).toEqual(before.labels);
  expect((await t.adapter.listSnapshots()).map((s) => s.id)).toEqual(before.snapshotIds);
  await t.adapter.flush();
  const stored = await loadState(t.adapter);
  expect(stored.state).toEqual(before.state);
  expect(stored.revision).toBe(before.revision);
}

describe('ADV-045 snapshot restore returns the prior state and clears history (snapshot-restore part)', () => {
  it('restores the state of the snapshot, clears undo and redo, and persists the restored state', async () => {
    const { t, store } = await wired();
    edit(store);
    const snapshot = await t.adapter.createSnapshot('manual', store.getState(), store.getRevision());
    const atSnapshot = store.getState();
    edit(store);
    edit(store);
    store.undo();
    expect(store.canUndo() && store.canRedo()).toBe(true);
    const liveBefore = store.getState();
    const revisionBefore = store.getRevision();

    const result = await restoreSnapshot({ id: snapshot.id, snapshots: t.adapter, runner: IDENTITY, store });
    if (!result.ok) throw new Error(result.message);

    expect(store.getState()).toEqual(atSnapshot);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect(result.revision).toBe(store.getRevision());
    expect(result.migrationSteps).toEqual([]);
    expect(result.preRestore).toMatchObject({ reason: 'pre_restore', revision: revisionBefore });

    await t.adapter.flush();
    const stored = await loadState(t.adapter);
    expect(stored.state).toEqual(atSnapshot);
    expect(stored.revision).toBe(store.getRevision());

    // The pre_restore snapshot holds what was live: restoring it undoes the restore.
    const undone = await restoreSnapshot({ id: result.preRestore.id, snapshots: t.adapter, runner: IDENTITY, store });
    expect(undone.ok).toBe(true);
    expect(store.getState()).toEqual(liveBefore);
  });

  it('restoring migrates an older snapshot through the injected runner and reports its steps', async () => {
    const { t, store } = await wired();
    edit(store);
    const source = await t.adapter.createSnapshot('manual', store.getState(), store.getRevision());
    const atSnapshot = store.getState();
    // "Older" shape: the title lives under `name`, which only the fake runner knows how to move back.
    const old = await docOf(t, source);
    const { title, ...rest } = old.meta;
    await putDoc(t, 'snp_old', { ...old, meta: { ...rest, name: title } });
    const seen: unknown[] = [];
    const runner: MigrationRunner = {
      target: 1,
      run(doc) {
        seen.push(doc.meta);
        const meta = doc['meta'] as Record<string, unknown>;
        const { name, ...others } = meta;
        return {
          ok: true,
          doc: { ...doc, meta: { ...others, title: name } },
          steps: [{ from: 0, to: 1, description: 'name → title', changedRecordIds: [], notes: [] }],
        };
      },
    };
    edit(store);
    const result = await restoreSnapshot({ id: 'snp_old', snapshots: t.adapter, runner, store });
    if (!result.ok) throw new Error(result.message);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveProperty('name');
    expect(result.migrationSteps).toEqual([{ from: 0, to: 1, description: 'name → title', changedRecordIds: [], notes: [] }]);
    expect(store.getState()).toEqual(atSnapshot);
  });
});

describe('restore that fails changes nothing and says why', () => {
  it('an unknown snapshot', async () => {
    const { t, store } = await wired();
    edit(store);
    const before = await capture(store, t);
    expect(await restoreSnapshot({ id: 'snp_nothing', snapshots: t.adapter, runner: IDENTITY, store })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    await expectUntouched(store, t, before);
  });

  it('a corrupt snapshot', async () => {
    const { t, store } = await wired();
    edit(store);
    await putRow(t, 'snp_bad', new Uint8Array(64).fill(3));
    const before = await capture(store, t);
    const result = await restoreSnapshot({ id: 'snp_bad', snapshots: t.adapter, runner: IDENTITY, store });
    expect(result).toMatchObject({ ok: false, code: 'CORRUPT', message: expect.stringContaining('snp_bad') });
    await expectUntouched(store, t, before);
  });

  it('a migration that fails (the runner’s error is carried along)', async () => {
    const { t, store } = await wired();
    const source = await t.adapter.createSnapshot('manual', store.getState(), store.getRevision());
    const before = await capture(store, t);
    const failing: MigrationRunner = { target: 1, run: () => ({ ok: false, code: 'STEP_FAILED', message: 'step 0→1 exploded', atVersion: 0 }) };
    const result = await restoreSnapshot({ id: source.id, snapshots: t.adapter, runner: failing, store });
    expect(result).toMatchObject({ ok: false, code: 'MIGRATION_FAILED', message: 'step 0→1 exploded', migration: { code: 'STEP_FAILED' } });
    await expectUntouched(store, t, before);
  });

  it('a snapshot from a newer schema version, through the real runner', async () => {
    const { t, store } = await wired();
    const source = await t.adapter.createSnapshot('manual', store.getState(), store.getRevision());
    await putDoc(t, 'snp_new', { ...(await docOf(t, source)), schemaVersion: CURRENT_SCHEMA_VERSION + 1 }, CURRENT_SCHEMA_VERSION + 1);
    const before = await capture(store, t);
    const result = await restoreSnapshot({ id: 'snp_new', snapshots: t.adapter, runner: createMigrationRunner(), store });
    expect(result).toMatchObject({ ok: false, code: 'MIGRATION_FAILED', migration: { code: 'NEWER_VERSION', atVersion: CURRENT_SCHEMA_VERSION + 1 } });
    await expectUntouched(store, t, before);
  });

  it('an invalid snapshot: a record that fails L1 (issues listed, bounded), and repeated record IDs', async () => {
    const { t, store } = await wired();
    const source = await t.adapter.createSnapshot('manual', store.getState(), store.getRevision());
    const doc = await docOf(t, source);
    const [first] = doc.records['species'] as { id: string }[];
    if (first === undefined) throw new Error('fixture has species');
    first.id = 'not-an-id';
    await putDoc(t, 'snp_l1', doc);
    const twice = await docOf(t, source);
    (twice.records['species'] as unknown[]).push(structuredClone((twice.records['species'] as unknown[])[0]));
    await putDoc(t, 'snp_dup', twice);
    const before = await capture(store, t);

    const l1 = await restoreSnapshot({ id: 'snp_l1', snapshots: t.adapter, runner: IDENTITY, store });
    expect(l1).toMatchObject({ ok: false, code: 'INVALID' });
    expect(!l1.ok && l1.issues?.length).toBeGreaterThan(0);
    expect(!l1.ok && l1.issues?.length).toBeLessThanOrEqual(20);
    const dup = await restoreSnapshot({ id: 'snp_dup', snapshots: t.adapter, runner: IDENTITY, store });
    expect(dup).toMatchObject({ ok: false, code: 'INVALID', issues: [{ path: 'records.species', message: expect.stringContaining('duplicate ID') }] });
    await expectUntouched(store, t, before);
  });

  it('a snapshot the store refuses (a dangling reference, L2): the pre_restore snapshot made for it is removed again', async () => {
    const { t, store } = await wired();
    edit(store);
    const dangling = produce(base, (draft) => {
      (draft.records.species[speciesId] as unknown as { classIds: string[] }).classIds = ['cls_does-not-exist'];
    });
    const built = buildSnapshot({ id: 'snp_dangling', createdAt: '2026-09-28T09:00:00.000Z', reason: 'manual', state: dangling, revision: 1, generator: { app: 't', version: '0' } });
    if (!built.ok) throw new Error('setup: snapshot should serialise');
    await putRow(t, 'snp_dangling', built.built.bytes);
    const before = await capture(store, t);
    const result = await restoreSnapshot({ id: 'snp_dangling', snapshots: t.adapter, runner: IDENTITY, store });
    expect(result).toMatchObject({ ok: false, code: 'REJECTED', error: { code: 'VALIDATION_FAILED' } });
    await expectUntouched(store, t, before);
  });

  it('a read-only tab', async () => {
    const { t, store } = await wired(base, true);
    const source = await t.adapter.createSnapshot('manual', base, 0).catch(() => undefined);
    expect(source).toBeDefined();
    const result = await restoreSnapshot({ id: source?.id ?? '', snapshots: t.adapter, runner: IDENTITY, store });
    expect(result).toMatchObject({ ok: false, code: 'READ_ONLY' });
    expect((await t.adapter.listSnapshots()).map((s) => s.reason)).toEqual(['manual']);
  });

  it('a pre_restore snapshot that cannot be written: nothing is restored', async () => {
    const { t, store } = await wired();
    const source = await t.adapter.createSnapshot('manual', store.getState(), store.getRevision());
    const before = await capture(store, t);
    const snapshots: Pick<PersistenceAdapter, 'createSnapshot' | 'readSnapshot' | 'deleteSnapshot'> = {
      readSnapshot: (id) => t.adapter.readSnapshot(id),
      deleteSnapshot: (id) => t.adapter.deleteSnapshot(id),
      createSnapshot: () => Promise.reject(new Error('quota')),
    };
    const result = await restoreSnapshot({ id: source.id, snapshots, runner: IDENTITY, store });
    expect(result).toMatchObject({ ok: false, code: 'SNAPSHOT_FAILED', message: expect.stringContaining('quota') });
    await expectUntouched(store, t, before);
  });
});

describe('restore while the live data changes under it', () => {
  function racing(t: TestAdapter, store: StoreHandle, changes: number) {
    let left = changes;
    const snapshots: Pick<PersistenceAdapter, 'createSnapshot' | 'readSnapshot' | 'deleteSnapshot'> = {
      readSnapshot: (id) => t.adapter.readSnapshot(id),
      deleteSnapshot: (id) => t.adapter.deleteSnapshot(id),
      async createSnapshot(reason, state, revision, note) {
        const made = await t.adapter.createSnapshot(reason, state, revision, note);
        if (left > 0) {
          left -= 1;
          edit(store);
        }
        return made;
      },
    };
    return snapshots;
  }

  it('takes the pre_restore snapshot again, so it always holds what was live when the restore happened', async () => {
    const { t, store } = await wired();
    const source = await t.adapter.createSnapshot('manual', store.getState(), store.getRevision());
    const result = await restoreSnapshot({ id: source.id, snapshots: racing(t, store, 1), runner: IDENTITY, store });
    if (!result.ok) throw new Error(result.message);
    const reasons = (await t.adapter.listSnapshots()).filter((s) => s.reason === 'pre_restore');
    expect(reasons.map((s) => s.id)).toEqual([result.preRestore.id]);
    expect(result.preRestore.revision).toBe(store.getRevision() - 1);
  });

  it('gives up after three attempts and restores nothing', async () => {
    const { t, store } = await wired();
    const source = await t.adapter.createSnapshot('manual', store.getState(), store.getRevision());
    const revision = store.getRevision();
    const result = await restoreSnapshot({ id: source.id, snapshots: racing(t, store, 3), runner: IDENTITY, store });
    expect(result).toMatchObject({ ok: false, code: 'SNAPSHOT_FAILED', message: expect.stringContaining('kept changing') });
    expect(store.getRevision()).toBe(revision + 3);
    expect((await t.adapter.listSnapshots()).map((s) => s.reason)).toEqual(['manual']);
  });
});
