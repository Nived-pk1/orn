/**
 * The inspector's port (step 5.6a): what `src/features/inspector` needs, made from the services, the depiction port of the navigator
 * and the UI stores. The feature imports none of this. Indexes and findings are asked again at every call.
 */
import type { AppServices } from '@/app/services';
import type { InspectorPorts } from '@/features/inspector';
import type { NavigatorPorts } from '@/features/navigator';
import type { InspectorStore, PanelsStore } from '@/ui/state';

export type InspectorPortServices = Pick<AppServices, 'store' | 'indexes' | 'l4' | 'logApp'>;

export function createInspectorPorts(services: InspectorPortServices, navigator: Pick<NavigatorPorts, 'depictions' | 'timers' | 'ui'>, inspector: InspectorStore, panels: PanelsStore): InspectorPorts {
  return {
    store: services.store,
    indexes: { current: () => services.indexes.current() },
    findings: services.store.findings,
    l4: services.l4,
    depictions: navigator.depictions,
    timers: navigator.timers,
    ui: { inspector, selection: navigator.ui.selection, family: navigator.ui.family, panels },
    log: (type, message) => services.logApp(type, message),
  };
}
