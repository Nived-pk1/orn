/**
 * Method specs of the search worker (ADR-034, PERFORMANCE_ARCHITECTURE §3 default timeouts, SEARCH §5). `load`, `search`,
 * `serialize` and `loadSerialized` give the same answer when repeated, so they may be retried once after a crash (D4); `apply`
 * changes the index and is never retried (a restarted worker answers `REVISION_MISMATCH` and the sync loads instead).
 * `search` is 2 s: the budget is 50 ms, so only a hang takes that long; a timeout restarts the worker and the next
 * `apply` finds nothing loaded.
 */
import type { RpcMethodSpecs, SearchWorkerApi } from '@/workers/rpc/contracts';

export const SEARCH_SPECS: RpcMethodSpecs<SearchWorkerApi> = {
  load: { idempotent: true, timeoutMs: 30_000 },
  apply: { idempotent: false, timeoutMs: 5_000 },
  search: { idempotent: true, timeoutMs: 2_000 },
  serialize: { idempotent: true, timeoutMs: 30_000 },
  loadSerialized: { idempotent: true, timeoutMs: 30_000 },
};
