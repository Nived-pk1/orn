/**
 * Step 4.2e over a REAL `worker_threads` thread running the real compute entry (`startComputeHost`) under tsx: an `.ornpkg`
 * export with assets end to end. Main reads the asset bytes from the real adapter (`getAssetBlob`, over fake IndexedDB) and
 * transfers them; the thread builds the zip and transfers it back; the file equals the in-process export byte for byte (INV-19),
 * unzips to the manifest, the dataset and the asset files, and a Blob can wrap it. The in-memory twin is compute-export.test.ts.
 */
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { makeStore } from '@/test-support/command-kit';
import { withSyntheticAssets } from '@/test-support/asset-kit';
import { EXPORTED_AT, inProcessExport } from '@/test-support/compute-export-kit';
import { TEST_GENERATOR } from '@/test-support/compute-rig';
import { freshAdapter, seedChangeSet } from '@/test-support/persistence-kit';
import { spawnComputeWorker } from '@/test-support/rpc-node-port';
import { loadFixtureState } from '@/test-support/state-fixture';
import { createComputeExport } from '@/workers/compute/export-main';
import { createReplicaSync, type ReplicaSync } from '@/workers/compute/sync';

const base = loadFixtureState('maximal-valid');
/** Starting a thread under tsx takes seconds when the whole suite runs in parallel (the default 5 s is too tight). */
const THREAD_TEST_TIMEOUT_MS = 60_000;
const running: ReplicaSync[] = [];
afterEach(() => {
  for (const sync of running.splice(0)) sync.stop();
});

describe('export in a real thread', () => {
  it('an .ornpkg with assets: bytes read from the adapter on main, the zip built in the thread, equal to the in-process export', async () => {
    const made = await withSyntheticAssets(base, { count: 3, bytesEach: 5_000, attachTo: () => ({ kind: 'species', id: Object.keys(base.records.species).sort()[0] as string }) });
    const state = made.state;
    const t = freshAdapter({ initialRevision: 0 });
    const blobs = [...made.bytes].map(([assetId, bytes]) => ({ assetId, sha256: (state.records.asset[assetId as never] as { sha256: string }).sha256, blob: new Blob([bytes as BlobPart]) }));
    await t.adapter.writeChanges(seedChangeSet(state, 1), state, blobs);
    const store = makeStore(state, { revision: 1 });
    const sync = createReplicaSync({ store, factory: () => spawnComputeWorker() });
    running.push(sync);
    await sync.settled();

    const flow = createComputeExport({
      sync,
      store,
      assetBytes: async (assetId) => {
        const blob = await t.adapter.getAssetBlob(assetId);
        return blob === undefined ? undefined : new Uint8Array(await blob.arrayBuffer());
      },
      ids: { now: () => EXPORTED_AT }, generator: TEST_GENERATOR,
    });
    const options = { scope: 'full', includeDependencies: false, assets: 'package' } as const;
    const exported = await flow.export({ format: 'ornpkg', options });
    if (!exported.ok) throw new Error(`${exported.code}: ${exported.message}`);

    // The fixture's own asset has no stored bytes here (its record is not content-addressed to real bytes): reported, not thrown.
    expect(exported.result.missingAssets.map((m) => m.assetId)).toEqual(['ast_max-grignard-scheme']);
    const reference = await inProcessExport(state, 'ornpkg', options, async (assetId) => made.bytes.get(assetId));
    if (!reference.ok) throw new Error(reference.message);
    expect(exported.result.bytes).toEqual(reference.result.bytes);

    const files = unzipSync(exported.result.bytes);
    expect(Object.keys(files).filter((path) => path.startsWith('assets/')).length).toBe(3);
    for (const [assetId, bytes] of made.bytes) {
      const record = state.records.asset[assetId as never] as { sha256: string };
      expect(files[`assets/${record.sha256}.png`]).toEqual(bytes);
    }
    expect(new Blob([exported.result.bytes as BlobPart]).size).toBe(exported.result.bytes.length);
  }, THREAD_TEST_TIMEOUT_MS);

  it('an .orn.json with embedded assets, and a cancel while the thread builds: CANCELLED, then the next export works', async () => {
    const made = await withSyntheticAssets(base, { count: 2, bytesEach: 2_000 });
    const store = makeStore(made.state, { revision: 1 });
    const sync = createReplicaSync({ store, factory: () => spawnComputeWorker() });
    running.push(sync);
    await sync.settled();
    const flow = createComputeExport({ sync, store, assetBytes: async (assetId) => made.bytes.get(assetId), ids: { now: () => EXPORTED_AT }, generator: TEST_GENERATOR });
    const options = { scope: 'full', includeDependencies: false, assets: 'embed' } as const;

    const controller = new AbortController();
    const pending = flow.export({ format: 'orn.json', options }, { signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, code: 'CANCELLED' });

    const exported = await flow.export({ format: 'orn.json', options });
    if (!exported.ok) throw new Error(`${exported.code}: ${exported.message}`);
    const reference = await inProcessExport(made.state, 'orn.json', options, async (assetId) => made.bytes.get(assetId));
    if (!reference.ok) throw new Error(reference.message);
    expect(exported.result.bytes).toEqual(reference.result.bytes);
  }, THREAD_TEST_TIMEOUT_MS);
});
