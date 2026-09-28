/**
 * `replaceAll`, recovery from a revision gap, and the small stores added in step 3.3 (Q1 a, b, e: quarantine rows,
 * import batches, asset-blob IDs; plus editor sessions, uiState and the null marker). Every write here goes
 * through the write queue's ordering (SONNET_HANDOFF §18.8).
 */
import { describe, expect, it } from 'vitest';
import type { EditorSession } from '@/core/commands/contracts';
import type { AnyRecord, CanonicalState } from '@/core/schema';
import type { QuarantineRow } from '@/persistence/contracts';
import { freshAdapter, loadState, savedDatabase, seedChangeSet, type TestAdapter } from '@/test-support/persistence-kit';
import { commit, loadFixtureState, must, remove } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const ids = Object.keys(base.records.species).sort();
const [first, second] = ids as [string, string];

const edited = (state: CanonicalState, revision: number, note: string) =>
  commit(state, revision, (tables) => {
    tables.species[first] = { ...must(state.records.species[first]), notes: note } as AnyRecord;
  });

async function seeded(options: Parameters<typeof freshAdapter>[0] = {}): Promise<TestAdapter> {
  const t = freshAdapter({ initialRevision: 0, ...options });
  await t.adapter.writeChanges(seedChangeSet(base, 1), base);
  return t;
}

describe('replaceAll: one transaction over records + meta, in the queue’s order', () => {
  it('replaces every record and the meta, removes rows the state does not have, and leaves blobs and snapshots alone', async () => {
    const t = await seeded();
    const assetId = Object.keys(base.records.asset)[0] as string;
    await t.db.assetBlobs.put({ assetId, sha256: must(base.records.asset[assetId]).sha256, blob: new Blob(['keep me']) });
    const snapshot = await t.adapter.createSnapshot('manual', base, 1);
    const next = commit(base, 9, (tables) => {
      remove(tables, 'species', second);
      tables.species[first] = { ...must(base.records.species[first]), notes: 'rewritten' } as AnyRecord;
    }).after;
    const state = { ...next, meta: { ...next.meta, title: 'Replaced' } };
    const before = t.log.writes().length;

    await t.adapter.replaceAll(state, 9);

    expect(t.log.writes().slice(before)).toEqual([{ stores: ['records', 'meta'], mode: 'readwrite' }]);
    const stored = await loadState(t.adapter);
    expect(stored.state).toEqual(state);
    expect(stored).toMatchObject({ revision: 9, schemaVersion: 1 });
    expect(await t.db.records.get(second)).toBeUndefined();
    expect(await (await t.adapter.getAssetBlob(assetId))?.text()).toBe('keep me');
    expect((await t.adapter.listSnapshots()).map((s) => s.id)).toEqual([snapshot.id]);
  });

  it('runs after the ChangeSets pending when it was called, then the queue continues from its revision', async () => {
    const t = await seeded();
    const one = edited(base, 2, 'pending');
    const mark = t.mutations.length;
    const write = t.adapter.writeChanges(one.changes, one.after);
    const all = t.adapter.replaceAll(one.after, 2);
    await Promise.all([write, all]);
    const records = t.mutations.slice(mark).filter((m) => m.store === 'records').map((m) => m.type);
    expect(records.indexOf('put')).toBeLessThan(records.indexOf('deleteRange'));
    expect(t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 2, pendingRevisions: 0 });
    const two = edited(one.after, 3, 'after replaceAll');
    await t.adapter.writeChanges(two.changes, two.after);
    expect(t.adapter.getStatus()).toMatchObject({ state: 'saved', lastSavedRevision: 3 });
    expect((await loadState(t.adapter)).state).toEqual(two.after);
  });

  it('refuses a state older than a ChangeSet that is waiting to be written, and writes nothing', async () => {
    const t = await seeded({ retryDelaysMs: [] });
    t.faults.fail('records', () => new Error('down'));
    const two = edited(base, 2, 'a');
    await t.adapter.writeChanges(two.changes, two.after);
    expect(t.adapter.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1 });
    t.faults.clear();
    await expect(t.adapter.replaceAll(base, 1)).rejects.toThrow(/revision 2 is already waiting/);
    expect((await loadState(t.adapter)).revision).toBe(1);
  });

  it('a failing write rejects, changes neither the rows nor the status', async () => {
    const t = await seeded();
    t.faults.fail('records', () => new Error('disk is gone'));
    await expect(t.adapter.replaceAll(edited(base, 2, 'x').after, 2)).rejects.toThrow('disk is gone');
    t.faults.clear();
    expect(t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 1, pendingRevisions: 0 });
    expect((await loadState(t.adapter)).state).toEqual(base);
  });

  it('is refused on a read-only adapter (INV-28)', async () => {
    const t = freshAdapter({ readOnly: true });
    await expect(t.adapter.replaceAll(base, 1)).rejects.toThrow(/read-only/);
    expect(t.log.writes()).toEqual([]);
  });
});

describe('recovery from a revision gap: "save everything now"', () => {
  it('a refused gap is failed with its own reason; replaceAll of the in-memory state saves it all and the queue goes on', async () => {
    const t = await seeded();
    const at2 = edited(base, 2, 'two');
    const at3 = edited(at2.after, 3, 'three');
    const at4 = edited(at3.after, 4, 'four');
    await t.adapter.writeChanges(at2.changes, at2.after);
    // Revision 3 never reached the queue: revision 4 does not follow 2.
    expect(() => t.adapter.writeChanges(at4.changes, at4.after)).toThrow(/does not follow 2/);
    expect(t.adapter.getStatus()).toMatchObject({ state: 'failed', failureReason: 'revision_gap', lastSavedRevision: 2 });
    expect((await loadState(t.adapter)).state).toEqual(at2.after);

    await t.adapter.replaceAll(at4.after, 4);

    expect(t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 4, pendingRevisions: 0 });
    expect('failureReason' in t.adapter.getStatus()).toBe(false);
    const stored = await loadState(t.adapter);
    expect(stored.state).toEqual(at4.after);
    expect(stored.revision).toBe(4);
    const at5 = edited(at4.after, 5, 'five');
    await t.adapter.writeChanges(at5.changes, at5.after);
    expect((await loadState(t.adapter)).state).toEqual(at5.after);
  });
});

describe('Q1 (a): quarantine rows', () => {
  const row = (id: string, createdAt: string, extra: Partial<QuarantineRow> = {}): QuarantineRow => ({ id, createdAt, source: 'import', raw: { id }, issues: ['bad'], ...extra });

  it('adds rows in the queue’s order, returns only the IDs that were new, keeps existing rows as they are, lists oldest first, deletes', async () => {
    const t = await seeded();
    expect(await t.adapter.addQuarantine([row('qtn_b', '2026-01-02T00:00:00.000Z', { importBatchId: 'imp_1', claimedKind: 'species' }), row('qtn_a', '2026-01-01T00:00:00.000Z')])).toEqual(['qtn_b', 'qtn_a']);
    expect(await t.adapter.addQuarantine([row('qtn_a', '2030-01-01T00:00:00.000Z', { issues: ['changed'] }), row('qtn_c', '2026-01-03T00:00:00.000Z')])).toEqual(['qtn_c']);
    const rows = await t.adapter.listQuarantine();
    expect(rows.map((r) => r.id)).toEqual(['qtn_a', 'qtn_b', 'qtn_c']);
    expect(rows[0]).toMatchObject({ issues: ['bad'], createdAt: '2026-01-01T00:00:00.000Z' });
    expect(rows[1]).toMatchObject({ importBatchId: 'imp_1', claimedKind: 'species' });
    await t.adapter.deleteQuarantine(['qtn_a', 'qtn_unknown']);
    expect((await t.adapter.listQuarantine()).map((r) => r.id)).toEqual(['qtn_b', 'qtn_c']);
  });

  it('a read-only adapter refuses', async () => {
    await expect(freshAdapter({ readOnly: true }).adapter.addQuarantine([row('qtn_a', '2026-01-01T00:00:00.000Z')])).rejects.toThrow(/read-only/);
  });
});

describe('Q1 (b): import batches', () => {
  it('saves an opaque report, lists newest first, and replaces a batch saved under the same ID', async () => {
    const t = await seeded();
    await t.adapter.saveImportBatch({ id: 'imp_1', createdAt: '2026-01-01T00:00:00.000Z', report: { created: { species: 3 }, notes: ['a'] } });
    await t.adapter.saveImportBatch({ id: 'imp_2', createdAt: '2026-01-02T00:00:00.000Z', report: null });
    await t.adapter.saveImportBatch({ id: 'imp_1', createdAt: '2026-01-01T00:00:00.000Z', report: { created: { species: 4 } } });
    expect(await t.adapter.listImportBatches()).toEqual([
      { id: 'imp_2', createdAt: '2026-01-02T00:00:00.000Z', report: null },
      { id: 'imp_1', createdAt: '2026-01-01T00:00:00.000Z', report: { created: { species: 4 } } },
    ]);
  });
});

describe('Q1 (e): asset blob IDs', () => {
  it('lists the IDs of every stored blob, and none when there are none', async () => {
    const t = await seeded();
    expect(await t.adapter.listAssetBlobIds()).toEqual([]);
    for (const id of ['ast_b', 'ast_a']) await t.db.assetBlobs.put({ assetId: id, sha256: 'x', blob: new Blob(['1']) });
    expect([...(await t.adapter.listAssetBlobIds())].sort()).toEqual(['ast_a', 'ast_b']);
  });
});

describe('editor sessions, uiState and markers', () => {
  const session = (id: string, updatedAt: string): EditorSession => ({ id, kind: 'species', target: null, baseRevision: 1, baseRecord: null, draft: { name: id }, past: [], future: [], updatedAt });

  it('editor sessions save, list oldest first, replace by ID and delete', async () => {
    const t = await seeded();
    await t.adapter.saveEditorSession(session('ses_b', '2026-01-02T00:00:00.000Z'));
    await t.adapter.saveEditorSession(session('ses_a', '2026-01-01T00:00:00.000Z'));
    await t.adapter.saveEditorSession({ ...session('ses_b', '2026-01-03T00:00:00.000Z'), draft: { name: 'changed' } });
    expect((await t.adapter.listEditorSessions()).map((s) => [s.id, s.draft])).toEqual([['ses_a', { name: 'ses_a' }], ['ses_b', { name: 'changed' }]]);
    await t.adapter.deleteEditorSession('ses_a');
    expect((await t.adapter.listEditorSessions()).map((s) => s.id)).toEqual(['ses_b']);
  });

  it('uiState sets, gets (undefined when absent) and overwrites, in the queue’s order', async () => {
    const t = await seeded();
    expect(await t.adapter.getUiState('panels')).toBeUndefined();
    const one = edited(base, 2, 'pending');
    const mark = t.mutations.length;
    const write = t.adapter.writeChanges(one.changes, one.after);
    const set = t.adapter.setUiState('panels', { left: 200 });
    await Promise.all([write, set]);
    await t.adapter.setUiState('panels', { left: 300 });
    expect(await t.adapter.getUiState('panels')).toEqual({ left: 300 });
    const stores = t.mutations.slice(mark).map((m) => m.store);
    expect(stores.indexOf('records')).toBeLessThan(stores.indexOf('uiState'));
  });

  it('a read-only adapter refuses editor sessions and uiState writes', async () => {
    const { adapter } = freshAdapter({ readOnly: true });
    await expect(adapter.saveEditorSession(session('ses_a', '2026-01-01T00:00:00.000Z'))).rejects.toThrow(/read-only/);
    await expect(adapter.setUiState('k', 1)).rejects.toThrow(/read-only/);
  });

  it('the clean-shutdown marker takes a time or null (a session that is running)', async () => {
    const t = await savedDatabase(base);
    await t.adapter.setLastCleanShutdownAt(null);
    expect((await t.adapter.readCommitted()).meta.lastCleanShutdownAt).toBeNull();
    await t.adapter.setLastCleanShutdownAt('2026-09-28T10:00:00.000Z');
    expect((await t.adapter.readCommitted()).meta.lastCleanShutdownAt).toBe('2026-09-28T10:00:00.000Z');
  });
});
