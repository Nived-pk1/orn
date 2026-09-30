/**
 * Typed worker RPC — docs/PERFORMANCE_ARCHITECTURE.md §3. Every request is cancellable and may
 * report progress. Workers: chem (RDKit, L4), layout (ELK), search (MiniSearch), compute (replica
 * of canonical state: full validation, route search, import preview, export building).
 */
import type { CanonicalState, StructureRep } from '@/core/schema';
import type { PrecomputedFindings } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { RouteQuery, RouteSearchResult } from '@/core/graph/contracts';
import type { Finding } from '@/core/validation/contracts';
import type { Depiction, DepictionOptions, ParseOutcome } from '@/chem/contracts';
import type { ExportOptions, ImportPreview, ImportSource } from '@/io/contracts';
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
  importPreview(params: { readonly source: ImportSource }, ctx: RpcCallContext): Promise<ImportPreview>;
  buildExport(params: ExportOptions, ctx: RpcCallContext): Promise<Blob>;
}
