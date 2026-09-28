/**
 * Diagnostics events the persistence layer reports instead of hiding (CLAUDE.md §1.5). Not part of the
 * contract: an implementation option (`onEvent`); the Diagnostics panel (Phase 9) is the eventual consumer.
 */
export type PersistenceEvent =
  | { readonly type: 'derived_cache_evicted'; readonly rows: number; readonly bytes: number; readonly reason: 'quota' | 'soft_cap' }
  | { readonly type: 'derived_cache_error'; readonly operation: 'put' | 'get'; readonly message: string }
  | { readonly type: 'status_listener_error'; readonly message: string }
  | { readonly type: 'snapshots_pruned'; readonly ids: readonly string[] }
  | { readonly type: 'periodic_snapshot_failed'; readonly message: string }
  /** The change message could not be posted: followers catch up at the next message, or by reloading (never a write failure). */
  | { readonly type: 'channel_error'; readonly message: string };

export type PersistenceEventSink = (event: PersistenceEvent) => void;

/** Injected timer: runs `run` after `ms` and returns its canceller. The real one wraps setTimeout. */
export interface Scheduler {
  after(ms: number, run: () => void): () => void;
}

export const realScheduler: Scheduler = {
  after(ms, run) {
    const handle = setTimeout(run, ms);
    return () => clearTimeout(handle);
  },
};

const MESSAGE_LIMIT = 500;

export function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.length > MESSAGE_LIMIT ? `${text.slice(0, MESSAGE_LIMIT)}…` : text;
}

/** Dexie wraps the browser's QuotaExceededError (`inner`); look through at most three layers. */
export function isQuotaError(error: unknown, depth = 0): boolean {
  if (typeof error !== 'object' || error === null || depth > 3) return false;
  const { name, inner } = error as { name?: unknown; inner?: unknown };
  return name === 'QuotaExceededError' || isQuotaError(inner, depth + 1);
}
