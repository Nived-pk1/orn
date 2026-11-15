/**
 * The map model behind its lazy chunk (step 8.4m, R2): the pipeline (projection, sizes, layout request, scene build) is loaded by the
 * first `start` and not before. Until its first state arrives, readers get `IDLE_NAVIGATOR_STATE` ("not computed yet"). A chunk that
 * does not load is an error value in the state; the next `start` asks again. `stop` before the code arrived means it never runs.
 * The skeleton delay counts from `start` here, not from the chunk's arrival, so a slow chunk shows the skeleton after the same 300 ms.
 */
import type { NavigatorPorts } from './contracts';
import { SKELETON_DELAY_MS } from './limits';
import { IDLE_NAVIGATOR_STATE, type NavigatorModel, type NavigatorState } from './navigator-state';

export const MAP_CODE_FAILED = 'MAP_CODE_FAILED';

type Pipeline = { createNavigatorModel(ports: NavigatorPorts): NavigatorModel };

export function createLazyNavigatorModel(ports: NavigatorPorts, load: () => Promise<Pipeline> = () => import('./pipeline')): NavigatorModel {
  let real: NavigatorModel | null = null;
  let wanted = false;
  let loading = false;
  let own: NavigatorState = IDLE_NAVIGATOR_STATE;
  let late = false;
  let stopTimer: (() => void) | undefined;
  let shown: { readonly from: NavigatorState; readonly value: NavigatorState } | null = null;
  const listeners = new Set<() => void>();
  const tell = (): void => {
    for (const listener of [...listeners]) listener();
  };
  return {
    getState() {
      const from = real?.getState() ?? own;
      if (!late || from.skeleton || from.scene !== null || from.error !== null) return from;
      if (shown?.from !== from) shown = { from, value: { ...from, skeleton: true } };
      return shown.value;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    start() {
      wanted = true;
      if (!late && stopTimer === undefined && (real?.getState() ?? own).scene === null) {
        stopTimer = ports.timers.after(SKELETON_DELAY_MS, () => {
          stopTimer = undefined;
          late = true;
          tell();
        });
      }
      if (real !== null) return real.start();
      if (loading) return;
      loading = true;
      load().then(
        (pipeline) => {
          loading = false;
          real = pipeline.createNavigatorModel(ports);
          real.subscribe(tell);
          if (wanted) real.start();
          tell();
        },
        (error: unknown) => {
          loading = false;
          const message = error instanceof Error ? error.message : String(error);
          ports.log('navigator_failed', message);
          own = { ...IDLE_NAVIGATOR_STATE, error: { code: MAP_CODE_FAILED, message: `The map's code could not be loaded (${message}).` } };
          tell();
        },
      );
    },
    stop() {
      wanted = false;
      stopTimer?.();
      stopTimer = undefined;
      late = false;
      real?.stop();
    },
    stats: () => real?.stats() ?? { projections: 0, sizes: 0, requests: 0, layoutCalls: 0, scenes: 0 },
  };
}
