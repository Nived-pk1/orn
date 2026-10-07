/**
 * The depiction request queue (step 5.4b; PERFORMANCE_ARCHITECTURE §6). Structures are asked for only at LOD 3, only for species on the
 * screen, and only after the view has been still for `stillMs`. At most `maxPending` requests are in flight; a request whose species
 * left the screen is cancelled. A busy service (a key that is idle right after a request) is retried a bounded number of times and
 * never reaches the user.
 */
import type { DepictionSource } from '@/render/svg';
import { DEPICTION_MAX_PENDING, DEPICTION_STILL_MS } from './contracts';

export const BUSY_RETRY_MS = 500;
export const BUSY_MAX_RETRIES = 5;

export interface QueueDeps {
  readonly source: DepictionSource;
  readonly setTimer: (callback: () => void, ms: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
  readonly stillMs?: number;
  readonly maxPending?: number;
}

export interface DepictionQueue {
  /** The frame hook: the current candidates (nearest first) and LOD. Restarts the stillness timer. */
  readonly update: (candidates: readonly string[], lod: number) => void;
  /** Keys this queue has asked for that have not answered. */
  readonly pending: () => readonly string[];
  readonly dispose: () => void;
}

export function createDepictionQueue(deps: QueueDeps): DepictionQueue {
  const stillMs = deps.stillMs ?? DEPICTION_STILL_MS;
  const maxPending = Math.max(1, deps.maxPending ?? DEPICTION_MAX_PENDING);
  let wanted: readonly string[] = [];
  let timer: unknown;
  let retries = 0;
  let disposed = false;
  /** Keys asked for by this queue and not yet answered. */
  const inFlight = new Set<string>();

  const stop = (): void => {
    if (timer !== undefined) deps.clearTimer(timer);
    timer = undefined;
  };

  const loading = (key: string): boolean => deps.source.snapshot(key).state === 'loading';

  const flush = (): void => {
    timer = undefined;
    if (disposed) return;
    let busy = false;
    for (const key of [...inFlight]) {
      if (!loading(key)) {
        inFlight.delete(key);
        // Idle after a request: the service answered busy (the manager forgot the key). Ask again, a bounded number of times.
        if (deps.source.snapshot(key).state === 'idle') busy = true;
      } else if (!wanted.includes(key)) {
        deps.source.cancel?.(key);
        inFlight.delete(key);
      }
    }
    let waiting = false;
    if (busy) retries += 1;
    const exhausted = retries > BUSY_MAX_RETRIES;
    for (const key of wanted) {
      if (inFlight.has(key)) continue;
      const before = deps.source.snapshot(key).state;
      if (before === 'ready' || before === 'unavailable') continue;
      if (exhausted) continue;
      if (inFlight.size >= maxPending) {
        waiting = true;
        continue;
      }
      deps.source.request(key);
      if (loading(key)) inFlight.add(key);
      else busy = true;
    }
    // Answers arrive without a frame: look again so freed slots are used. A key that stays idle (busy) retries a bounded number of times.
    if (busy && !exhausted) timer = deps.setTimer(flush, BUSY_RETRY_MS);
    else if (waiting || inFlight.size > 0) timer = deps.setTimer(flush, stillMs);
  };

  return {
    update(candidates, lod) {
      if (disposed) return;
      wanted = lod >= 3 ? candidates : [];
      retries = 0;
      stop();
      if (wanted.length === 0) {
        for (const key of inFlight) deps.source.cancel?.(key);
        inFlight.clear();
        return;
      }
      timer = deps.setTimer(flush, stillMs);
    },
    pending: () => [...inFlight],
    dispose() {
      disposed = true;
      stop();
      for (const key of inFlight) deps.source.cancel?.(key);
      inFlight.clear();
    },
  };
}
