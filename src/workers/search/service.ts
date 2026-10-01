/**
 * The main thread's side of the search worker (step 4.5, ports only: an `RpcClient<SearchWorkerApi>`). Every call answers a
 * value, never an exception:
 *   - a query the engine would refuse (`checkQuery`) is `BAD_REQUEST` without a call;
 *   - a newer `search` on the same channel (the palette, a list filter) supersedes the older: the older is cancelled and answers
 *     `CANCELLED`, its result dropped even if the worker finished it (a search is synchronous in the worker);
 *   - `search` before anything is loaded (a fresh or restarted worker) is `NOT_READY`, never an empty list passed off as an answer;
 *   - `search` and `load` are retried once after a crash (D4); `apply` never is.
 * A reply that is not `ok` carries the RPC error code.
 */
import { checkQuery } from '@/search/engine';
import type { ApplyAnswer, LoadSerializedAnswer, SearchDocument, SearchHit, SearchIndexUpdate, SearchQuery, SerializedSearchIndex } from '@/search/contracts';
import { callWithRetry } from '@/workers/rpc/retry';
import type { RpcCallOptions, RpcClient, RpcErrorCode, SearchWorkerApi } from '@/workers/rpc/contracts';
import { SEARCH_SPECS } from './specs';

export type SearchOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: RpcErrorCode; readonly message: string };

export interface SearchService {
  /** Replaces the worker's index. */
  load(documents: readonly SearchDocument[], revision: number, options?: Pick<RpcCallOptions, 'timeoutMs'>): Promise<SearchOutcome<void>>;
  apply(update: SearchIndexUpdate): Promise<SearchOutcome<ApplyAnswer>>;
  /** `channel` names the caller (a palette, a filtered list): a newer query on the same channel supersedes the older. */
  search(channel: string, query: SearchQuery): Promise<SearchOutcome<readonly SearchHit[]>>;
  serialize(): Promise<SearchOutcome<SerializedSearchIndex>>;
  loadSerialized(index: SerializedSearchIndex): Promise<SearchOutcome<LoadSerializedAnswer>>;
  /** Queries cancelled by a newer one so far. */
  superseded(): number;
}

export interface SearchServiceOptions {
  readonly client: RpcClient<SearchWorkerApi>;
}

export function createSearchService({ client }: SearchServiceOptions): SearchService {
  const running = new Map<string, AbortController>();
  let superseded = 0;

  const wrap = async <T>(call: Promise<{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code: RpcErrorCode; readonly message: string } }>): Promise<SearchOutcome<T>> => {
    const result = await call;
    return result.ok ? { ok: true, value: result.value } : { ok: false, code: result.error.code, message: result.error.message };
  };

  return {
    load: (documents, revision, options) => wrap(callWithRetry(client, SEARCH_SPECS, 'load', { documents, revision }, options)),
    apply: (update) => wrap(callWithRetry(client, SEARCH_SPECS, 'apply', update)),
    async search(channel, query) {
      const problem = checkQuery(query);
      if (problem !== undefined) return { ok: false, code: 'BAD_REQUEST', message: problem };
      const earlier = running.get(channel);
      if (earlier !== undefined) {
        earlier.abort();
        superseded += 1;
      }
      const mine = new AbortController();
      running.set(channel, mine);
      try {
        const outcome = await wrap(callWithRetry(client, SEARCH_SPECS, 'search', query, { signal: mine.signal }));
        if (mine.signal.aborted) return { ok: false, code: 'CANCELLED', message: 'a newer query on this channel replaced this one' };
        return outcome;
      } finally {
        if (running.get(channel) === mine) running.delete(channel);
      }
    },
    serialize: () => wrap(callWithRetry(client, SEARCH_SPECS, 'serialize', {})),
    loadSerialized: (index) => wrap(callWithRetry(client, SEARCH_SPECS, 'loadSerialized', index)),
    superseded: () => superseded,
  };
}
