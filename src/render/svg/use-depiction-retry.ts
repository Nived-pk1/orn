/**
 * (Moved from the navigator in step 5.6a so that the inspector shares it.) A structure for a mounted card (step 5.5b; docs/PERFORMANCE_ARCHITECTURE.md §6, §8). The page asks the depiction manager for a key
 * only while a card that shows it is mounted, and cancels it when the last such card goes (several cards may show the same species:
 * a count per manager and key). A key that comes back idle (the service was busy, or another card's cancel dropped it) is asked for
 * again a bounded number of times, a little later each time; after that the card shows the name. `BUSY` never reaches the user.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { DepictionStatus } from './contracts';
import type { DepictionManager } from './depictions';

/** The timers the hook needs: a delayed call that answers its own cancel. */
export interface DepictionTimers {
  after(ms: number, run: () => void): () => void;
}

export const MAX_DEPICTION_RETRIES = 3;
export const RETRY_DELAY_MS = 250;

const IDLE: DepictionStatus = { state: 'idle' };
const NO_UNSUBSCRIBE = (): void => undefined;

const holders = new WeakMap<DepictionManager, Map<string, number>>();

function acquire(manager: DepictionManager, key: string): void {
  let counts = holders.get(manager);
  if (counts === undefined) holders.set(manager, (counts = new Map()));
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Drops one holder; answers how many are left. */
function release(manager: DepictionManager, key: string): number {
  const counts = holders.get(manager);
  const left = (counts?.get(key) ?? 1) - 1;
  if (left <= 0) counts?.delete(key);
  else counts?.set(key, left);
  return Math.max(left, 0);
}

export function useRetryingDepiction(manager: DepictionManager | undefined, key: string | undefined, timers: DepictionTimers): DepictionStatus {
  const subscribe = useCallback((listener: () => void) => (manager === undefined || key === undefined ? NO_UNSUBSCRIBE : manager.subscribe(key, listener)), [manager, key]);
  const snapshot = useCallback(() => (manager === undefined || key === undefined ? IDLE : manager.snapshot(key)), [manager, key]);
  const asked_ = useSyncExternalStore(subscribe, snapshot, snapshot);
  // A drawing that is shown is never replaced by the placeholder while a redraw is on its way (step 8.4m2, B3): the last ready answer for this key is kept
  // until the new one is ready. It goes with the key: another key never shows it.
  const shown = useRef<{ readonly key: string; readonly status: DepictionStatus } | undefined>(undefined);
  if (asked_.state === 'ready' && key !== undefined) shown.current = { key, status: asked_ };
  const status = asked_.state !== 'ready' && key !== undefined && shown.current?.key === key && asked_.state !== 'unavailable' ? shown.current.status : asked_;
  const retries = useRef(0);
  // Counts the retries made, so the effect below runs again even when the key comes back idle before React saw it loading.
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    if (manager === undefined || key === undefined) return undefined;
    retries.current = 0;
    acquire(manager, key);
    manager.request(key);
    return () => {
      if (release(manager, key) === 0) manager.cancel(key);
    };
  }, [manager, key]);
  const state = asked_.state; // the retries follow what the manager says, not what is kept on screen
  useEffect(() => {
    if (manager === undefined || key === undefined || state !== 'idle' || retries.current >= MAX_DEPICTION_RETRIES) return undefined;
    const attempt = retries.current + 1;
    return timers.after(RETRY_DELAY_MS * attempt, () => {
      retries.current = attempt;
      manager.request(key);
      setAsked(attempt);
    });
  }, [manager, key, state, timers, asked]);
  return status;
}
