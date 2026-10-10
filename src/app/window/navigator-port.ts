/**
 * The navigator's port (step 5.5a, item a): what `src/features/navigator` needs, made from the services, the text measurer and the
 * UI stores. The feature imports none of this; the services reach it only through this object. An indexes handle is not kept here
 * either: `current()` asks the service again at every call.
 */
import { depictionKeyOf, type AppServices } from '@/app/services';
import type { TextMeasurer } from '@/app/text-measurer';
import type { NavigatorPorts } from '@/features/navigator';
import type { NavigatorUi } from '@/ui/state';

export type NavigatorPortServices = Pick<AppServices, 'store' | 'indexes' | 'layout' | 'logApp' | 'depictions' | 'status'>;

export function createNavigatorPorts(services: NavigatorPortServices, measurer: TextMeasurer, timers: NavigatorPorts['timers'], ui: Pick<NavigatorUi, 'stores' | 'status'>): NavigatorPorts {
  return {
    store: services.store,
    indexes: { current: () => services.indexes.current() },
    layout: services.layout,
    measurer: { measure: measurer.measure, ready: measurer.ready },
    timers,
    depictions: {
      keyOf: (structure, size) => depictionKeyOf(structure, { width: size.width, height: size.height, showAtomMaps: false }),
      depict: (structure, size) => services.depictions.depict(structure, { width: size.width, height: size.height, showAtomMaps: false }),
      cancel: (key) => services.depictions.cancel(key),
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
      // Object URLs are a browser API: made and revoked here, never in the feature. The SVG is sanitised text from the chem service.
      createUrl: (svg) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })),
      revokeUrl: (url) => URL.revokeObjectURL(url),
    },
    ui: ui.stores,
    uiStatus: ui.status,
    log: (type, message) => services.logApp(type, message),
  };
}
