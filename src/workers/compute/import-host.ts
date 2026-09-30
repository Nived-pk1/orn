/**
 * The import session hosted in the compute worker (step 4.2c, Phase 4 contract decisions Q1 and item 2).
 *
 * The live dataset the session compares against is the REPLICA. The pending batch (at most one, as in Phase 3) lives here, so
 * it is lost with the worker: after a crash the next call on it answers `UNKNOWN_BATCH` (ADR-034). Every call that would use a
 * batch built on an older revision than the replica's is refused as a value (`STALE_REVISION`). The `IdFactory` is rebuilt
 * from `{ nowIso, seed }` for each call. Calls run one at a time (the session is stateful and its steps await).
 *
 * `prepareApply` builds the merged state's replica (indexes and `validateAll`, in this worker) and holds it as the replica's
 * PENDING state; `adoptPending` swaps it in once the store accepted the state, `dropPending` forgets it. Asset bytes leave
 * with the prepared result as transferred buffers, so a batch that carried assets cannot be applied twice: it ends with
 * the apply, whatever the outcome.
 */
import { migrationRunner } from '@/core/migrations';
import type { IdFactory } from '@/core/dataset';
import { createImportSession, parseImportSource, type ImportSession, type PreparedApply, type ParsedAsset, type ImportPreviewOutcome } from '@/io';
import type { IdData, ImportPrepareRefused, ImportPrepared, WorkerImportOutcome } from '@/workers/rpc/contracts';
import type { ImportPlan, ImportPlanRequest } from '@/io';
import { RpcHostError, taskOptionsFrom, withTransfer } from '@/workers/rpc/helpers';
import type { RpcCallContext } from '@/workers/rpc/contracts';
import { idFactoryFrom } from './ids';
import type { Replica } from './replica';

export interface ImportHost {
  preview(params: { readonly source: Blob; readonly fileName: string; readonly request?: ImportPlanRequest; readonly ids: IdData }, ctx: RpcCallContext): Promise<WorkerImportOutcome>;
  revise(params: { readonly batchId: string; readonly request: ImportPlanRequest; readonly ids: IdData }, ctx: RpcCallContext): Promise<WorkerImportOutcome>;
  cancel(batchId: string): Promise<{ readonly cancelled: boolean }>;
  prepareApply(params: { readonly batchId: string; readonly plan: ImportPlan; readonly baseRevision: number }, ctx: RpcCallContext): Promise<ImportPrepared | ImportPrepareRefused>;
  /** An import batch is prepared: its merged state is the replica's pending state. */
  hasPrepared(): boolean;
  /** The store took the pending state (or the sync is about to reload): the batch it came from is used up. */
  applied(): void;
  /** The apply failed or was cancelled: drop the pending state; a batch whose asset bytes already left is dropped with it. */
  failed(): boolean;
}

/** Later calls on a batch whose asset bytes left with a failed apply (follow-up a, step 4.2c review): say why, not just "unknown". */
const USED_UP = 'the file data of this preview was handed over to an apply that failed and is gone; run the preview again';

const cancelled = { ok: false, code: 'CANCELLED', message: 'the import was cancelled before it started' } as const;

/** The buffers behind `assets`, each once; a SharedArrayBuffer cannot be transferred and is left to be cloned. */
function transferListOf(assets: readonly ParsedAsset[]): ArrayBuffer[] {
  const seen = new Set<ArrayBuffer>();
  for (const asset of assets) if (asset.bytes.buffer instanceof ArrayBuffer) seen.add(asset.bytes.buffer);
  return [...seen];
}

export function createImportHost(replica: Replica): ImportHost {
  let current: IdFactory | undefined;
  const ids: IdFactory = {
    now: () => (current ?? unset()).now(),
    newId: (prefix) => (current ?? unset()).newId(prefix),
  };
  function unset(): never {
    throw new RpcHostError('INTERNAL', 'the import session asked for an ID outside a call');
  }
  const session: ImportSession = createImportSession({
    store: {
      getState: () => replica.snapshot().state,
      getRevision: () => replica.snapshot().revision,
    },
    ids,
  });

  /** The batch whose merged state is the replica's pending one, and whether its asset bytes already left the worker. */
  let prepared: { readonly batchId: string; handedOver: boolean } | undefined;
  /** The one batch (at most) that a failed apply used up; forgotten when a newer preview replaces the pending batch. */
  let usedUp: string | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  /** One call at a time: the session is stateful and the preview awaits. */
  function serial<T>(job: () => Promise<T>): Promise<T> {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  }

  /** The pending state is only meaningful for the batch it was prepared from. */
  function syncPending(): void {
    if (prepared !== undefined && session.pendingBatchId() !== prepared.batchId) {
      replica.drop();
      prepared = undefined;
    }
  }

  const stale = (): WorkerImportOutcome => ({ ok: false, code: 'STALE_REVISION', message: 'data changed since the preview; run it again' });

  return {
    preview: (params, ctx) =>
      serial(async () => {
        if (ctx.signal.aborted) return cancelled;
        replica.snapshot();
        current = idFactoryFrom(params.ids);
        try {
          const task = taskOptionsFrom(ctx);
          const parsed = await parseImportSource({ fileName: params.fileName, bytes: params.source }, { runner: migrationRunner }, task);
          if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message, ...(parsed.detail === undefined ? {} : { detail: parsed.detail }) };
          const outcome: ImportPreviewOutcome = await session.preview({ parsed: parsed.result, fileName: params.fileName, ...(params.request === undefined ? {} : { request: params.request }) }, task);
          syncPending();
          usedUp = undefined;
          return outcome;
        } finally {
          current = undefined;
        }
      }),

    revise: (params, ctx) =>
      serial(async () => {
        if (ctx.signal.aborted) return cancelled;
        const live = replica.snapshot().revision;
        if (params.batchId === usedUp) return { ok: false, code: 'UNKNOWN_BATCH', message: USED_UP };
        current = idFactoryFrom(params.ids);
        try {
          if (session.pendingBatchId() === params.batchId && session.pendingBaseRevision() !== live) {
            session.cancel(params.batchId);
            syncPending();
            return stale();
          }
          const outcome = await session.revise(params.batchId, params.request, taskOptionsFrom(ctx));
          syncPending();
          return outcome;
        } finally {
          current = undefined;
        }
      }),

    cancel: (batchId) =>
      serial(async () => {
        const done = session.cancel(batchId);
        syncPending();
        return { cancelled: done };
      }),

    prepareApply: (params) =>
      serial(async () => {
        const live = replica.snapshot().revision;
        // A restored snapshot holds the one pending slot (step 4.2d): preparing now would replace it and misdirect its adoption.
        if (replica.pendingRevision() !== undefined && prepared === undefined) return { ok: false, code: 'BUSY', message: 'a snapshot restore is under way; try the import again when it has finished' };
        if (params.batchId === usedUp) return { ok: false, code: 'UNKNOWN_BATCH', message: USED_UP };
        // The replica must be where main's store is, and where the preview was built.
        const outcome = session.prepareApply(params.batchId, params.plan, params.baseRevision);
        if (!outcome.ok) return outcome;
        const batch: PreparedApply = outcome.prepared;
        if (live !== batch.baseRevision) {
          session.cancel(params.batchId);
          syncPending();
          return { ok: false, code: 'STALE_REVISION', message: 'data changed since the preview; run it again' };
        }
        const precomputed = replica.prepare(batch.merged, batch.baseRevision + 1);
        prepared = { batchId: batch.batchId, handedOver: batch.assets.length > 0 };
        const result: ImportPrepared = {
          ok: true,
          batchId: batch.batchId,
          baseRevision: batch.baseRevision,
          mergedState: batch.merged,
          precomputed,
          report: batch.report,
          quarantine: batch.quarantine,
          assets: batch.assets,
        };
        return withTransfer(result, transferListOf(batch.assets));
      }),

    hasPrepared: () => prepared !== undefined,

    applied() {
      if (prepared === undefined) return;
      session.consume(prepared.batchId);
      prepared = undefined;
    },

    failed() {
      const dropped = replica.drop();
      if (prepared?.handedOver === true) {
        session.cancel(prepared.batchId);
        usedUp = prepared.batchId;
      }
      prepared = undefined;
      return dropped;
    },
  };
}
