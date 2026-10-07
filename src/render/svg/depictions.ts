/**
 * The depiction manager (step 5.4a; SECURITY §2, PERFORMANCE_ARCHITECTURE §6 and §8). A depiction is SANITISED SVG text from the
 * chem service; here it only becomes an image URL (`createUrl`), which the renderer puts in an `<image href>`. Markup is never
 * inlined. Everything is injected (fetch, URL creation and revoking, timers), so it is deterministic and testable; the wiring to the
 * chem service is step 5.5a.
 *
 * - Bounded: an LRU of `capacity` keys (default 500, PERFORMANCE_ARCHITECTURE §8). Loading, ready and unavailable entries all count;
 *   the least recently REQUESTED is dropped, its URL revoked, its timer cleared, and a late answer for it is ignored.
 * - A key that does not answer within `timeoutMs` is `unavailable` (reason "timeout"); so is a failure value, a rejection, or a
 *   `createUrl` that throws. An unavailable key is not asked again while it stays in the cache.
 * - `dispose()` revokes every URL and drops every listener.
 */
import type { DepictionSource, DepictionStatus } from './contracts';

export const DEPICTION_LRU_CAPACITY = 500;
export const DEPICTION_TIMEOUT_MS = 8000;

export type DepictionAnswer = { readonly ok: true; readonly svg: string } | { readonly ok: false; readonly reason: string };

export interface DepictionDeps {
  /** The sanitised SVG text for a depiction key, or a failure value. */
  readonly fetchSvg: (key: string) => Promise<DepictionAnswer>;
  /** SVG text to an image URL (a blob URL in the app). */
  readonly createUrl: (svg: string) => string;
  readonly revokeUrl: (url: string) => void;
  readonly setTimer: (callback: () => void, ms: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
  readonly capacity?: number;
  readonly timeoutMs?: number;
}

export interface DepictionManager extends DepictionSource {
  /** Keys held now (loading, ready or unavailable). */
  readonly size: () => number;
  readonly capacity: number;
  readonly dispose: () => void;
}

interface Entry {
  status: DepictionStatus;
  timer?: unknown;
}

const IDLE: DepictionStatus = { state: 'idle' };
const LOADING: DepictionStatus = { state: 'loading' };

export function createDepictionManager(deps: DepictionDeps): DepictionManager {
  const capacity = Math.max(1, Math.floor(deps.capacity ?? DEPICTION_LRU_CAPACITY));
  const timeoutMs = deps.timeoutMs ?? DEPICTION_TIMEOUT_MS;
  /** Insertion order is recency order: the first key is the least recently requested. */
  const entries = new Map<string, Entry>();
  const listeners = new Map<string, Set<() => void>>();
  let disposed = false;

  const notify = (key: string): void => {
    for (const listener of [...(listeners.get(key) ?? [])]) listener();
  };

  const release = (entry: Entry): void => {
    if (entry.timer !== undefined) deps.clearTimer(entry.timer);
    delete entry.timer;
    if (entry.status.state === 'ready') deps.revokeUrl(entry.status.url);
  };

  /** `make` runs only for a live entry: a late answer must not create a URL that nothing would ever revoke. */
  const settle = (key: string, entry: Entry, make: () => DepictionStatus): void => {
    // An answer for a dropped key, or for one that already timed out, is ignored.
    if (disposed || entries.get(key) !== entry || entry.status.state !== 'loading') return;
    if (entry.timer !== undefined) deps.clearTimer(entry.timer);
    delete entry.timer;
    entry.status = make();
    notify(key);
  };

  const fromAnswer = (answer: DepictionAnswer): DepictionStatus => {
    if (!answer.ok) return { state: 'unavailable', reason: answer.reason };
    try {
      return { state: 'ready', url: deps.createUrl(answer.svg) };
    } catch {
      return { state: 'unavailable', reason: 'url_failed' };
    }
  };

  const evict = (): void => {
    while (entries.size > capacity) {
      const oldest = entries.keys().next().value as string;
      const entry = entries.get(oldest) as Entry;
      entries.delete(oldest);
      release(entry);
      notify(oldest);
    }
  };

  return {
    capacity,
    size: () => entries.size,
    request(key) {
      if (disposed) return;
      const known = entries.get(key);
      if (known !== undefined) {
        entries.delete(key);
        entries.set(key, known);
        return;
      }
      const entry: Entry = { status: LOADING };
      entries.set(key, entry);
      entry.timer = deps.setTimer(() => settle(key, entry, () => ({ state: 'unavailable', reason: 'timeout' })), timeoutMs);
      evict();
      let pending: Promise<DepictionAnswer>;
      try {
        pending = deps.fetchSvg(key);
      } catch {
        settle(key, entry, () => ({ state: 'unavailable', reason: 'fetch_failed' }));
        return;
      }
      pending.then(
        (answer) => settle(key, entry, () => fromAnswer(answer)),
        () => settle(key, entry, () => ({ state: 'unavailable', reason: 'fetch_failed' })),
      );
      notify(key);
    },
    snapshot: (key) => entries.get(key)?.status ?? IDLE,
    subscribe(key, listener) {
      let set = listeners.get(key);
      if (set === undefined) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      return () => {
        const current = listeners.get(key);
        current?.delete(listener);
        if (current?.size === 0) listeners.delete(key);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries.values()) release(entry);
      entries.clear();
      listeners.clear();
    },
  };
}
