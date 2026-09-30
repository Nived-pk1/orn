/**
 * Exporting with the compute worker (step 4.2e, Phase 4 contract decisions Q1 export part). The main-thread side, ports only
 * (a worker directory never imports persistence): settle the replica sync, ask the worker for the plan (the asset IDs the
 * export needs, scope closure applied), read those bytes here through the injected `AssetBytesProvider` (persistence's
 * `getAssetBlob` satisfies it), and send them with the build request. No function crosses the worker boundary; the buffers are
 * transferred (copies, so a buffer the provider keeps is never detached). An asset whose bytes are missing, or whose read
 * fails (its error message travels along), is left out of the request and reported by the worker in `missingAssets` with its
 * reason, never thrown. An export needs only the
 * live state: a failed save (ADV-040) does not block it. Cancel and progress go through `TaskOptions`. Nothing here decides
 * anything about chemistry.
 */
import type { CanonicalStore } from '@/core/commands';
import type { IdFactory } from '@/core/dataset';
import type { AssetBytesProvider, ExportErrorCode, ExportOptions, ExportResult, TaskOptions } from '@/io/contracts';
import { readAssetBytes } from '@/io/export-assets';
import type { DocumentGenerator, ExportBuildParams, ExportFormat, ExportPlanAnswer, RpcError } from '@/workers/rpc/contracts';
import type { ReplicaSync } from './sync';

export interface ComputeExportRequest {
  readonly format: ExportFormat;
  readonly options: ExportOptions;
}

export interface ComputeExportDeps {
  readonly sync: Pick<ReplicaSync, 'client' | 'settled'>;
  readonly store: Pick<CanonicalStore, 'getRevision'>;
  readonly assetBytes: AssetBytesProvider;
  /** The file's `exportedAt` comes from main's injected clock. */
  readonly ids: Pick<IdFactory, 'now'>;
  /** The file's `generator`: the value main gives the persistence adapter (the worker keeps none of its own). */
  readonly generator: DocumentGenerator;
}

/** `REJECTED`: the worker could not do it (down, timed out, crashed, refused) and nothing was exported. */
export type ComputeExportResult =
  | { readonly ok: true; readonly result: ExportResult; readonly revision: number }
  | { readonly ok: false; readonly code: ExportErrorCode | 'REJECTED'; readonly message: string };

export interface ComputeExport {
  export(request: ComputeExportRequest, task?: TaskOptions): Promise<ComputeExportResult>;
}

/** A commit can land between settling the sync and the calls; the export is then planned again, a bounded number of times. */
export const MAX_EXPORT_ATTEMPTS = 3;

type Failure = Extract<ComputeExportResult, { ok: false }>;
const failure = (code: Failure['code'], message: string): Failure => ({ ok: false, code, message });
const cancelled = (): Failure => failure('CANCELLED', 'export aborted');
/** A call the CALLER cancelled is CANCELLED; a `CANCELLED` from a client that was stopped is the worker being unavailable. */
const rejected = (what: string, error: RpcError, task: TaskOptions): Failure =>
  error.code === 'CANCELLED' && task.signal?.aborted === true ? cancelled() : failure('REJECTED', `the compute worker could not ${what} (${error.code}: ${error.message}); nothing was exported`);

export function createComputeExport(deps: ComputeExportDeps): ComputeExport {
  const { sync, store } = deps;
  const client = sync.client;

  type Planned = Extract<ExportPlanAnswer, { ok: true }>['assets'];
  type Read = { readonly assets: ExportBuildParams['assets']; readonly unreadable: NonNullable<ExportBuildParams['unreadable']> };

  async function readBytes(planned: Planned, task: TaskOptions): Promise<Read | undefined> {
    const assets: ExportBuildParams['assets'][number][] = [];
    const unreadable: { assetId: Planned[number]['assetId']; sha256: string; message: string }[] = [];
    for (const asset of planned) {
      if (task.signal?.aborted === true) return undefined;
      const read = await readAssetBytes(deps.assetBytes, asset.assetId, asset.sha256);
      if (read.ok) assets.push({ assetId: asset.assetId, sha256: asset.sha256, bytes: read.bytes.slice() });
      else if (read.missing.reason === 'read_failed') unreadable.push({ assetId: asset.assetId, sha256: asset.sha256, message: read.missing.message ?? '' });
    }
    return { assets, unreadable };
  }

  async function run({ format, options }: ComputeExportRequest, task: TaskOptions): Promise<ComputeExportResult> {
    for (let attempt = 0; attempt < MAX_EXPORT_ATTEMPTS; attempt += 1) {
      if (task.signal?.aborted === true) return cancelled();
      const caught = await sync.settled();
      if (caught.state === 'down') return failure('REJECTED', `the compute worker is down (${caught.reason}); nothing was exported`);
      const revision = store.getRevision();
      const callOptions = task.signal === undefined ? {} : { signal: task.signal };

      const plan = await client.exportPlan({ options, format, revision }, callOptions);
      if (!plan.ok) return rejected('plan the export', plan.error, task);
      if (!plan.value.ok) continue; // a commit landed after `settled`: settle again

      const read = await readBytes(plan.value.assets, task);
      if (read === undefined) return cancelled();
      const { assets, unreadable } = read;
      const build = await client.exportBuild(
        { options, format, revision, assets, unreadable, exportedAt: deps.ids.now(), generator: deps.generator },
        { ...callOptions, transfer: assets.map((asset) => asset.bytes.buffer as ArrayBuffer), ...(task.onProgress === undefined ? {} : { onProgress: task.onProgress }) },
      );
      if (!build.ok) return rejected('build the export', build.error, task);
      const answer = build.value;
      if (answer.ok) return { ok: true, result: answer.result, revision };
      if (answer.code !== 'REPLICA_STALE') return failure(answer.code, answer.message);
    }
    return failure('REJECTED', 'the replica kept moving while the export was prepared; nothing was exported (try again)');
  }

  return { export: (request, task = {}) => run(request, task) };
}
