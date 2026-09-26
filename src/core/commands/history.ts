/**
 * Linear undo/redo history (docs/ARCHITECTURE.md §23). Capacity: 500 entries or 50 MB of patches,
 * oldest dropped first; the newest entry is always kept, even if it alone exceeds the byte cap.
 * Sizes are estimated from the JSON length of the patches (UTF-16 units, close enough for a cap).
 */
import type { HistoryEntry } from './contracts';

export interface HistoryLimits {
  readonly maxEntries: number;
  readonly maxBytes: number;
}

export const DEFAULT_HISTORY_LIMITS: HistoryLimits = { maxEntries: 500, maxBytes: 50 * 1024 * 1024 };

interface Stored {
  readonly entry: HistoryEntry;
  readonly bytes: number;
}

export interface History {
  /** Records a new commit: clears redo, then trims the oldest entries beyond the limits. */
  record(entry: HistoryEntry): void;
  peekUndo(): HistoryEntry | undefined;
  peekRedo(): HistoryEntry | undefined;
  /** Moves the newest undo entry to the redo stack (after a successful undo). */
  markUndone(): void;
  /** Moves the newest redo entry back to the undo stack (after a successful redo). */
  markRedone(): void;
  clear(): void;
  /** Newest first: the label of the entry the next undo (redo) would act on comes first. */
  labels(): { readonly undo: readonly string[]; readonly redo: readonly string[] };
}

const sizeOf = (entry: HistoryEntry): number =>
  JSON.stringify(entry.patches).length + JSON.stringify(entry.inversePatches).length;

export function createHistory(limits: HistoryLimits = DEFAULT_HISTORY_LIMITS): History {
  const undo: Stored[] = [];
  const redo: Stored[] = [];
  let undoBytes = 0;

  const trim = (): void => {
    while (undo.length > 1 && (undo.length > limits.maxEntries || undoBytes > limits.maxBytes)) {
      undoBytes -= (undo.shift() as Stored).bytes;
    }
  };

  return {
    record(entry) {
      redo.length = 0;
      const stored = { entry, bytes: sizeOf(entry) };
      undo.push(stored);
      undoBytes += stored.bytes;
      trim();
    },
    peekUndo: () => undo[undo.length - 1]?.entry,
    peekRedo: () => redo[redo.length - 1]?.entry,
    markUndone() {
      const stored = undo.pop();
      if (stored === undefined) return;
      undoBytes -= stored.bytes;
      redo.push(stored);
    },
    markRedone() {
      const stored = redo.pop();
      if (stored === undefined) return;
      undo.push(stored);
      undoBytes += stored.bytes;
      trim();
    },
    clear() {
      undo.length = 0;
      redo.length = 0;
      undoBytes = 0;
    },
    labels: () => ({
      undo: undo.map((stored) => stored.entry.label).reverse(),
      redo: redo.map((stored) => stored.entry.label).reverse(),
    }),
  };
}
