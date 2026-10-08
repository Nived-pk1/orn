/**
 * The panels store's port (step 5.2): what `src/ui/state` needs from the app, made from the services. The stored entry is what
 * boot read from `uiState` (checked by the store, tolerantly); a save goes through the persistence adapter's `setUiState`. A tab
 * that is not the writer writes nothing: the store says so as a status.
 */
import type { AppServices } from '@/app/services';
import type { JsonValue } from '@/core/schema';
import { PANELS_KEY, type PanelsPort } from '@/ui/state';

export type PanelsPortServices = Pick<AppServices, 'bootReport' | 'persistence' | 'status'>;

/** One `uiState` entry as a port (step 5.5a part 2: the panels and the navigator state each have one). */
export function createUiEntryPort(services: PanelsPortServices, key: string): PanelsPort {
  return {
    stored: services.bootReport?.uiState[key],
    mode() {
      if (services.persistence === undefined) return 'session_only';
      const mode = services.status.get().mode;
      if (mode === 'session_only') return 'session_only';
      return mode === 'writer' ? 'writable' : 'read_only';
    },
    async save(value) {
      if (services.persistence === undefined) throw new Error('nothing is stored in this session');
      await services.persistence.setUiState(key, value as unknown as JsonValue);
    },
  };
}

export const createPanelsPort = (services: PanelsPortServices): PanelsPort => createUiEntryPort(services, PANELS_KEY);
