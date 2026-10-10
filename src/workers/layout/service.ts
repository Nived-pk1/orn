/**
 * The main thread's side of the layout worker (step 4.4, ports only: an `RpcClient<LayoutWorkerApi>`, nothing else). One call per
 * view: `layout(view, request)`.
 *   - A request the caps or the shape rule refuse is a VALUE (`TOO_LARGE`, `BAD_REQUEST`), never sent.
 *   - Results are cached by `cacheKey` (LRU, `LAYOUT_CACHE_SIZE` entries in memory, and, through the optional `persist` port, in
 *     `derivedCache` so a reload finds them: step 5.5d; a stored layout is checked against the request before it is used). Only
 *     answers that are a pure function of the request are cached: ELK's, and the fallback's after an ELK error. A fallback that
 *     came from a timeout or an unavailable worker is not (the next request tries ELK again).
 *   - A newer request for the same view supersedes the older: the older call is cancelled and answers `CANCELLED`, its result is
 *     dropped even if the worker finishes it (a running ELK cannot be interrupted).
 *   - A call that runs into its 2 s limit is `TIMEOUT`: the RPC client has terminated and restarted the worker, and the service
 *     asks the NEW worker for the fallback layout (`fallbackReason: 'timeout'`). The same for a worker that crashed twice or is
 *     busy or not ready (`'engine_unavailable'`). If no worker can answer, the result is `UNAVAILABLE` as a value: there is NEVER a
 *     layout on the main thread (PERFORMANCE_ARCHITECTURE §11).
 *   - Engine start-up (step 5.0, Q7): `warmUp` is sent before the first real layout and the calls wait behind it (`gate`; create the
 *     client with `onRestart: gate.onRestart`). If ELK cannot load, the answer is the fallback layout (`engine_unavailable`), never a
 *     restart loop; a warm-up the RPC layer could not answer is an ordinary RPC failure (`TIMEOUT` past `ENGINE_LOAD_TIMEOUT_MS`:
 *     restart, then the fallback with `'timeout'`).
 * No layout code runs here; the pure request checks and the cache key are shared with the worker.
 */
import { layoutCacheKey } from '@/layout/cache-key';
import { LruCache } from '@/layout/lru';
import { checkRequest } from '@/layout/validate';
import { MAX_STRESS_NODES, type FallbackReason, type LayoutRequest, type LayoutResult } from '@/layout/contracts';
import { callWithRetry } from '@/workers/rpc/retry';
import type { LayoutWorkerApi, RpcCallOptions, RpcClient, RpcError, RpcResult } from '@/workers/rpc/contracts';
import type { WarmUpGate } from '@/workers/rpc/warm-up';
import { LAYOUT_SPECS } from './specs';

/** Layouts kept by cache key (the largest, 2,000 nodes, is a few hundred KB; 32 of the usual 400-node ones are a few MB). */
export const LAYOUT_CACHE_SIZE = 32;

export type LayoutOutcome =
  | { readonly ok: true; readonly result: LayoutResult; readonly cached: boolean }
  | { readonly ok: false; readonly code: 'CANCELLED' | 'BAD_REQUEST' | 'TOO_LARGE' | 'UNAVAILABLE'; readonly message: string };

export interface LayoutServiceStats {
  readonly cacheHits: number;
  readonly cacheSize: number;
  /** Calls the worker answered with ELK's result. */
  readonly elk: number;
  /** Answers that were the fallback layout, by reason. */
  readonly fallback: Readonly<Record<FallbackReason, number>>;
  readonly superseded: number;
  readonly unavailable: number;
  /** Answers read from the persisted cache, and answers the store refused (step 5.5d). */
  readonly persisted?: { readonly hits: number; readonly rejected: number; readonly refused: number };
}

export interface LayoutService {
  layout(view: string, request: LayoutRequest, options?: Pick<RpcCallOptions, 'timeoutMs'>): Promise<LayoutOutcome>;
  stats(): LayoutServiceStats;
}

/** A layout the store could not take: a status for the caller, never an error (the cache is disposable). */
export type LayoutPutOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * Where layouts survive a reload (step 5.5d, item h; additive). The service asks `get` after a memory miss and tells `put` about every
 * answer it caches. Both are best effort: `get` answers undefined on a miss or a failure, `put` answers a value.
 */
export interface LayoutPersistPort {
  get(key: string): Promise<LayoutResult | undefined>;
  put(key: string, result: LayoutResult): Promise<LayoutPutOutcome>;
}

export interface LayoutServiceOptions {
  readonly client: RpcClient<LayoutWorkerApi>;
  /** One gate per client (the client's `onRestart` is `gate.onRestart`). */
  readonly gate: WarmUpGate<LayoutWorkerApi>;
  /** Default `LAYOUT_CACHE_SIZE`. */
  readonly cacheSize?: number;
  /** Absent: the cache is memory only. */
  readonly persist?: LayoutPersistPort;
}

/** A stored result is used only if it carries this request's key and a position for every node and a route for every edge between two nodes. */
function answers(result: LayoutResult, request: LayoutRequest, key: string): boolean {
  if (result.cacheKey !== key || typeof result.positions !== 'object' || result.positions === null) return false;
  if (!request.nodes.every((node) => result.positions[node.id] !== undefined)) return false;
  const routes = result.edgeRoutes as Record<string, unknown> | undefined;
  return routes !== undefined && request.edges.every((edge) => edge.from === edge.to || routes[edge.id] !== undefined);
}

const describe = (error: RpcError): string => `${error.code}: ${error.message}`;

export function createLayoutService(options: LayoutServiceOptions): LayoutService {
  const { client } = options;
  const cache = new LruCache<LayoutResult>(options.cacheSize ?? LAYOUT_CACHE_SIZE);
  const running = new Map<string, { readonly controller: AbortController }>();
  let hits = 0;
  let elk = 0;
  let superseded = 0;
  let unavailable = 0;
  const persisted = { hits: 0, rejected: 0, refused: 0 };
  const fallback: Record<FallbackReason, number> = { timeout: 0, elk_error: 0, engine_unavailable: 0 };

  const cancelled: LayoutOutcome = { ok: false, code: 'CANCELLED', message: 'a newer layout request for this view replaced this one' };

  async function run(view: string, request: LayoutRequest, call?: Pick<RpcCallOptions, 'timeoutMs'>): Promise<LayoutOutcome> {
    const problem = checkRequest(request);
    if (problem !== undefined) return { ok: false, code: problem.code, message: problem.message };
    const earlier = running.get(view);
    if (earlier !== undefined) {
      earlier.controller.abort();
      superseded += 1;
    }
    const key = layoutCacheKey(request);
    const hit = cache.get(key);
    if (hit !== undefined) {
      running.delete(view);
      hits += 1;
      return { ok: true, result: { ...hit, requestId: request.requestId }, cached: true };
    }
    const mine = { controller: new AbortController() };
    running.set(view, mine);
    const stored = options.persist === undefined ? undefined : await fromStore(key, request);
    if (mine.controller.signal.aborted) return cancelled;
    if (stored !== undefined) {
      cache.set(key, stored);
      persisted.hits += 1;
      if (running.get(view) === mine) running.delete(view);
      return { ok: true, result: { ...stored, requestId: request.requestId }, cached: true };
    }
    const options_: RpcCallOptions = { signal: mine.controller.signal, ...(call?.timeoutMs === undefined ? {} : { timeoutMs: call.timeoutMs }) };
    try {
      // the grid layout does not use ELK, so it does not wait for ELK to load
      const warm = request.algorithm === 'grid' ? ({ ok: true } as const) : await options.gate.ready(client, LAYOUT_SPECS);
      if (mine.controller.signal.aborted) return cancelled;
      const first: RpcResult<LayoutResult> = warm.ok
        ? await callWithRetry(client, LAYOUT_SPECS, 'layout', request, options_)
        : { ok: false, error: warm.reason === 'rpc' ? warm.error : { code: 'NOT_READY', message: warm.message } };
      if (mine.controller.signal.aborted) return cancelled;
      if (first.ok) {
        const result = first.value;
        if (result.engine === 'elk') elk += 1;
        else if (result.fallbackReason !== undefined) fallback[result.fallbackReason] += 1;
        if (result.engine === 'elk' || result.engine === 'grid' || result.fallbackReason === 'elk_error') {
          cache.set(key, result);
          void toStore(key, result);
        }
        return { ok: true, result, cached: false };
      }
      if (first.error.code === 'CANCELLED') return cancelled;
      if (first.error.code === 'BAD_REQUEST') return { ok: false, code: 'BAD_REQUEST', message: first.error.message };
      // ELK did not answer (timeout: the worker was terminated and restarted; crash; busy; not ready): the NEW worker's fallback
      const reason: FallbackReason = first.error.code === 'TIMEOUT' ? 'timeout' : 'engine_unavailable';
      const second = await callWithRetry(client, LAYOUT_SPECS, 'layoutFallback', { request, reason }, options_);
      if (mine.controller.signal.aborted) return cancelled;
      if (second.ok) {
        fallback[second.value.fallbackReason ?? reason] += 1;
        return { ok: true, result: second.value, cached: false };
      }
      if (second.error.code === 'CANCELLED') return cancelled;
      unavailable += 1;
      return { ok: false, code: 'UNAVAILABLE', message: `layout is unavailable: ELK did not answer (${describe(first.error)}) and neither did the fallback (${describe(second.error)})` };
    } finally {
      if (running.get(view) === mine) running.delete(view);
    }
  }

  /** A stored layout of this request, or undefined: a miss, a failure, or a row that does not answer the request (counted, never used). */
  async function fromStore(key: string, request: LayoutRequest): Promise<LayoutResult | undefined> {
    if (options.persist === undefined) return undefined;
    let row: LayoutResult | undefined;
    try {
      row = await options.persist.get(key);
    } catch {
      return undefined;
    }
    if (row === undefined) return undefined;
    if (!answers(row, request, key)) {
      persisted.rejected += 1;
      return undefined;
    }
    return row;
  }

  async function toStore(key: string, result: LayoutResult): Promise<void> {
    if (options.persist === undefined) return;
    try {
      const put = await options.persist.put(key, result);
      if (!put.ok) persisted.refused += 1;
    } catch {
      persisted.refused += 1;
    }
  }

  /** Stress over `MAX_STRESS_NODES` nodes is laid out with ELK layered; the result says so (never silent), cached or not. */
  async function layout(view: string, request: LayoutRequest, call?: Pick<RpcCallOptions, 'timeoutMs'>): Promise<LayoutOutcome> {
    if (request.algorithm !== 'stress' || request.nodes.length <= MAX_STRESS_NODES) return run(view, request, call);
    const outcome = await run(view, { ...request, algorithm: 'layered' }, call);
    if (!outcome.ok) return outcome;
    const note = `stress layout is limited to ${MAX_STRESS_NODES} nodes (this request has ${request.nodes.length}): laid out with ELK layered instead`;
    return { ...outcome, result: { ...outcome.result, notes: [...outcome.result.notes, note].sort() } };
  }

  return {
    layout,
    stats: () => ({ cacheHits: hits, cacheSize: cache.size, elk, fallback: { ...fallback }, superseded, unavailable, persisted: { ...persisted } }),
  };
}
