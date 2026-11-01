/**
 * How an entry point opens a reagent's page (step 7.3c D4): the inspector's "Show in Reagents", the palette's "Open Reagents" and Alt+Enter on
 * a reagent. Opens that reagent (the list filters start clean), remembers the phone's Explore tab and the Reagents explorer, closes an open
 * family page and switches to the Reagents mode. `openReagentsList` opens the list as it was left.
 */
import type { NavigatorUiStores } from '@/ui/state';
import { REAGENTS_MODE } from './modes';

type Stores = Pick<NavigatorUiStores, 'reagents' | 'overview' | 'family' | 'explorer'>;

function enter(ui: Stores, setMode: (mode: string) => void): void {
  ui.family.getState().closeFamily();
  ui.overview.getState().setPhoneTab('explore');
  ui.explorer.getState().setLast('reagents');
  setMode(REAGENTS_MODE);
}

export function openReagent(ui: Stores, setMode: (mode: string) => void, reagentId: string): void {
  ui.reagents.getState().open(reagentId);
  enter(ui, setMode);
}

export function openReagentsList(ui: Stores, setMode: (mode: string) => void): void {
  enter(ui, setMode);
}
