/**
 * Typed worker RPC — docs/PERFORMANCE_ARCHITECTURE.md §3. Every request is cancellable and may
 * report progress. Workers: chem (RDKit, L4), layout (ELK), search (MiniSearch), compute (replica
 * of canonical state: full validation, route search, import preview, export building).
 */
import type { AssetId, CanonicalState, StructureRep } from '@/core/schema';
import type { MigrationError, MigrationStepReport } from '@/core/migrations/contracts';
import type { PrecomputedFindings } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { RouteQuery, RouteSearchResult } from '@/core/graph/contracts';
import type { Finding } from '@/core/validation/contracts';
import type { Depiction, DepictionOptions, ParseOutcome } from '@/chem/contracts';
import type { ExportBuildResult, ExportOptions, ImportPlan, ImportPlanRequest, ImportPreviewErrorCode, ImportRejectionCode, ParsedAsset } from '@/io/contracts';
import type { ImportQuarantineDraft, ImportReportDraft } from '@/io';
import type { LayoutRequest, LayoutResult } from '@/layout/contracts';
import type { SearchDocument, SearchHit, SearchIndexUpdate, SearchQuery } from '@/search/contracts';

export type RpcErrorCode = 'CANCELLED' | 'TIMEOUT' | 'BAD_REQUEST' | 'WORKER_CRASHED' | 'NOT_READY' | 'INTERNAL' | 'BUSY';
export interface RpcError {
  readonly code: RpcErrorCode;
  readonly message: string;
}

export type RpcMessage =
  | { readonly type: 'request'; readonly id: number; readonly method: string; readonly params: unknown }
  | { readonly type: 'cancel'; readonly id: number }
  | { readonly type: 'progress'; readonly id: number; readonly done: number; readonly total?: number; readonly note?: string }
  | { readonly type: 'response'; readonly id: number; readonly ok: true; readonly result: unknown }
  | { readonly type: 'response'; readonly id: number; readonly ok: false; readonly error: RpcError };

export interface RpcCallContext {
  readonly signal: AbortSignal;
  progress(done: number, total?: number, note?: string): void;
}

export interface RpcCallOptions {
  readonly signal?: AbortSignal;
  /** Overrides the method's default from its `RpcMethodSpec`. */
  readonly timeoutMs?: number;
  readonly onProgress?: (done: number, total?: number, note?: string) => void;
  /** Buffers moved (not copied) to the worker with the request; detached on the sender afterwards. */
  readonly transfer?: readonly Transferable[];
}

/** What a client call answers: errors are values (CLAUDE.md §6); a call never rejects. */
export type RpcResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RpcError };

/** Worker-side API shape: every method takes one structured-cloneable param object. */
export type WorkerApi<T> = { readonly [M in keyof T]: (params: never, ctx: RpcCallContext) => Promise<unknown> };

/** Main-thread proxy derived from a worker API (a plain object built from the method specs, never a Proxy). */
export type RpcClient<T extends WorkerApi<T>> = {
  readonly [M in keyof T]: T[M] extends (params: infer P, ctx: RpcCallContext) => Promise<infer R>
    ? (params: P, options?: RpcCallOptions) => Promise<RpcResult<R>>
    : never;
} & { terminate(): void };

/** Per method, required for every method of an API by type. Defaults come from ADR-034 (REVIEW REQUIRED). */
export interface RpcMethodSpec {
  /** Safe to run again after a restart (D4): `callWithRetry` retries only these. */
  readonly idempotent: boolean;
  /** Default per-call timeout in milliseconds; a timeout terminates and restarts the worker. */
  readonly timeoutMs: number;
}
export type RpcMethodSpecs<Api> = { readonly [M in keyof Api]: RpcMethodSpec };

/** The client's end of a worker: what a browser `Worker` or a Node `worker_threads` Worker is adapted to. */
export interface RpcMessagePort {
  postMessage(message: RpcMessage, transfer?: readonly Transferable[]): void;
  /** Returns the unsubscribe function. */
  onMessage(listener: (message: unknown) => void): () => void;
}
export interface RpcPort extends RpcMessagePort {
  onError(listener: (error: unknown) => void): () => void;
  onMessageError(listener: (error: unknown) => void): () => void;
  onExit(listener: (code: number) => void): () => void;
  terminate(): void;
}
export type WorkerFactory = () => RpcPort;

/** Reported through `onEvent`; Diagnostics (Phase 9) is the eventual consumer. Nothing about a worker is silent. */
export type WorkerEvent =
  | { readonly type: 'crash'; readonly reason: 'error' | 'messageerror' | 'exit'; readonly message: string; readonly pending: number; readonly willRestart: boolean }
  | { readonly type: 'restart'; readonly reason: 'crash' | 'timeout'; readonly restarts: number }
  | { readonly type: 'timeout'; readonly id: number; readonly method: string; readonly timeoutMs: number }
  | { readonly type: 'dropped_response'; readonly id: number; readonly method?: string; readonly reason: 'cancelled' | 'timeout' | 'unknown' | 'malformed' }
  | { readonly type: 'busy'; readonly method: string; readonly inFlight: number }
  | { readonly type: 'restart_hook_failed'; readonly message: string }
  /** The hook did not finish in `restartHookTimeoutMs`: the restart counts as failed and the worker starts over. */
  | { readonly type: 'restart_hook_timeout'; readonly timeoutMs: number; readonly attempt: number }
  /** The client is down for good (restart cap or no worker could be created); every call answers `WORKER_CRASHED`. */
  | { readonly type: 'gave_up'; readonly reason: 'restart_cap' | 'start_failed'; readonly restarts: number }
  | { readonly type: 'callback_error'; readonly message: string }
  /**
   * The compute replica's sync with the store changed state (step 4.2b): `in_sync` (the replica follows the store's
   * ChangeSets), `reloading` (one `loadReplica` of the store's current state is under way) or `down` (the worker is
   * gone for good). Emitted on every change of state, with the reason.
   */
  /**
   * Boot, a promotion or a follower's reload could not validate in the compute worker and validated in process instead (step
   * 4.2d): the worker did not start, gave up, timed out or answered wrongly. The boot report says the same. Never silent.
   */
  | { readonly type: 'validation_fallback'; readonly reason: string }
  | { readonly type: 'replica_status'; readonly status: 'in_sync' | 'reloading' | 'down'; readonly reason: string; readonly revision: number | null };

export interface RestartInfo {
  readonly reason: 'crash' | 'timeout';
  /** Restarts since the last successful response (the cap counts these). */
  readonly attempt: number;
}

export interface RpcClientOptions<Api extends WorkerApi<Api>> {
  /**
   * Runs after every restart, before other calls are sent (they wait for it). `raw` sends without waiting, so the hook
   * can reload the worker's replica. A rejected hook is reported (`restart_hook_failed`) and calls proceed.
   */
  readonly onRestart?: (raw: RpcClient<Api>, info: RestartInfo) => void | Promise<void>;
  /** Restarts allowed in a row without a successful response in between; then the client stays down. Default 3. */
  readonly maxRestarts?: number;
  /** The hook's own timeout. On expiry the restart counts as failed (towards `maxRestarts`), calls waiting for it answer `WORKER_CRASHED`. Default 30 000. */
  readonly restartHookTimeoutMs?: number;
  /** Calls in flight at once (from the caller's side); more are answered `BUSY`. Default 16. */
  readonly maxInFlight?: number;
  readonly onEvent?: (event: WorkerEvent) => void;
}

export interface ChemWorkerApi {
  parse(params: { readonly structure: StructureRep }, ctx: RpcCallContext): Promise<ParseOutcome>;
  depict(params: { readonly structure: StructureRep; readonly options: DepictionOptions }, ctx: RpcCallContext): Promise<Depiction>;
  checkAll(params: { readonly revision: number }, ctx: RpcCallContext): Promise<readonly Finding[]>;
}

export interface LayoutWorkerApi {
  layout(params: LayoutRequest, ctx: RpcCallContext): Promise<LayoutResult>;
}

export interface SearchWorkerApi {
  load(params: { readonly documents: readonly SearchDocument[]; readonly revision: number }, ctx: RpcCallContext): Promise<void>;
  apply(params: SearchIndexUpdate, ctx: RpcCallContext): Promise<void>;
  search(params: SearchQuery, ctx: RpcCallContext): Promise<readonly SearchHit[]>;
}

/** A replica call refused as a value: the replica is at revision `have`, not the one the call needs. */
export interface ReplicaStale {
  readonly ok: false;
  readonly code: 'REPLICA_STALE';
  readonly have: number;
}
export type ReplicaAnswer<T extends object> = ({ readonly ok: true } & T) | ReplicaStale;

/**
 * What main hands the worker in place of a clock and a random source (step 4.2c, Phase 4 contract decision Q1): the worker
 * rebuilds an `IdFactory` from it, so its IDs are a function of the call. `nowIso` is a canonical UTC ISO timestamp with
 * milliseconds (`toISOString()` form), `seed` an unsigned 32-bit integer. Main supplies both from its injected clock and
 * RNG, and a NEW seed for every call (a revise that reused the previous seed would mint the previous batch's ID).
 */
export interface IdData {
  readonly nowIso: string;
  readonly seed: number;
}

/** Every reason a worker import call can be refused as a value: the session's, the parser's, and the revision rule's. */
export interface WorkerImportFailure {
  readonly ok: false;
  readonly code: ImportPreviewErrorCode | ImportRejectionCode | 'STALE_REVISION';
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}
export type WorkerImportOutcome = { readonly ok: true; readonly plan: ImportPlan } | WorkerImportFailure;

/**
 * The payload main needs to carry out an apply (step 4.2c): the merged state, its findings stamped for revision
 * `baseRevision + 1` (what `replaceState` takes as precomputed), the report without its time and snapshot ID, the quarantine
 * rows without their time, and the verified asset bytes (their buffers are transferred, not copied).
 */
export interface ImportPrepared {
  readonly ok: true;
  readonly batchId: string;
  readonly baseRevision: number;
  readonly mergedState: CanonicalState;
  readonly precomputed: PrecomputedFindings;
  readonly report: ImportReportDraft;
  readonly quarantine: readonly ImportQuarantineDraft[];
  readonly assets: readonly ParsedAsset[];
}
export interface ImportPrepareRefused {
  readonly ok: false;
  /** `BUSY`: a restored snapshot is the pending state (step 4.2d); one whole-state operation at a time. */
  readonly code: 'UNKNOWN_BATCH' | 'PLAN_MISMATCH' | 'BLOCKED' | 'STALE_REVISION' | 'BUSY';
  readonly message: string;
}

export type SnapshotReasonName = 'pre_import' | 'pre_migration' | 'pre_restore' | 'periodic' | 'manual';
/** The `generator` document field: the app identity main gives the persistence adapter (step 4.2e review, follow-up b). */
export type DocumentGenerator = { readonly app: string; readonly version: string };
export interface SnapshotBuildParams {
  readonly revision: number;
  readonly reason: SnapshotReasonName;
  readonly exportedAt: string;
  readonly generator: DocumentGenerator;
}
export type SnapshotBuildAnswer =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly revision: number; readonly reason: SnapshotReasonName; readonly schemaVersion: number }
  | ReplicaStale
  | { readonly ok: false; readonly code: 'SERIALIZE_FAILED'; readonly message: string };

/**
 * A stored snapshot's bytes to decode, migrate, validate strictly and prepare as the PENDING state (step 4.2d). `id` and
 * `schemaVersion` are the stored summary's: they make the worker's refusals read like `readSnapshot`'s (a document whose
 * version differs from the summary is CORRUPT). `baseRevision` is main's live revision: the pending state is revision
 * `baseRevision + 1`. The bytes are transferred.
 */
export interface SnapshotDecodeParams {
  readonly bytes: Uint8Array;
  readonly id: string;
  readonly schemaVersion: number;
  readonly baseRevision: number;
}
/**
 * `CORRUPT` / `MIGRATION_FAILED` / `INVALID` are the Phase 3 restore codes with the same messages; `BUSY`: an import batch is
 * prepared (one pending state at a time). A successful answer carries what `replaceState(state, 'restore', precomputed)` takes.
 */
export interface SnapshotDecodeRefused {
  readonly ok: false;
  readonly code: 'CORRUPT' | 'MIGRATION_FAILED' | 'INVALID' | 'BUSY';
  readonly message: string;
  readonly migration?: MigrationError;
  readonly issues?: readonly { readonly path: string; readonly message: string }[];
}
export type SnapshotDecodeAnswer =
  | { readonly ok: true; readonly state: CanonicalState; readonly precomputed: PrecomputedFindings; readonly steps: readonly MigrationStepReport[] }
  | ReplicaStale
  | SnapshotDecodeRefused;

/** `adoptPending` refused as a value: the sync then reloads the replica. `have` is the replica's revision. */
export interface AdoptRefused {
  readonly ok: false;
  readonly code: 'NO_PENDING' | 'PENDING_REVISION' | 'REPLICA_STALE';
  readonly message: string;
  readonly have: number | null;
}
export type AdoptAnswer = { readonly ok: true; readonly revision: number } | AdoptRefused;

/** The two export files: `.orn.json` (one dataset document) and `.ornpkg` (a zip: manifest, dataset, asset files). */
export type ExportFormat = 'orn.json' | 'ornpkg';

/** What an export needs to know of the replica to plan: the format decides which options make it read asset bytes. */
export interface ExportPlanParams {
  readonly options: ExportOptions;
  readonly format: ExportFormat;
  readonly revision: number;
}
/** The asset records the export will ask bytes for (scope closure applied, in ID order); empty when the options ask for none. */
export type ExportPlanAnswer = ReplicaAnswer<{ readonly assets: readonly { readonly assetId: AssetId; readonly sha256: string }[] }>;

/**
 * `assets` are the bytes main read for the plan's list (an asset it could not read is left out: the worker reports it in
 * `missingAssets`, as `no_bytes`, or as `read_failed` when it is also listed in `unreadable` with main's error message). Their
 * buffers are transferred. `exportedAt` is main's wall-clock time and `generator` the app identity main gives the adapter
 * (INV-19: the same state, clock and generator give the same bytes; the worker keeps no generator of its own).
 */
export interface ExportBuildParams {
  readonly options: ExportOptions;
  readonly format: ExportFormat;
  readonly revision: number;
  readonly assets: readonly { readonly assetId: AssetId; readonly sha256: string; readonly bytes: Uint8Array }[];
  readonly unreadable?: readonly { readonly assetId: AssetId; readonly sha256: string; readonly message: string }[];
  readonly exportedAt: string;
  readonly generator: DocumentGenerator;
}
/** The export's own result as a value (`CANCELLED`, `SERIALIZE_FAILED`) or `REPLICA_STALE`; the result bytes are transferred. */
export type ExportBuildAnswer = ExportBuildResult | ReplicaStale;

export interface ComputeWorkerApi {
  /**
   * Replaces the replica with `state` at `revision` and answers `validateAll` of it, stamped for adoption at that
   * revision: exactly what `replaceState` / `reload` take as precomputed findings (step 4.2a). Idempotent.
   */
  loadReplica(params: { readonly state: CanonicalState; readonly revision: number }, ctx: RpcCallContext): Promise<PrecomputedFindings>;
  /**
   * Replica stays in sync by applying the same ChangeSets as the main store, in order. `REPLICA_STALE` (a value) when
   * the ChangeSet does not follow the replica's revision (a `'remote'` one may span revisions); the caller reloads.
   * NOT idempotent: a second application would fail the revision check or, worse, double an edit.
   */
  applyChanges(params: { readonly changes: ChangeSet }, ctx: RpcCallContext): Promise<ReplicaAnswer<{ readonly revision: number }>>;
  /** Full L1-L3 pass over the replica; `REPLICA_STALE` when the replica is not at `revision`. */
  validateAll(params: { readonly revision: number }, ctx: RpcCallContext): Promise<ReplicaAnswer<{ readonly findings: readonly Finding[] }>>;
  /** Route search over the replica (its time budget is timed inside the worker); `REPLICA_STALE` as above. `query.limits.signal` is set by the worker. */
  findRoutes(params: { readonly revision: number; readonly query: RouteQuery }, ctx: RpcCallContext): Promise<ReplicaAnswer<{ readonly result: RouteSearchResult }>>;
  /**
   * Parse, convert (legacy), analyse against the replica, merge and validate; the result becomes THE pending batch of the
   * worker (at most one). `source` is a Blob: structured clone shares its bytes, they are not copied. Idempotent.
   */
  importPreview(params: { readonly source: Blob; readonly fileName: string; readonly request?: ImportPlanRequest; readonly ids: IdData }, ctx: RpcCallContext): Promise<WorkerImportOutcome>;
  /** The FULL desired request (not a delta) for the pending batch; `STALE_REVISION` when the replica moved since the preview. NOT idempotent (a restart lost the batch). */
  importRevise(params: { readonly batchId: string; readonly request: ImportPlanRequest; readonly ids: IdData }, ctx: RpcCallContext): Promise<WorkerImportOutcome>;
  importCancel(params: { readonly batchId: string }, ctx: RpcCallContext): Promise<{ readonly cancelled: boolean }>;
  /**
   * The pure half of apply. Refuses (as a value) an unknown batch, a plan that is not the previewed one, a blocked plan and
   * a stale revision (`baseRevision` is main's live revision; the replica and the batch must both be at it). On success the
   * merged state is the worker's PENDING state and the batch stays pending until `adoptPending` or `dropPending`. NOT idempotent.
   */
  importPrepareApply(params: { readonly batchId: string; readonly plan: ImportPlan; readonly baseRevision: number }, ctx: RpcCallContext): Promise<ImportPrepared | ImportPrepareRefused>;
  /**
   * Snapshot bytes of the replica at `revision`, built here and transferred; `REPLICA_STALE` for another revision. The
   * document's `exportedAt` is `exportedAt`, main's wall-clock time (the worker's own clock is monotonic, not a date), and its
   * `generator` is main's too. Idempotent.
   */
  snapshotBuild(params: SnapshotBuildParams, ctx: RpcCallContext): Promise<SnapshotBuildAnswer>;
  /**
   * Decode the stored snapshot bytes, migrate (the worker's injected runner), parse strictly and prepare the result as the
   * PENDING state (index build and `validateAll` once); the caller then `replaceState`s it with the findings and the sync adopts
   * it, or sends `dropPending`. Failures are values with the Phase 3 codes. Idempotent (a retry after a restart decodes again).
   */
  snapshotDecode(params: SnapshotDecodeParams, ctx: RpcCallContext): Promise<SnapshotDecodeAnswer>;
  /** The store accepted the pending state at `revision`: the replica becomes it (no second whole-state transfer). Refusals are values. NOT idempotent. */
  adoptPending(params: { readonly revision: number }, ctx: RpcCallContext): Promise<AdoptAnswer>;
  /** The apply failed or was cancelled: forget the pending state (and the batch when its asset bytes already left). Idempotent. */
  dropPending(params: Readonly<Record<string, never>>, ctx: RpcCallContext): Promise<{ readonly dropped: boolean }>;
  /**
   * Export in two calls (step 4.2e; no function crosses the worker boundary). The plan is the scope closure over the replica
   * and the asset IDs the export needs bytes of; `REPLICA_STALE` when the replica is not at `revision`. Idempotent.
   */
  exportPlan(params: ExportPlanParams, ctx: RpcCallContext): Promise<ExportPlanAnswer>;
  /** Builds the file from the replica at `revision` and the bytes main read; cancel and progress through the context. Idempotent. */
  exportBuild(params: ExportBuildParams, ctx: RpcCallContext): Promise<ExportBuildAnswer>;
}
