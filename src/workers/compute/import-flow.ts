/**
 * The main-thread side of an import that runs in the compute worker (step 4.2c, Phase 4 contract decisions Q1 and item 2):
 * preview / revise / cancel are calls to the worker's import host, and `apply` is the orchestrator:
 *
 *   prepare (worker: merged state + findings + report) -> snapshotBuild('pre_import') (worker) -> the persistence bytes entry
 *   point -> tell the replica sync to expect an adoption at the next revision -> ONE `store.replaceState(merged, 'import',
 *   precomputed)` -> the batch report and quarantine rows -> asset bytes staged just before `replaceState` (Phase 3, Q1).
 *
 * It keeps the Phase 3 rules: the live revision is checked before AND after the snapshot (STALE_REVISION), a batch cancelled or
 * replaced while the snapshot is written is refused (UNKNOWN_BATCH), and any refusal by the store deletes the snapshot and
 * changes nothing. It knows only ports (this is a worker directory: it never imports persistence): the store, a snapshot
 * bytes port shaped like the adapter's, the batch sink and the asset stage port. Every failure is a value.
 */
import type { IdFactory, RandomSource } from '@/core/dataset';
import type { CommandError } from '@/core/commands';
import { completeReport, storeImportReport } from '@/io';
import type { AssetStagePort, ImportApplyResult, ImportBatchSink, ImportPlan, ImportPlanRequest, ImportStorePort } from '@/io';
import type { IdData, RpcCallOptions, RpcError, RpcResult, WorkerImportOutcome } from '@/workers/rpc/contracts';
import type { ReplicaSync } from './sync';

/** What the flow needs of the persistence adapter: `storeSnapshotBytes` and `deleteSnapshot` satisfy it structurally. */
export interface SnapshotBytesPort {
  storeSnapshotBytes(input: {
    readonly bytes: Uint8Array;
    readonly reason: 'pre_import';
    readonly revision: number;
    readonly schemaVersion: number;
    readonly note?: string;
  }): Promise<{ readonly ok: true; readonly summary: { readonly id: string } } | { readonly ok: false; readonly code: 'STALE_REVISION' | 'BAD_BYTES'; readonly message: string }>;
  deleteSnapshot(id: string): Promise<void>;
}

export interface ComputeImportDeps {
  readonly sync: Pick<ReplicaSync, 'client' | 'settled' | 'status' | 'expectAdoption' | 'clearAdoption'>;
  readonly store: ImportStorePort;
  readonly snapshots: SnapshotBytesPort;
  readonly batches: ImportBatchSink;
  readonly assetStage: AssetStagePort;
  /** The report time and the worker's per-call instant come from here (main's injected clock). */
  readonly ids: Pick<IdFactory, 'now'>;
  /** Main's injected random source: one seed per call to the worker. */
  readonly rng: RandomSource;
}

export interface ComputeImport {
  preview(source: Blob, fileName: string, request?: ImportPlanRequest, options?: RpcCallOptions): Promise<RpcResult<WorkerImportOutcome>>;
  revise(batchId: string, request: ImportPlanRequest, options?: RpcCallOptions): Promise<RpcResult<WorkerImportOutcome>>;
  cancel(batchId: string): Promise<RpcResult<{ readonly cancelled: boolean }>>;
  apply(batchId: string, plan: ImportPlan): Promise<ImportApplyResult>;
}

const STALE = 'data changed since the preview; run it again';
/** Said by every failed apply of a batch whose asset files left the worker with the prepared result (the import host says it for later calls). */
export const PREVIEW_AGAIN = ' The file data of this preview was handed over to the failed apply and is gone; run the preview again.';
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
type Failure = Extract<ImportApplyResult, { ok: false }>;
const failure = (code: Failure['code'], message: string, error?: CommandError): Failure => ({ ok: false, code, message, ...(error === undefined ? {} : { error }) });

/** A call the worker could not answer: a crash lost the pending batch (UNKNOWN_BATCH), anything else is a refusal with the reason. */
function rpcFailure(error: RpcError, what: string): Failure {
  if (error.code === 'WORKER_CRASHED') return failure('UNKNOWN_BATCH', `the compute worker restarted while ${what}; the pending import was lost, nothing was imported; preview it again`);
  return failure('REJECTED', `the compute worker could not ${what} (${error.code}: ${error.message}); nothing was imported`);
}

export function createComputeImport(deps: ComputeImportDeps): ComputeImport {
  const { sync, store } = deps;
  const client = sync.client;
  /** The batch an apply is working on; a preview, revise or cancel while it waits makes it stale (Phase 3's `stillPending`). */
  let applying: { readonly batchId: string; superseded: boolean } | undefined;

  const idData = (): IdData => ({ nowIso: deps.ids.now(), seed: Math.floor(deps.rng.next() * 0x1_0000_0000) });
  const supersede = (): void => {
    if (applying !== undefined) applying.superseded = true;
  };

  /** Everything undone after a refusal past the point where the worker holds a pending state. */
  async function abandon(snapshotId: string | undefined): Promise<void> {
    sync.clearAdoption();
    if (snapshotId !== undefined) await deps.snapshots.deleteSnapshot(snapshotId).catch(() => undefined);
    await client.dropPending({});
  }

  async function run(batchId: string, plan: ImportPlan): Promise<ImportApplyResult> {
    if (store.isReadOnly()) return failure('READ_ONLY', 'this tab is not the writer; nothing was imported');
    // The replica must have caught up with every commit so far, or the worker would call the batch stale.
    const caught = await sync.settled();
    if (caught.state === 'down') return failure('REJECTED', `the compute worker is down (${caught.reason}); nothing was imported`);
    const baseRevision = store.getRevision();

    const prepared = await client.importPrepareApply({ batchId, plan, baseRevision });
    if (!prepared.ok) return rpcFailure(prepared.error, 'prepare the import');
    if (!prepared.value.ok) return failure(prepared.value.code, prepared.value.message);
    const batch = prepared.value;
    // Its asset buffers were transferred to main: whatever happens next, this batch cannot be applied again (follow-up a).
    const again = batch.assets.length > 0 ? PREVIEW_AGAIN : '';
    const fail = (code: Failure['code'], message: string, error?: CommandError): Failure => failure(code, message + again, error);
    if (store.getRevision() !== baseRevision) {
      await abandon(undefined);
      return fail('STALE_REVISION', STALE);
    }

    const built = await client.snapshotBuild({ revision: baseRevision, reason: 'pre_import', exportedAt: deps.ids.now() });
    if (!built.ok) {
      await abandon(undefined);
      return fail('SNAPSHOT_FAILED', `the pre_import snapshot could not be built, so nothing was imported (${built.error.code}: ${built.error.message})`);
    }
    const bytes = built.value;
    if (!bytes.ok) {
      await abandon(undefined);
      return bytes.code === 'REPLICA_STALE' ? fail('STALE_REVISION', STALE) : fail('SNAPSHOT_FAILED', `the pre_import snapshot could not be built, so nothing was imported (${bytes.message})`);
    }
    let snapshotId: string;
    try {
      const stored = await deps.snapshots.storeSnapshotBytes({
        bytes: bytes.bytes,
        reason: 'pre_import',
        revision: baseRevision,
        schemaVersion: bytes.schemaVersion,
        note: `before importing ${batch.report.fileName}`,
      });
      if (!stored.ok) {
        await abandon(undefined);
        return stored.code === 'STALE_REVISION' ? fail('STALE_REVISION', STALE) : fail('SNAPSHOT_FAILED', `the pre_import snapshot was refused, so nothing was imported (${stored.message})`);
      }
      snapshotId = stored.summary.id;
    } catch (error) {
      await abandon(undefined);
      return fail('SNAPSHOT_FAILED', `the pre_import snapshot could not be written, so nothing was imported (${messageOf(error)})`);
    }

    if (applying?.superseded === true) {
      await abandon(snapshotId);
      return fail('UNKNOWN_BATCH', 'the import was cancelled or replaced by a newer preview; nothing was imported');
    }
    if (store.getRevision() !== baseRevision) {
      await abandon(snapshotId);
      return fail('STALE_REVISION', STALE);
    }

    let committed: ReturnType<ImportStorePort['replaceState']>;
    try {
      sync.expectAdoption(baseRevision + 1);
      if (batch.assets.length > 0) deps.assetStage.stage(batch.assets);
      committed = store.replaceState(batch.mergedState, 'import', batch.precomputed);
    } catch (error) {
      await abandon(snapshotId);
      return fail('REJECTED', `the import could not be applied (${messageOf(error)}); nothing was changed`);
    } finally {
      deps.assetStage.clear();
    }
    if (!committed.ok) {
      await abandon(snapshotId);
      return fail(committed.error.code === 'READ_ONLY' ? 'READ_ONLY' : 'REJECTED', committed.error.message, committed.error);
    }

    const revision = committed.changes.revision;
    const report = completeReport(batch.report, deps.ids.now(), snapshotId);
    const reportError = await storeImportReport(deps.batches, report, batch.quarantine);
    return { ok: true, revision, snapshotId, report, reportSaved: reportError === undefined, ...(reportError === undefined ? {} : { reportError }) };
  }

  return {
    preview(source, fileName, request, options) {
      supersede();
      return client.importPreview({ source, fileName, ...(request === undefined ? {} : { request }), ids: idData() }, options);
    },
    revise(batchId, request, options) {
      supersede();
      return client.importRevise({ batchId, request, ids: idData() }, options);
    },
    async cancel(batchId) {
      if (applying?.batchId === batchId) supersede();
      return client.importCancel({ batchId });
    },
    async apply(batchId, plan) {
      const mine = { batchId, superseded: false };
      applying = mine;
      try {
        return await run(batchId, plan);
      } finally {
        if (applying === mine) applying = undefined;
      }
    },
  };
}
