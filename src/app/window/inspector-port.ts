/**
 * The inspector's port (step 5.6a): what `src/features/inspector` needs, made from the services, the depiction port of the navigator
 * and the UI stores. The feature imports none of this. Indexes and findings are asked again at every call.
 */
import type { AppServices } from '@/app/services';
import type { InspectorPorts } from '@/features/inspector';
import type { NavigatorPorts } from '@/features/navigator';
import type { InspectorStore, PanelsStore } from '@/ui/state';

export type InspectorPortServices = Pick<AppServices, 'store' | 'indexes' | 'l4' | 'logApp' | 'persistence'>;

export function createInspectorPorts(services: InspectorPortServices, navigator: Pick<NavigatorPorts, 'depictions' | 'facts' | 'timers' | 'ui'>, inspector: InspectorStore, panels: PanelsStore): InspectorPorts {
  return {
    store: services.store,
    indexes: { current: () => services.indexes.current() },
    findings: services.store.findings,
    l4: services.l4,
    depictions: navigator.depictions,
    ...(navigator.facts === undefined ? {} : { facts: navigator.facts }),
    assets: {
      async open(assetId, mediaType) {
        if (services.persistence === undefined) return { ok: false, reason: 'unavailable', message: 'This tab keeps nothing on disk, so no image bytes are available.' };
        try {
          const blob = await services.persistence.getAssetBlob(assetId);
          if (blob === undefined) return { ok: false, reason: 'missing', message: 'The bytes of this image are not stored (finding AST-002).' };
          // the declared media type decides how the browser reads the bytes; an SVG is only ever an image, never markup
          return { ok: true, url: URL.createObjectURL(new Blob([blob], { type: mediaType })) };
        } catch (error) {
          return { ok: false, reason: 'unavailable', message: `The bytes could not be read: ${error instanceof Error ? error.message : String(error)}` };
        }
      },
      revoke: (url) => URL.revokeObjectURL(url),
    },
    timers: navigator.timers,
    ui: { inspector, selection: navigator.ui.selection, family: navigator.ui.family, panels, exam: navigator.ui.exam },
    log: (type, message) => services.logApp(type, message),
  };
}
