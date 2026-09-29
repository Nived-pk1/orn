/**
 * Import apply against the real persistence adapter (step 3.7): io and persistence meet only through injected ports, wired
 * here the way `src/app` will (Phase 5). Asset bytes reach IndexedDB in the SAME transaction as their records (Q1); "Undo
 * import" is restoring the `pre_import` snapshot (ADV-045 import part); a failed snapshot changes nothing (INV-21).
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { StoreHandle } from '@/core/commands';
import { createIdFactory } from '@/core/dataset';
import { createMigrationRunner } from '@/core/migrations';
import type { AnyRecord, CanonicalState } from '@/core/schema';
import { createImportSession, type AssetStagePort, type ImportPlan, type ImportSession, type ParsedAsset } from '@/io';
import type { AssetBlobWrite } from '@/persistence/contracts';
import { restoreSnapshot } from '@/persistence/restore';
import { attachWriteQueue } from '@/persistence/write-wiring';
import { envelope, makeStore, mulberry32, mustCommit } from '@/test-support/command-kit';
import { exportBytes, parseBytes } from '@/test-support/import-kit';
import { freshAdapter, loadState, quotaError, seedChangeSet, type TestAdapter } from '@/test-support/persistence-kit';
import { loadFixtureState } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7, 7]);
const NEW_ASSET_ID = 'ast_import-real-bytes';

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** `base` plus one asset record whose bytes really hash to its sha256. */
async function stateWithRealAsset(): Promise<CanonicalState> {
  const template = Object.values(base.records.asset)[0] as unknown as Record<string, unknown>;
  const record = { ...template, id: NEW_ASSET_ID, sha256: await sha256(PNG), byteSize: PNG.length, mediaType: 'image/png' } as unknown as AnyRecord;
  return produce(base, (draft) => {
    (draft.records.asset as Record<string, AnyRecord>)[NEW_ASSET_ID] = record;
  });
}

interface Rig {
  readonly t: TestAdapter;
  readonly store: StoreHandle;
  readonly session: ImportSession;
}

/** Store + adapter + write queue + import session, wired through ports; the asset stage feeds the wiring's `blobsFor`. */
async function rig(state: CanonicalState): Promise<Rig> {
  const store = makeStore(state, { revision: 1 });
  const t = freshAdapter({ initialRevision: 0 });
  await t.adapter.writeChanges(seedChangeSet(state, 1), state);
  let staged: readonly ParsedAsset[] = [];
  const assetStage: AssetStagePort = {
    stage: (assets) => {
      staged = assets;
    },
    clear: () => {
      staged = [];
    },
  };
  const wiring = attachWriteQueue(store, t.adapter, {
    blobsFor: (changes) => {
      const touched = new Set([...changes.created, ...changes.updated].map((r) => r.id));
      const blobs: AssetBlobWrite[] = staged.filter((a) => touched.has(a.assetId)).map((a) => ({ assetId: a.assetId, sha256: a.sha256, blob: new Blob([a.bytes as BlobPart]) }));
      return blobs.length === 0 ? undefined : blobs;
    },
  });
  if (!wiring.ok) throw new Error(wiring.message);
  const session = createImportSession({
    store,
    ids: createIdFactory({ nowMs: () => 1_790_000_000_000 }, { next: mulberry32(3) }),
    snapshots: t.adapter,
    batches: t.adapter,
    assetStage,
  });
  return { t, store, session };
}

function planOf(outcome: ReturnType<ImportSession['preview']>): ImportPlan {
  if (!outcome.ok) throw new Error(`${outcome.code}: ${outcome.message}`);
  return outcome.plan;
}

describe('apply through the real adapter', () => {
  it('asset bytes reach IndexedDB in the SAME transaction as their records; the persisted state equals the applied state', async () => {
    const incoming = await stateWithRealAsset();
    const { t, store, session } = await rig(base);
    const parsed = await parseBytes(await exportBytes(incoming, 'json', 'embed', async (id) => (id === NEW_ASSET_ID ? PNG : undefined)));
    expect(parsed.assets.map((a) => a.assetId)).toEqual([NEW_ASSET_ID]);

    const plan = planOf(session.preview({ parsed, fileName: 'with-asset.orn.json' }));
    expect(plan.preview.assets).toMatchObject({ toStore: 1, notStored: 0, overwritten: [] });
    const writesBefore = t.log.writes().length;
    const result = await session.apply(plan.preview.batchId, plan);
    if (!result.ok) throw new Error(result.message);
    await t.adapter.flush();

    expect(new Uint8Array(await (await t.adapter.getAssetBlob(NEW_ASSET_ID) as Blob).arrayBuffer())).toEqual(PNG);
    const importTx = t.log.writes().slice(writesBefore).filter((w) => w.stores.includes('assetBlobs'));
    expect(importTx).toHaveLength(1);
    expect(importTx[0]?.stores).toEqual(expect.arrayContaining(['records', 'meta', 'assetBlobs']));

    const loaded = await loadState(t.adapter);
    expect(loaded.state).toEqual(store.getState());
    expect(loaded.revision).toBe(store.getRevision());
    expect(t.adapter.getStatus().state).toBe('saved');
    // The report and (no) quarantine rows are stored too.
    expect((await t.adapter.listImportBatches()).map((b) => b.id)).toEqual([plan.preview.batchId]);
  });

  it('"Undo import" is restoring the pre_import snapshot: history is cleared, redo is unavailable, and the prior state comes back (ADV-045 import part)', async () => {
    const incoming = await stateWithRealAsset();
    const { t, store, session } = await rig(base);
    mustCommit(store.dispatch(envelope('edit', { type: 'meta.update', meta: { ...store.getState().meta, title: 'Before import' } as never })));
    await t.adapter.flush();
    const beforeState = store.getState();

    const parsed = await parseBytes(await exportBytes(incoming));
    const plan = planOf(session.preview({ parsed, fileName: 'x' }));
    const revisionBefore = store.getRevision();
    const applied = await session.apply(plan.preview.batchId, plan);
    if (!applied.ok) throw new Error(applied.message);
    await t.adapter.flush();
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect(store.undo()).toBeNull();
    expect(store.redo()).toBeNull();
    expect(Object.keys(store.getState().records.asset)).toContain(NEW_ASSET_ID);

    const snapshot = (await t.adapter.listSnapshots()).find((s) => s.id === applied.snapshotId);
    expect(snapshot).toMatchObject({ reason: 'pre_import', revision: revisionBefore });

    const restored = await restoreSnapshot({ id: applied.snapshotId, snapshots: t.adapter, runner: createMigrationRunner(), store });
    if (!restored.ok) throw new Error(restored.message);
    await t.adapter.flush();
    expect(store.getState().records).toEqual(beforeState.records);
    expect(store.getState().meta).toEqual(beforeState.meta);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect((await loadState(t.adapter)).state).toEqual(store.getState());
  });

  it('INV-21: when the pre_import snapshot cannot be stored, nothing changes in memory or on disk', async () => {
    const { t, store, session } = await rig(base);
    const parsed = await parseBytes(await exportBytes(await stateWithRealAsset()));
    const plan = planOf(session.preview({ parsed, fileName: 'x' }));
    t.faults.fail('snapshots', quotaError);
    const revision = store.getRevision();
    const stateBefore = store.getState();
    const result = await session.apply(plan.preview.batchId, plan);
    expect(result).toMatchObject({ ok: false, code: 'SNAPSHOT_FAILED' });
    t.faults.clear();
    await t.adapter.flush();
    expect(store.getRevision()).toBe(revision);
    expect(store.getState()).toBe(stateBefore);
    expect(Object.keys(store.getState().records.asset)).not.toContain(NEW_ASSET_ID);
    expect((await loadState(t.adapter)).state).toEqual(base);
    expect(await t.adapter.listImportBatches()).toEqual([]);
  });

  it('replace_all through the adapter persists the whole replacement (records and meta)', async () => {
    const { t, store, session } = await rig(base);
    const replacement = produce(base, (draft) => {
      (draft.meta as { title: string }).title = 'A restored backup';
      const id = Object.keys(draft.records.species).sort()[0] as string;
      (draft.records.species[id] as unknown as { names: { canonical: string } }).names.canonical = 'Restored name';
    });
    const parsed = await parseBytes(await exportBytes(replacement));
    const plan = planOf(session.preview({ parsed, fileName: 'backup.orn.json', request: { mode: 'replace_all' } }));
    expect(plan.preview.canConfirm).toBe(true);
    const applied = await session.apply(plan.preview.batchId, plan);
    expect(applied.ok).toBe(true);
    await t.adapter.flush();
    expect(store.getState().meta).toEqual(replacement.meta);
    expect(store.getState().records).toEqual(replacement.records);
    expect((await loadState(t.adapter)).state).toEqual(store.getState());
  });
});
