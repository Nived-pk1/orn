/**
 * The window's side of the drafts (ADR-040): the count from the session manager, and the one place that opens the drafts list. The list
 * itself (and later the editors) is a lazy chunk; what is here is only what the entry chunk may hold: the count, the start-up line and
 * a context that says how to open the list.
 */
import { createContext, useContext, useSyncExternalStore } from 'react';
import { useApp } from './context';

/** How the window opens the drafts list; absent in a window that has none (a test of one part). */
export const DraftsOpenContext = createContext<(() => void) | null>(null);
export const useDraftsOpen = (): (() => void) | null => useContext(DraftsOpenContext);

/** The manager's cached view: the same object until something changes. */
export function useDraftsView() {
  const { services } = useApp();
  return useSyncExternalStore(services.drafts.subscribe, services.drafts.view);
}
