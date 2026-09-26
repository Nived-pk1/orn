/**
 * Typed worker RPC — docs/PERFORMANCE_ARCHITECTURE.md §3. Every request is cancellable and may
 * report progress. Workers: chem (RDKit, L4), layout (ELK), search (MiniSearch), compute (replica
 * of canonical state: full validation, route search, import preview, export building).
 */
import type { CanonicalState, StructureRep } from '@/core/schema';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { RouteQuery, RouteSearchResult } from '@/core/graph/contracts';
import type { Finding } from '@/core/validation/contracts';
import type { Depiction, DepictionOptions, ParseOutcome } from '@/chem/contracts';
import type { ExportOptions, ImportPreview, ImportSource } from '@/io/contracts';
import type { LayoutRequest, LayoutResult } from '@/layout/contracts';
import type { SearchDocument, SearchHit, SearchIndexUpdate, SearchQuery } from '@/search/contracts';

export type RpcErrorCode = 'CANCELLED' | 'TIMEOUT' | 'BAD_REQUEST' | 'WORKER_CRASHED' | 'NOT_READY' | 'INTERNAL';
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
  readonly timeoutMs?: number;
  readonly onProgress?: (done: number, total?: number, note?: string) => void;
}

/** Worker-side API shape: every method takes one structured-cloneable param object. */
export type WorkerApi<T> = { readonly [M in keyof T]: (params: never, ctx: RpcCallContext) => Promise<unknown> };

/** Main-thread proxy derived from a worker API. */
export type RpcClient<T extends Record<string, (params: never, ctx: RpcCallContext) => Promise<unknown>>> = {
  readonly [M in keyof T]: (params: Parameters<T[M]>[0], options?: RpcCallOptions) => ReturnType<T[M]>;
} & { terminate(): void };

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

export interface ComputeWorkerApi {
  loadReplica(params: { readonly state: CanonicalState; readonly revision: number }, ctx: RpcCallContext): Promise<void>;
  /** Replica stays in sync by applying the same ChangeSets as the main store (revision-checked). */
  applyChanges(params: { readonly changes: ChangeSet }, ctx: RpcCallContext): Promise<void>;
  validateAll(params: { readonly revision: number }, ctx: RpcCallContext): Promise<readonly Finding[]>;
  findRoutes(params: RouteQuery, ctx: RpcCallContext): Promise<RouteSearchResult>;
  importPreview(params: { readonly source: ImportSource }, ctx: RpcCallContext): Promise<ImportPreview>;
  buildExport(params: ExportOptions, ctx: RpcCallContext): Promise<Blob>;
}
