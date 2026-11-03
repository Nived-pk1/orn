/**
 * How the palette opens the Chapters, Reactions and Precursors views as they were left (step 8.1, RR3). Same pattern as `page-entries.ts`:
 * closes an open family page, remembers the phone tab or the explorer, switches the mode.
 */
import type { NavigatorUiStores } from '@/ui/state';
import { CHAPTERS_MODE, PRECURSORS_MODE, REACTIONS_MODE } from './modes';

type Stores = Pick<NavigatorUiStores, 'overview' | 'family' | 'explorer'>;

export function openChaptersList(ui: Stores, setMode: (mode: string) => void): void {
  ui.family.getState().closeFamily();
  ui.overview.getState().setPhoneTab('chapters');
  setMode(CHAPTERS_MODE);
}

function enterExplorer(ui: Stores, setMode: (mode: string) => void, kind: 'reactions' | 'precursors'): void {
  ui.family.getState().closeFamily();
  ui.overview.getState().setPhoneTab('explore');
  ui.explorer.getState().setLast(kind);
  setMode(kind === 'reactions' ? REACTIONS_MODE : PRECURSORS_MODE);
}

export const openReactionsList = (ui: Stores, setMode: (mode: string) => void): void => enterExplorer(ui, setMode, 'reactions');
export const openPrecursorsList = (ui: Stores, setMode: (mode: string) => void): void => enterExplorer(ui, setMode, 'precursors');
