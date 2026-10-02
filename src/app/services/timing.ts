/**
 * The quiet periods of the engine wiring (step 5.1b), all through the injected `env.timers` (nothing here reads a clock).
 * A "debounce" here is the port the engines ask for: `schedule(run)` runs `run` once, `ms` after the first request.
 */
import type { Scheduler } from '@/persistence';

/** L4 checks start this long after the first change that needs one (a burst of edits is checked together). */
export const L4_QUIET_MS = 400;
/** The search sync rebuilds its documents this long after the first change (SEARCH §5: input debounce is 80-120 ms; this is the index). */
export const SEARCH_QUIET_MS = 200;
/** The warm-boot search cache is serialised after the index has been up to date for this long (no commit, no sync pass). */
export const SEARCH_CACHE_QUIET_MS = 5_000;
/** A busy index re-arms the cache timer at most this many times in a row; the next sync pass arms it again. */
export const SEARCH_CACHE_REARMS = 10;

export interface Debounce {
  /** The port: runs `run` after the quiet period. */
  readonly schedule: (run: () => void) => void;
  /** Cancels what is waiting (dispose). */
  cancel(): void;
}

export function createDebounce(timers: Scheduler, ms: number): Debounce {
  let cancelTimer: (() => void) | undefined;
  return {
    schedule(run) {
      cancelTimer?.();
      cancelTimer = timers.after(ms, () => {
        cancelTimer = undefined;
        run();
      });
    },
    cancel() {
      cancelTimer?.();
      cancelTimer = undefined;
    },
  };
}
