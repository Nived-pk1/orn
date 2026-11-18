/**
 * Whether the first-run tour was seen or skipped (step 8.4g Part B, G4): one optional tolerant `uiState` key (`tourDone` = `{ done: true }`; anything
 * else is "not done"), no schema, import-format or persistence version change. A tab that cannot write keeps it in memory only. Not canonical.
 */
import type { AppServices } from '@/app/services';

export const TOUR_KEY = 'tourDone';

export type TourServices = Partial<Pick<AppServices, 'bootReport' | 'persistence' | 'status'>>;

export interface TourFlag {
  done(): boolean;
  finish(): void;
  subscribe(listener: () => void): () => void;
}

export function createTourFlag(services: TourServices = {}): TourFlag {
  const stored = services.bootReport?.uiState[TOUR_KEY];
  let done = typeof stored === 'object' && stored !== null && !Array.isArray(stored) && (stored as { done?: unknown }).done === true;
  const listeners = new Set<() => void>();
  return {
    done: () => done,
    finish() {
      if (done) return;
      done = true;
      for (const listener of listeners) listener();
      if (services.persistence === undefined || services.status?.get().mode !== 'writer') return;
      void services.persistence.setUiState(TOUR_KEY, { done: true }).catch(() => undefined);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** Always done: nothing is shown (a window without the services, Studio, a test). */
export const TOUR_DONE: TourFlag = { done: () => true, finish: () => undefined, subscribe: () => () => undefined };
