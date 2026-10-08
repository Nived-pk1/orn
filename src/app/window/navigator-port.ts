/**
 * The navigator's port (step 5.5a, item a): what `src/features/navigator` needs, made from the services, the text measurer and the
 * UI stores. The feature imports none of this; the services reach it only through this object. An indexes handle is not kept here
 * either: `current()` asks the service again at every call.
 */
import type { AppServices } from '@/app/services';
import type { TextMeasurer } from '@/app/text-measurer';
import type { NavigatorPorts } from '@/features/navigator';
import type { NavigatorUiStores } from '@/ui/state';

export type NavigatorPortServices = Pick<AppServices, 'store' | 'indexes' | 'layout' | 'logApp'>;

export function createNavigatorPorts(services: NavigatorPortServices, measurer: TextMeasurer, timers: NavigatorPorts['timers'], ui: NavigatorUiStores): NavigatorPorts {
  return {
    store: services.store,
    indexes: { current: () => services.indexes.current() },
    layout: services.layout,
    measurer: { measure: measurer.measure, ready: measurer.ready },
    timers,
    ui,
    log: (type, message) => services.logApp(type, message),
  };
}
