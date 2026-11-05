/** React's view of whether the browser holds the visitor's own data (step 8.3). Without an app context value there is none. */
import { useSyncExternalStore } from 'react';
import { useAppOptional } from './context';
import { NO_OWN_DATA, type OwnData } from './own-data';

export const useOwnDataStore = (): OwnData => useAppOptional()?.ownData ?? NO_OWN_DATA;

export function useHasOwnData(): boolean {
  const own = useOwnDataStore();
  return useSyncExternalStore(own.subscribe, own.get);
}
