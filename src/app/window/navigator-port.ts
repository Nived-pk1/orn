/**
 * The navigator's port (step 5.5a, item a): what `src/features/navigator` needs, made from the services, the text measurer and the
 * UI stores. The feature imports none of this; the services reach it only through this object. An indexes handle is not kept here
 * either: `current()` asks the service again at every call.
 */
import { depictionKeyOf, type AppServices } from '@/app/services';
import type { StructureMode } from '@/chem/contracts';
import type { TextMeasurer } from '@/app/text-measurer';
import type { NavigatorPorts, NavigatorStructures } from '@/features/navigator';
import type { StructureFactsPort } from '@/render/equation';
import type { NavigatorUi } from '@/ui/state';

export type NavigatorPortServices = Pick<AppServices, 'store' | 'indexes' | 'layout' | 'logApp' | 'depictions' | 'status'>;

/**
 * `structures` is the Structures setting (equation step, part 4: the panels store gives it). The depictions' keys and calls carry the mode
 * they are asked in; `onMode` fires only when the mode itself changes (the panels store also changes for a drag of the inspector).
 */
export function createNavigatorPorts(
  services: NavigatorPortServices,
  measurer: TextMeasurer,
  timers: NavigatorPorts['timers'],
  ui: Pick<NavigatorUi, 'stores' | 'status'>,
  structures?: NavigatorStructures,
  facts?: StructureFactsPort,
): NavigatorPorts {
  const modeOf = (): StructureMode => structures?.mode() ?? 'skeletal';
  return {
    store: services.store,
    indexes: { current: () => services.indexes.current() },
    layout: services.layout,
    measurer: { measure: measurer.measure, ready: measurer.ready },
    timers,
    depictions: {
      keyOf: (structure, size, mode) => depictionKeyOf(structure, { width: size.width, height: size.height, showAtomMaps: false, mode: mode ?? 'skeletal', ...(size.fixedScale === true ? { fixedScale: true } : {}) }),
      depict: (structure, size, mode) => services.depictions.depict(structure, { width: size.width, height: size.height, showAtomMaps: false, mode: mode ?? 'skeletal', ...(size.fixedScale === true ? { fixedScale: true } : {}) }),
      cancel: (key) => services.depictions.cancel(key),
      mode: modeOf,
      onMode(listener) {
        if (structures === undefined) return () => undefined;
        let last = structures.mode();
        return structures.subscribe(() => {
          const now = structures.mode();
          if (now === last) return;
          last = now;
          listener();
        });
      },
      // the chemistry engine came back after it was unavailable (a successful Retry): the feature forgets the structures that failed
      recovered(listener) {
        let failed = services.status.get().engines.chem.state === 'unavailable';
        return services.status.subscribe((status) => {
          const state = status.engines.chem.state;
          if (state === 'unavailable') failed = true;
          else if (state === 'ready' && failed) {
            failed = false;
            listener();
          }
        });
      },
      enginePending: () => {
        const state = services.status.get().engines.chem.state;
        return state === 'cold' || state === 'loading';
      },
      // every move to ready: a structure that failed only because the engine was still loading is asked for again
      engineReady(listener) {
        let ready = services.status.get().engines.chem.state === 'ready';
        return services.status.subscribe((status) => {
          const now = status.engines.chem.state === 'ready';
          if (now && !ready) listener();
          ready = now;
        });
      },
      // Object URLs are a browser API: made and revoked here, never in the feature. The SVG is sanitised text from the chem service.
      createUrl: (svg) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })),
      revokeUrl: (url) => URL.revokeObjectURL(url),
    },
    ...(structures === undefined ? {} : { structures }),
    ...(facts === undefined ? {} : { facts }),
    ui: ui.stores,
    uiStatus: ui.status,
    log: (type, message) => services.logApp(type, message),
  };
}
