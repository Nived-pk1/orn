/** Helpers for the editor-session tests: a context with a movable clock and counting IDs. Test-only. */
import type { CommandContext } from '@/core/commands';

export interface ClockContext extends CommandContext {
  /** Moves the clock to `ms` milliseconds after the epoch of the test. */
  set(ms: number): void;
  advance(ms: number): void;
}

const EPOCH_MS = Date.UTC(2026, 9, 17, 12, 0, 0);

export function clockContext(): ClockContext {
  let at = 0;
  let n = 0;
  return {
    now: () => new Date(EPOCH_MS + at).toISOString(),
    newId: (prefix) => `${prefix}_t${String(++n).padStart(4, '0')}`,
    set: (ms) => {
      at = ms;
    },
    advance: (ms) => {
      at += ms;
    },
  };
}
