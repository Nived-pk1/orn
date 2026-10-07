/** The viewport store (step 5.4b): a plain external store, not React state. Listeners run synchronously on a change of state. */
import type { ViewportState, ViewportStore } from './contracts';
import { IDENTITY, sameViewport } from './transform';

export const INITIAL_STATE: ViewportState = { viewport: IDENTITY, lod: 0, capped: false, visibleNodes: 0, visibleEdges: 0 };

const same = (a: ViewportState, b: ViewportState): boolean =>
  sameViewport(a.viewport, b.viewport) && a.lod === b.lod && a.capped === b.capped && a.visibleNodes === b.visibleNodes && a.visibleEdges === b.visibleEdges;

export function createViewportStore(initial: ViewportState = INITIAL_STATE): ViewportStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      if (same(state, next)) return;
      state = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
