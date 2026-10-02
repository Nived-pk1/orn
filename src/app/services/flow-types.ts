/**
 * The data flows of the app services (step 5.1c): import, restore, export. Plain async functions answering values. A refusal is
 * a value (`FlowRefusal`), the Phase 3/4 results pass through unchanged, and an applied change says whether it is SAVED:
 * `ok: true` means the state changed, `saved` says whether it is durable ("done" = `ok && (saved || sessionOnly)`).
 */
import type { ExportErrorCode, ExportOptions, ExportResult, ImportApplyResult, ImportPlan, ImportPlanRequest, TaskOptions } from '@/io';
import type { ComputeRestoreResult } from '@/workers/compute';
import type { ExportFormat, WorkerImportFailure } from '@/workers/rpc/contracts';
import type { OperationKind, SaveView } from './status';

export interface FlowOptions {
  /** Cancelling changes nothing: a flow that sees it before the commit undoes what it prepared and answers `CANCELLED`. */
  readonly signal?: AbortSignal;
  /**
   * Run the SAME pipeline on this thread instead of the compute worker. Never taken silently: a worker that is down answers
   * `WORKER_DOWN` with `inProcessAvailable`, and the caller asks again with this set (it freezes the page for the duration).
   */
  readonly inProcess?: boolean;
}

export interface FlowRefusal {
  readonly ok: false;
  /**
   * `BUSY`: another operation is running (`busyWith`). `READ_ONLY`: a follower or read-only tab (export still works).
   * `WORKER_DOWN`: the compute worker cannot do it. `CANCELLED`: the signal was aborted before the commit.
   */
  readonly code: 'BUSY' | 'READ_ONLY' | 'CANCELLED' | 'WORKER_DOWN';
  readonly message: string;
  readonly busyWith?: OperationKind;
  /** `WORKER_DOWN` only. */
  readonly inProcessAvailable?: true;
}

/** Whether a change reached storage. A session-only tab saves nothing and says so. */
export interface Durability {
  readonly saved: boolean;
  readonly sessionOnly: boolean;
  /** The SaveStatus when the change is not saved and storage exists; null otherwise. */
  readonly save: SaveView | null;
  /** Which path ran. */
  readonly inProcess: boolean;
  /** Things said out loud: dropped in-memory snapshots, asset bytes that could not be kept, a refused persistent-storage request. */
  readonly notes: readonly string[];
}

export type ImportPreviewAnswer = { readonly ok: true; readonly plan: ImportPlan; readonly inProcess: boolean } | WorkerImportFailure | FlowRefusal;

export type ImportApplyAnswer = (Extract<ImportApplyResult, { ok: true }> & Durability) | Extract<ImportApplyResult, { ok: false }> | FlowRefusal;

export type RestoreAnswer = (Extract<ComputeRestoreResult, { ok: true }> & Durability) | Extract<ComputeRestoreResult, { ok: false }> | FlowRefusal;

export type ExportAnswer =
  | { readonly ok: true; readonly result: ExportResult; readonly revision: number; readonly inProcess: boolean }
  | { readonly ok: false; readonly code: ExportErrorCode | 'REJECTED'; readonly message: string }
  | FlowRefusal;

export interface ImportFlows {
  /** Parse and preview a file (a new pending batch replaces the old one). Writer only; READ_ONLY otherwise. */
  preview(source: Blob, fileName: string, request?: ImportPlanRequest, options?: FlowOptions): Promise<ImportPreviewAnswer>;
  /** The FULL desired request for the pending batch; a new batch id. */
  revise(batchId: string, request: ImportPlanRequest, options?: FlowOptions): Promise<ImportPreviewAnswer>;
  /** Discards the pending batch (on whichever path made it). Not gated: cancelling while an apply runs makes the apply stop before its commit. */
  cancel(batchId: string): Promise<{ readonly cancelled: boolean }>;
  /** Applies the confirmed plan; answers only after `flush()`. */
  apply(batchId: string, plan: ImportPlan, options?: FlowOptions): Promise<ImportApplyAnswer>;
  /** Restores the `pre_import` snapshot of the newest import batch through the restore flow. `UNKNOWN_BATCH` when there is none. */
  undo(options?: FlowOptions): Promise<RestoreAnswer | UndoRefusal>;
}

export interface UndoRefusal {
  readonly ok: false;
  readonly code: 'UNKNOWN_BATCH';
  readonly message: string;
}

export interface Flows extends ImportFlows {
  /** Restores a stored snapshot by id; answers only after `flush()`. */
  restore(snapshotId: string, options?: FlowOptions): Promise<RestoreAnswer>;
  /** Bytes, counts, missing assets and references. Works in every mode (a follower exports too). */
  export(options: ExportOptions, format: ExportFormat, flow?: FlowOptions & Pick<TaskOptions, 'onProgress'>): Promise<ExportAnswer>;
}
