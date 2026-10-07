import { useStore } from 'zustand';
import type { PanelsState, PanelsStore } from './panels';

/** Reads one slice of the panels store (a selector, so an unrelated change does not re-render the caller). */
export function usePanels<T>(store: PanelsStore, selector: (state: PanelsState) => T): T {
  return useStore(store, selector);
}
