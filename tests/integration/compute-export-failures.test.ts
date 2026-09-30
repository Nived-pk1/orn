/**
 * Step 4.2e: the ways an export through the compute worker can fail or be interrupted. Cancel gives CANCELLED and no bytes and
 * changes nothing (store, revision, history, replica); a replica at another revision is REPLICA_STALE as a value, and the flow
 * plans again a bounded number of times; a failed save does not block an export (ADV-040); a worker that is down is REJECTED.
 */
import { describe, expect, it, vi } from 'vitest';
import { RpcHostError } from '@/workers/rpc/helpers';
import { createComputeHandlers } from '@/workers/compute/handlers';
import { MAX_EXPORT_ATTEMPTS } from '@/workers/compute/export-main';
import { withSyntheticAssets } from '@/test-support/asset-kit';
import { EXPORTED_AT, exportRig, inProcessExport } from '@/test-support/compute-export-kit';
import { firstSpeciesId, speciesEditor } from '@/test-support/compute-restore-kit';
import { expectReplicaEqualsStore } from '@/test-support/replica-kit';
import { quotaError } from '@/test-support/persistence-kit';
import { loadFixtureState } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const PKG = { scope: 'full', includeDependencies: false, assets: 'package' } as const;

async function withAssets() {
  return withSyntheticAssets(base, { count: 4, bytesEach: 200 });
}

describe('cancel: CANCELLED, no bytes, nothing changed', () => {
  it('a signal that is already aborted: no call reaches the worker', async () => {
    const rig = await exportRig(base);
    rig.r.calls.length = 0;
    const controller = new AbortController();
    controller.abort();
    expect(await rig.flow.export({ format: 'ornpkg', options: PKG }, { signal: controller.signal })).toEqual({ ok: false, code: 'CANCELLED', message: 'export aborted' });
    expect(rig.r.calls).toEqual([]);
    rig.r.sync.stop();
  });

  it('aborted while main reads the asset bytes: no build call, no bytes', async () => {
    const made = await withAssets();
    const rig = await exportRig(made.state, made.bytes);
    const controller = new AbortController();
    rig.provider = async (id) => {
      controller.abort();
      return made.bytes.get(id);
    };
    rig.r.calls.length = 0;
    const result = await rig.flow.export({ format: 'ornpkg', options: PKG }, { signal: controller.signal });
    expect(result).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(result).not.toHaveProperty('result');
    expect(rig.r.calls.map((c) => c.method)).toEqual(['exportPlan']);
    expect(rig.asked.length).toBe(1);
    rig.r.sync.stop();
  });

  it('aborted while the worker builds: CANCELLED, the store and the replica are as they were, and the next export works', async () => {
    const made = await withAssets();
    const controller = new AbortController();
    const rig = await exportRig(made.state, made.bytes, {
      rig: {
        wrap: (_index, api) => ({
          ...api,
          exportBuild: async (params, ctx) => {
            controller.abort();
            for (let i = 0; i < 5; i += 1) await Promise.resolve();
            return api.exportBuild(params, ctx);
          },
        }),
      },
    });
    const before = { state: rig.store.getState(), revision: rig.store.getRevision(), labels: rig.store.historyLabels() };
    const result = await rig.flow.export({ format: 'ornpkg', options: PKG }, { signal: controller.signal });
    expect(result).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(result).not.toHaveProperty('result');
    await rig.r.sync.settled();
    expect(rig.store.getState()).toBe(before.state);
    expect(rig.store.getRevision()).toBe(before.revision);
    expect(rig.store.historyLabels()).toEqual(before.labels);
    expectReplicaEqualsStore(rig.r.replicas[rig.r.replicas.length - 1] as NonNullable<(typeof rig.r.replicas)[number]>, rig.store, 'replica after a cancelled export');
    expect(rig.r.workers.length).toBe(1);
    expect(await rig.flow.export({ format: 'ornpkg', options: PKG })).toMatchObject({ ok: true });
    rig.r.sync.stop();
  });

  it('the worker side: an aborted signal is the exporter\'s CANCELLED value, with progress reported once per asset (fixture asset and four synthetic ones) and once for the file', async () => {
    const made = await withAssets();
    const { api } = createComputeHandlers();
    await api.loadReplica({ state: made.state, revision: 1 }, { signal: new AbortController().signal, progress: () => undefined });
    const assets = [...made.bytes].map(([assetId, bytes]) => ({ assetId: assetId as never, sha256: (made.state.records.asset[assetId as never] as { sha256: string }).sha256, bytes }));
    const params = { options: PKG, format: 'ornpkg', revision: 1, assets, exportedAt: EXPORTED_AT } as const;

    const progress: [number, number | undefined, string | undefined][] = [];
    const done = await api.exportBuild(params, { signal: new AbortController().signal, progress: (d, t, n) => progress.push([d, t, n]) });
    expect(done.ok).toBe(true);
    expect(progress.map(([d, t]) => [d, t])).toEqual([1, 2, 3, 4, 5, 6].map((d) => [d, 6]));
    expect(progress.map(([, , note]) => note?.split(' ')[0])).toEqual(['asset', 'asset', 'asset', 'asset', 'asset', 'zip']);

    const controller = new AbortController();
    controller.abort();
    expect(await api.exportBuild(params, { signal: controller.signal, progress: () => undefined })).toEqual({ ok: false, code: 'CANCELLED', message: 'export aborted' });
  });
});

describe('REPLICA_STALE', () => {
  it('a plan or a build for a revision the replica is not at is refused as a value with the revision it has', async () => {
    const rig = await exportRig(base);
    const client = rig.r.sync.client;
    const options = { scope: 'full', includeDependencies: false, assets: 'none' } as const;
    expect(await client.exportPlan({ options, format: 'orn.json', revision: 7 })).toEqual({ ok: true, value: { ok: false, code: 'REPLICA_STALE', have: 1 } });
    expect(await client.exportBuild({ options, format: 'orn.json', revision: 0, assets: [], exportedAt: EXPORTED_AT })).toEqual({ ok: true, value: { ok: false, code: 'REPLICA_STALE', have: 1 } });
    rig.r.sync.stop();
  });

  it('before the first load the worker answers NOT_READY (a programmer error, not a value)', async () => {
    const { api } = createComputeHandlers();
    const ctx = { signal: new AbortController().signal, progress: () => undefined };
    await expect(api.exportPlan({ options: PKG, format: 'ornpkg', revision: 1 }, ctx)).rejects.toBeInstanceOf(RpcHostError);
  });

  it('a commit landing between the plan and the build: the flow plans again and exports the newer revision', async () => {
    const made = await withAssets();
    const rig = await exportRig(made.state, made.bytes);
    const edit = speciesEditor(rig.store, firstSpeciesId(made.state));
    let edited = false;
    rig.provider = async (id) => {
      if (!edited) {
        edited = true;
        edit();
      }
      return made.bytes.get(id);
    };
    const result = await rig.flow.export({ format: 'ornpkg', options: PKG });
    if (!result.ok) throw new Error(result.message);
    expect(result.revision).toBe(2);
    const reference = await inProcessExport(rig.store.getState(), 'ornpkg', PKG, async (id) => made.bytes.get(id));
    if (!reference.ok) throw new Error(reference.message);
    expect(result.result.bytes).toEqual(reference.result.bytes);
    expect(rig.r.calls.map((c) => c.method)).toEqual(expect.arrayContaining(['exportPlan', 'exportBuild']));
    rig.r.sync.stop();
  });

  it(`a replica that keeps moving is REJECTED after ${MAX_EXPORT_ATTEMPTS} attempts, with no bytes`, async () => {
    const made = await withAssets();
    const rig = await exportRig(made.state, made.bytes);
    const edit = speciesEditor(rig.store, firstSpeciesId(made.state));
    rig.provider = async (id) => {
      edit();
      return made.bytes.get(id);
    };
    const result = await rig.flow.export({ format: 'ornpkg', options: PKG });
    expect(result).toMatchObject({ ok: false, code: 'REJECTED', message: expect.stringContaining('nothing was exported') });
    expect(result).not.toHaveProperty('result');
    expect(rig.r.calls.filter((c) => c.method === 'exportPlan').length).toBe(MAX_EXPORT_ATTEMPTS);
    rig.r.sync.stop();
  });
});

describe('ADV-040 export works after a failed save (through the worker)', () => {
  it('the save fails on quota, the state stays in memory, and the export still builds it: the file holds the unsaved edit', async () => {
    const rig = await exportRig(base);
    const edit = speciesEditor(rig.store, firstSpeciesId(base));
    rig.t.faults.fail('records', quotaError);
    edit();
    await vi.waitFor(() => expect(rig.t.adapter.getStatus().state).not.toBe('saved'));
    expect(rig.t.adapter.getStatus().lastSavedRevision).toBe(1);
    expect(rig.store.getRevision()).toBe(2);

    const exported = await rig.flow.export({ format: 'orn.json', options: { scope: 'full', includeDependencies: false, assets: 'none' } });
    if (!exported.ok) throw new Error(exported.message);
    expect(exported.revision).toBe(2);
    expect(new TextDecoder().decode(exported.result.bytes)).toContain('edit 1');
    const reference = await inProcessExport(rig.store.getState(), 'orn.json', { scope: 'full', includeDependencies: false, assets: 'none' });
    if (!reference.ok) throw new Error(reference.message);
    expect(exported.result.bytes).toEqual(reference.result.bytes);
    // Still not saved: the export did not need it, and did not change it.
    expect(rig.t.adapter.getStatus().lastSavedRevision).toBe(1);
    rig.r.sync.stop();
  });
});

describe('a worker that is unavailable', () => {
  it('a stopped sync: REJECTED, nothing exported, no asset read', async () => {
    const made = await withAssets();
    const rig = await exportRig(made.state, made.bytes);
    rig.r.sync.stop();
    expect(await rig.flow.export({ format: 'ornpkg', options: PKG })).toMatchObject({ ok: false, code: 'REJECTED', message: expect.stringContaining('nothing was exported') });
    expect(rig.asked).toEqual([]);
  });

  it('a worker that crashes while building: REJECTED (not thrown), the sync restarts it and the next export works', async () => {
    const rig = await exportRig(base, new Map(), {
      rig: {
        wrap: (index, api, worker) =>
          index > 0
            ? api
            : {
                ...api,
                exportBuild: async () => {
                  worker.crash('exit');
                  return new Promise(() => undefined);
                },
              },
      },
    });
    const result = await rig.flow.export({ format: 'orn.json', options: { scope: 'full', includeDependencies: false, assets: 'none' } });
    expect(result).toMatchObject({ ok: false, code: 'REJECTED', message: expect.stringContaining('nothing was exported') });
    await rig.r.sync.settled();
    expect(rig.r.workers.length).toBe(2);
    expect(await rig.flow.export({ format: 'orn.json', options: { scope: 'full', includeDependencies: false, assets: 'none' } })).toMatchObject({ ok: true });
    rig.r.sync.stop();
  });
});
