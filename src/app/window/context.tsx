/**
 * The ONE services provider (step 5.1d, E1): React gets the headless services and the few browser actions the window needs from
 * this context, and nowhere else. Components read it with `useApp()`; a test passes fakes.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { AppServices } from '@/app/services';
import type { InspectorPorts } from '@/features/inspector';
import type { NavigatorPorts } from '@/features/navigator';
import type { PanelsStore } from '@/ui/state';
import type { TimeFormatter } from './local-time';

/** What the window needs from the services (so a test can fake only these). */
export type WindowServices = Pick<AppServices, 'store' | 'status' | 'flows' | 'saveEverythingNow' | 'retryReplica' | 'retryEngine' | 'search' | 'drafts'> & Partial<Pick<AppServices, 'searchSync'>>;

export type DemoLoad = { readonly ok: true; readonly blob: Blob; readonly fileName: string } | { readonly ok: false; readonly message: string };

export interface AppContextValue {
  readonly services: WindowServices;
  /** The bundled demo file, fetched from this origin. */
  loadDemo(): Promise<DemoLoad>;
  /** The panels store (inspector width and open state, "Start empty" dismissed), persisted in `uiState`. */
  readonly panels: PanelsStore;
  /** What the navigator needs (step 5.5a): the store, indexes, layout service, text measurer, UI stores and timers. */
  readonly navigator: NavigatorPorts;
  /** What the inspector needs (step 5.6a): the store, findings, L4 checks, depictions and the UI stores. */
  readonly inspector: InspectorPorts;
  /** The injected clock in milliseconds (the export file name's date). Absent: 0, which a test never relies on. */
  nowMs?(): number;
  /** Local time for the words people read (a stored UTC time shown in their zone). Absent: the machine's own zone. */
  formatTime?: TimeFormatter;
  /** Reloads the page (`location.reload()` in the browser). */
  reload(): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider(props: { readonly value: AppContextValue; readonly children: ReactNode }) {
  return <AppContext.Provider value={props.value}>{props.children}</AppContext.Provider>;
}

/** The app context, or null outside the provider (a part rendered alone, as the top bar is in its tests). */
export const useAppOptional = (): AppContextValue | null => useContext(AppContext);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (value === null) throw new Error('useApp was called outside the AppProvider');
  return value;
}
