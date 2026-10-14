/**
 * How the import screen paces what the writer reports (step 5.11b). Under LONG_AFTER_MS of apply nothing extra is shown (no
 * flicker). After that the screen shows the count, at most 4 times a second (MIN_GAP_MS), with the newest value waiting for its
 * turn so a steady writer is seen at least once a second. A count only rises: the write queue retries a failed write from the
 * start, and the screen must not run backwards. No chemistry, no DOM; the clock is injected.
 */
export interface Progress {
  readonly done: number;
  readonly total: number | null;
}

export interface PaceClock {
  now(): number;
  /** Runs `run` once after `ms`; the returned function cancels it. */
  after(run: () => void, ms: number): () => void;
}

export const LONG_AFTER_MS = 2000;
export const MIN_GAP_MS = 250;

export const realPaceClock: PaceClock = {
  now: () => performance.now(),
  after(run, ms) {
    const handle = setTimeout(run, ms);
    return () => clearTimeout(handle);
  },
};

export interface ApplyPace {
  /** An apply begins: the 2 s wait starts. */
  start(): void;
  /** What the operation reports now; null (a new stage) is ignored. */
  feed(progress: Progress | null | undefined): void;
  /** The apply answered: the newest count is shown at once if the wait was long, and the timers stop. */
  finish(): void;
  /** Stops the timers without showing anything more. */
  stop(): void;
}

export interface PaceView {
  readonly long: boolean;
  readonly progress: Progress | null;
}

export function createApplyPace(clock: PaceClock, onChange: (view: PaceView) => void): ApplyPace {
  let long = false;
  let newest: Progress | null = null;
  let shown: Progress | null = null;
  let shownAt = Number.NEGATIVE_INFINITY;
  let cancelLong: (() => void) | undefined;
  let cancelTurn: (() => void) | undefined;

  const show = (): void => {
    cancelTurn?.();
    cancelTurn = undefined;
    if (!long || newest === null || newest === shown) return;
    shown = newest;
    shownAt = clock.now();
    onChange({ long, progress: shown });
  };
  const publish = (): void => {
    if (!long || newest === null || newest === shown || cancelTurn !== undefined) return;
    const wait = shownAt + MIN_GAP_MS - clock.now();
    if (wait <= 0) show();
    else cancelTurn = clock.after(show, wait);
  };
  const stop = (): void => {
    cancelLong?.();
    cancelTurn?.();
    cancelLong = undefined;
    cancelTurn = undefined;
  };

  return {
    start() {
      stop();
      long = false;
      newest = null;
      shown = null;
      shownAt = Number.NEGATIVE_INFINITY;
      cancelLong = clock.after(() => {
        cancelLong = undefined;
        long = true;
        onChange({ long, progress: shown });
        publish();
      }, LONG_AFTER_MS);
    },
    feed(progress) {
      if (progress === null || progress === undefined) return;
      if (newest !== null && progress.done <= newest.done) return;
      newest = progress;
      publish();
    },
    finish() {
      if (long) show();
      stop();
    },
    stop,
  };
}
