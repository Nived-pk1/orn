/**
 * The depiction service (step 5.1b, headless, main side; Phase 5 contract decisions Q5 e and Q7). It asks the chem service for
 * SANITISED SVG TEXT and answers it or a failure value. It makes no object URL (that is a browser API: step 5.4a).
 *   - At most `MAX_DEPICTIONS_IN_FLIGHT` (4) calls to the worker at once; the rest wait in a FIFO queue. The chem client allows 16
 *     calls in flight, so with this cap a depiction can never be answered `BUSY`, and the L4 checks sharing the client keep room.
 *   - Identical requests (same key) share one call.
 *   - `cancel(key)` drops a queued request (its callers get `cancelled`) and ignores the answer of a running one (the callers get
 *     `cancelled` at once; the worker's answer is dropped, not cached).
 *   - A memory LRU of `DEPICTION_CACHE_SIZE` drawings, keyed by `depictionKeyOf`. Only drawings are cached, never a failure: an
 *     engine that was unavailable may be fine after a retry.
 * The key is a stable hash of (format, value, options), NOT of the toolkit: it names a request, so it is known before the answer
 * (the worker's own `Depiction.key` adds the toolkit and its version for its internal cache).
 */
import { depictionDetails, type DepictionOptions } from '@/chem';
import { LruCache } from '@/chem/lru';
import { hashParts } from '@/core/hash';
import type { StructureRep } from '@/core/schema';
import type { ChemService } from '@/workers/chem';

/** Calls to the chem worker at once. */
export const MAX_DEPICTIONS_IN_FLIGHT = 4;
/** Drawings kept in memory (a sanitised drawing is a few KB, so this is a few MB at most). */
export const DEPICTION_CACHE_SIZE = 256;
/** Requests waiting for a slot; one more is answered `queue_full`. */
export const MAX_DEPICTION_QUEUE = 2_000;

export type DepictionResult =
  | { readonly ok: true; readonly key: string; readonly svg: string; readonly width: number; readonly height: number; readonly cached: boolean }
  | { readonly ok: false; readonly key: string; readonly reason: 'unavailable' | 'timeout' | 'invalid' | 'refused' | 'cancelled' | 'queue_full' | 'bad_options'; readonly message: string };

export interface DepictionStats {
  readonly inFlight: number;
  readonly queued: number;
  /** The most calls to the worker ever at once. */
  readonly maxInFlight: number;
  readonly cacheSize: number;
  readonly cacheHits: number;
  /** Calls made to the worker. */
  readonly calls: number;
}

export interface DepictionService {
  depict(structure: StructureRep, options: DepictionOptions): Promise<DepictionResult>;
  cancel(key: string): void;
  stats(): DepictionStats;
  /** Answers every waiting request `cancelled` and ignores what is running. */
  dispose(): void;
}

/** The request's name: a stable hash of format, value and the options in their fixed order. */
export function depictionKeyOf(structure: StructureRep, options: DepictionOptions): string {
  const details = depictionDetails(options);
  return hashParts(['depiction', structure.format, structure.value, String(details.width), String(details.height), String(details.showAtomMaps), details.highlightAtomMaps.join(','), details.mode]);
}

interface Entry {
  readonly key: string;
  readonly structure: StructureRep;
  readonly options: DepictionOptions;
  readonly waiters: ((result: DepictionResult) => void)[];
  running: boolean;
  cancelled: boolean;
}

export function createDepictionService(chem: Pick<ChemService, 'depict'>): DepictionService {
  const cache = new LruCache<{ svg: string; width: number; height: number }>(DEPICTION_CACHE_SIZE);
  const entries = new Map<string, Entry>();
  const queue: Entry[] = [];
  let inFlight = 0;
  let maxSeen = 0;
  let hits = 0;
  let calls = 0;
  let disposed = false;

  const settle = (entry: Entry, result: DepictionResult): void => {
    if (entries.get(entry.key) === entry) entries.delete(entry.key);
    for (const waiter of entry.waiters.splice(0)) waiter(result);
  };
  const cancelled = (key: string): DepictionResult => ({ ok: false, key, reason: 'cancelled', message: 'the depiction was cancelled' });

  function pump(): void {
    while (!disposed && inFlight < MAX_DEPICTIONS_IN_FLIGHT) {
      const entry = queue.shift();
      if (entry === undefined) return;
      if (entry.cancelled) continue;
      entry.running = true;
      inFlight += 1;
      maxSeen = Math.max(maxSeen, inFlight);
      calls += 1;
      void chem.depict(entry.structure, entry.options).then(
        (outcome) => finish(entry, outcome),
        (error: unknown) => finish(entry, { ok: false, reason: 'unavailable', error: error instanceof Error ? error.message : String(error) }),
      );
    }
  }

  function finish(entry: Entry, outcome: Awaited<ReturnType<ChemService['depict']>>): void {
    inFlight -= 1;
    if (!entry.cancelled && !disposed) {
      if (outcome.ok) {
        const { svg, width, height } = outcome.depiction;
        cache.set(entry.key, { svg, width, height });
        settle(entry, { ok: true, key: entry.key, svg, width, height, cached: false });
      } else {
        settle(entry, { ok: false, key: entry.key, reason: outcome.reason, message: outcome.error });
      }
    }
    pump();
  }

  return {
    depict(structure, options) {
      let key: string;
      try {
        key = depictionKeyOf(structure, options);
      } catch (error) {
        return Promise.resolve({ ok: false, key: '', reason: 'bad_options', message: error instanceof Error ? error.message : String(error) });
      }
      if (disposed) return Promise.resolve(cancelled(key));
      const hit = cache.get(key);
      if (hit !== undefined) {
        hits += 1;
        return Promise.resolve({ ok: true, key, ...hit, cached: true });
      }
      return new Promise<DepictionResult>((resolve) => {
        const shared = entries.get(key);
        if (shared !== undefined) {
          shared.waiters.push(resolve);
          return;
        }
        if (queue.length >= MAX_DEPICTION_QUEUE) {
          resolve({ ok: false, key, reason: 'queue_full', message: `more than ${MAX_DEPICTION_QUEUE} depictions are waiting` });
          return;
        }
        const entry: Entry = { key, structure, options, waiters: [resolve], running: false, cancelled: false };
        entries.set(key, entry);
        queue.push(entry);
        pump();
      });
    },
    cancel(key) {
      const entry = entries.get(key);
      if (entry === undefined) return;
      entry.cancelled = true;
      const at = queue.indexOf(entry);
      if (!entry.running && at >= 0) queue.splice(at, 1);
      settle(entry, cancelled(key));
    },
    stats: () => ({ inFlight, queued: queue.length, maxInFlight: maxSeen, cacheSize: cache.size, cacheHits: hits, calls }),
    dispose() {
      disposed = true;
      for (const entry of [...entries.values()]) {
        entry.cancelled = true;
        settle(entry, cancelled(entry.key));
      }
      queue.length = 0;
    },
  };
}
