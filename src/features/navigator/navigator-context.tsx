/**
 * The navigator's model, shared by the canvas and the status line (step 5.5a): one model per window, started while the dataset has
 * records and stopped when it has none. React reads the model's state through `useSyncExternalStore`; nothing else is React state.
 */
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { NavigatorPorts } from './contracts';
import { createNavigatorModel, type NavigatorModel, type NavigatorState } from './pipeline';

interface NavigatorContextValue {
  readonly model: NavigatorModel;
  readonly ports: NavigatorPorts;
}

const NavigatorContext = createContext<NavigatorContextValue | null>(null);

export function NavigatorProvider(props: { readonly ports: NavigatorPorts; readonly active: boolean; readonly children: ReactNode }) {
  const { ports, active } = props;
  const value = useMemo<NavigatorContextValue>(() => ({ model: createNavigatorModel(ports), ports }), [ports]);
  useEffect(() => {
    if (!active) return undefined;
    value.model.start();
    return () => value.model.stop();
  }, [value, active]);
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
