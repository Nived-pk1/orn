/**
 * The navigator's model, shared by the canvas and the status line (step 5.5a): one model per window, started once the dataset has
 * records AND the map has been shown (`shown`, step 8.4m R1; it then stays started), stopped when the dataset has none. The model's
 * code is a lazy chunk (`lazy-model.ts`, R2); before its first state readers get the idle state. React reads the model's state through `useSyncExternalStore`; nothing else is React state.
 */
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createAnnouncer, type Announcer } from './announcer';
import type { NavigatorPorts } from './contracts';
import { createLazyNavigatorModel } from './lazy-model';
import type { NavigatorModel, NavigatorState } from './navigator-state';

interface NavigatorContextValue {
  readonly model: NavigatorModel;
  readonly ports: NavigatorPorts;
  /** The words for the screen's one live region (step 5.7). */
  readonly announcer: Announcer;
}

const NavigatorContext = createContext<NavigatorContextValue | null>(null);

export function NavigatorProvider(props: { readonly ports: NavigatorPorts; readonly active: boolean; /** The map is (or has been) the screen; left out: yes. */ readonly shown?: boolean; readonly children: ReactNode }) {
  const { ports, active, shown = true } = props;
  const [seen, setSeen] = useState(shown);
  if (shown && !seen) setSeen(true);
  const value = useMemo<NavigatorContextValue>(() => ({ model: createLazyNavigatorModel(ports), ports, announcer: createAnnouncer() }), [ports]);
  useEffect(() => {
    if (!active || !seen) return undefined;
    value.model.start();
    return () => value.model.stop();
  }, [value, active, seen]);
  return <NavigatorContext.Provider value={value}>{props.children}</NavigatorContext.Provider>;
}

export function useNavigator(): NavigatorContextValue {
  const value = useContext(NavigatorContext);
  if (value === null) throw new Error('useNavigator was called outside the NavigatorProvider');
  return value;
}

/** True while the family page is open (the page carries the screen's h1). */
export function useFamilyPageOpen(): boolean {
  const { ports } = useNavigator();
  const store = ports.ui.family;
  return useSyncExternalStore(store.subscribe, () => store.getState().open !== null, () => false);
}

export function useNavigatorState(): NavigatorState {
  const { model } = useNavigator();
  return useSyncExternalStore(model.subscribe, model.getState, model.getState);
}
