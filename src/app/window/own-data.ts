/**
 * Whether this browser holds data the visitor imported themselves (step 8.3, ADR-045). The published chemistry is re-loaded from the site, so
 * only an own import is worth a storage warning and a saved line. It is kept in `uiState` under the key `studyOwnData` (`{ own: true }`),
 * which is read tolerantly at boot (anything else is "no"): no schema, import-format or persistence version changes. An own import marks
 * it (a writer tab only; it is true at once in this tab either way); loading the published dataset over the data clears it. Not canonical:
 * it only decides what the window shows.
 */
import type { AppServices } from '@/app/services';

export const OWN_DATA_KEY = 'studyOwnData';

export interface OwnData {
  get(): boolean;
  /** An own import was applied. */
  mark(): void;
  /** The published dataset replaced the data. */
  clear(): void;
  subscribe(listener: () => void): () => void;
}

const ownOf = (entry: unknown): boolean => typeof entry === 'object' && entry !== null && !Array.isArray(entry) && (entry as { own?: unknown }).own === true;

export function createOwnData(services: Partial<Pick<AppServices, 'bootReport' | 'persistence' | 'status'>> = {}): OwnData {
  let own = ownOf(services.bootReport?.uiState[OWN_DATA_KEY]);
  const listeners = new Set<() => void>();
  const set = (next: boolean): void => {
    if (next === own) return;
    own = next;
    for (const listener of listeners) listener();
    if (services.persistence === undefined || services.status?.get().mode !== 'writer') return;
    // a write that fails is not an error of the import: the line is simply not there at the next visit
    void services.persistence.setUiState(OWN_DATA_KEY, { own: next }).catch(() => undefined);
  };
  return {
    get: () => own,
    mark: () => set(true),
    clear: () => set(false),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** No own data, ever (a window without the services, a test). */
export const NO_OWN_DATA: OwnData = { get: () => false, mark: () => undefined, clear: () => undefined, subscribe: () => () => undefined };
