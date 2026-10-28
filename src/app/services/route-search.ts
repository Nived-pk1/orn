/**
 * Route search from the app (step 7.2a C3): the compute worker's `findRoutes` (the worker holds the replica and the indexes, so no new
 * worker code and nothing on the main thread). One function: the query and an optional signal in, a value out, never a throw. The engine's
 * own time budget stays in the query's limits; a cancelled search is `cancelled`, a worker that cannot answer is a message in words.
 */
import type { StoreHandle } from '@/core/commands';
import type { RouteQuery, RouteSearchResult } from '@/core/graph';
import type { ReplicaSync } from '@/workers/compute';

export type RouteSearchAnswer =
  | { readonly ok: true; readonly result: RouteSearchResult }
  | { readonly ok: false; readonly message: string; readonly cancelled?: true };

export type RouteSearch = (query: RouteQuery, signal?: AbortSignal) => Promise<RouteSearchAnswer>;

export interface RouteSearchOptions {
  readonly store: Pick<StoreHandle, 'getRevision'>;
  readonly sync: () => ReplicaSync | undefined;
}

const NOT_RUNNING = 'Route search is not available because the checking worker is not running.';
const NOT_ANSWERED = 'Route search did not answer. Try again.';
const BEHIND = 'Route search is catching up with your last change. Try again in a moment.';

export function createRouteSearch(options: RouteSearchOptions): RouteSearch {
  return async (query, signal) => {
    const sync = options.sync();
    if (sync === undefined || sync.status().state === 'down') return { ok: false, message: NOT_RUNNING };
    const ask = () => sync.client.findRoutes({ revision: options.store.getRevision(), query }, signal === undefined ? {} : { signal });
    let answer = await ask();
    // The replica follows the store a moment behind an edit: wait for it once, then ask again.
    if (answer.ok && !answer.value.ok && answer.value.code === 'REPLICA_STALE') {
      await sync.settled();
      answer = await ask();
    }
    if (!answer.ok) return answer.error.code === 'CANCELLED' ? { ok: false, cancelled: true, message: 'The search was stopped.' } : { ok: false, message: NOT_ANSWERED };
    if (!answer.value.ok) return { ok: false, message: BEHIND };
    return { ok: true, result: answer.value.result };
  };
}
