/**
 * The ONE services provider (step 5.1d, E1): React gets the headless services and the few browser actions the window needs from
 * this context, and nowhere else. Components read it with `useApp()`; a test passes fakes.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { AppServices } from '@/app/services';

/** What the window needs from the services (so a test can fake only these). */
export type WindowServices = Pick<AppServices, 'store' | 'status' | 'flows' | 'saveEverythingNow' | 'retryReplica' | 'retryEngine'>;

export type DemoLoad = { readonly ok: true; readonly blob: Blob; readonly fileName: string } | { readonly ok: false; readonly message: string };

export interface AppContextValue {
  readonly services: WindowServices;
  /** The bundled demo file, fetched from this origin. */
  loadDemo(): Promise<DemoLoad>;
  /** Reloads the page (`location.reload()` in the browser). */
  reload(): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider(props: { readonly value: AppContextValue; readonly children: ReactNode }) {
  return <AppContext.Provider value={props.value}>{props.children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (value === null) throw new Error('useApp was called outside the AppProvider');
  return value;
}
