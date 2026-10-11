/**
 * Export (step 5.1c): options and a format in, bytes, counts, missing assets and missing references out. Works in EVERY mode (a
 * follower or a read-only tab exports too; it reads the live state). Two paths, one pipeline: the compute worker
 * (`createComputeExport`, asset bytes read here through `getAssetBlob`) or the Phase 3 builders on this thread. One operation at a
 * time; a cancel returns `CANCELLED` with no bytes.
 */
import type { AssetBytesProvider, ExportBuildResult, ExportOptions } from '@/io';
import { createComputeExport, type ComputeExport, type ReplicaSync } from '@/workers/compute';
import type { ExportFormat } from '@/workers/rpc/contracts';
import type { FlowDeps } from './flow-deps';
import { isRefusal } from './flow-gate';
import { cancelledRefusal, isRoute, routeOf } from './flow-route';
import { loadChunk } from './lazy-chunk';
import type { ExportAnswer, Flows } from './flow-types';

export type ExportService = Pick<Flows, 'export'>;

export function createExportService(deps: FlowDeps): ExportService {
  const { store, gate, ids } = deps;
  /** The bytes of an asset record's own hash; a tab with no storage has none (the export reports them missing). */
  const assetBytes: AssetBytesProvider = async (assetId) => {
    const blob = await deps.adapter?.getAssetBlob(assetId);
    return blob === undefined ? undefined : new Uint8Array(await blob.arrayBuffer());
  };

  let worker: { readonly sync: ReplicaSync; readonly flow: ComputeExport } | undefined;
  const workerFlow = (sync: ReplicaSync): ComputeExport => {
    if (worker?.sync !== sync) worker = { sync, flow: createComputeExport({ sync, store, assetBytes, ids, generator: deps.env.generator }) };
    return worker.flow;
  };

  return {
    async export(options: ExportOptions, format: ExportFormat, flow): Promise<ExportAnswer> {
      if (flow?.signal?.aborted === true) return cancelledRefusal();
      const route = routeOf(deps.replica, flow);
      if (!isRoute(route)) return route;
      const op = gate.begin('export', 'exporting');
      if (isRefusal(op)) return op;
      try {
        const task = {
          ...(flow?.signal === undefined ? {} : { signal: flow.signal }),
          onProgress: (done: number, total?: number, note?: string) => {
            op.progress(done, total);
            flow?.onProgress?.(done, total, note);
          },
        };
        if (route.kind === 'worker') {
          const answer = await workerFlow(route.sync).export({ format, options }, task);
          return answer.ok ? { ok: true, result: answer.result, revision: answer.revision, inProcess: false } : answer;
        }
        const revision = store.getRevision();
        const exportDeps = { exportedAt: ids.now(), generator: deps.env.generator, assetBytes };
        const chunk = await loadChunk(() => import('./export-inprocess'), 'The export code for this thread');
        if (!chunk.ok) return { ok: false, code: 'REJECTED', message: chunk.message };
        const { buildOrnJsonExport, buildOrnPackageExport } = chunk.value;
        const built: ExportBuildResult =
          format === 'orn.json'
            ? await buildOrnJsonExport(store.getState(), options, exportDeps, task)
            : await buildOrnPackageExport(store.getState(), options, exportDeps, task);
        if (built.ok) return { ok: true, result: built.result, revision, inProcess: true };
        return built.code === 'CANCELLED' ? cancelledRefusal() : built;
      } finally {
        op.end();
      }
    },
  };
}
