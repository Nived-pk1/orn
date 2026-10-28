/**
 * How an entry point opens Precursors (step 7.2a D7): the inspector's "How to make it". The target a record stands for is data (its kind
 * decides), not a branch on a name; opening REPLACES the choices (an old target, start-from and search do not lie around), and closes an
 * open family page so the mode is what shows.
 */
import type { RecordRef } from '@/core/schema';
import type { NavigatorUiStores, SubstanceChoice } from '@/ui/state';
import { asChoice } from '@/ui/state';
import { PRECURSORS_MODE } from './modes';

/** A species or a class is something a route can end at; every other kind is not. */
export const precursorChoiceFor = (ref: RecordRef): SubstanceChoice | undefined => asChoice(ref);

export function openPrecursors(ui: Pick<NavigatorUiStores, 'precursors' | 'family'>, setMode: (mode: string) => void, ref: RecordRef): void {
  const choice = precursorChoiceFor(ref);
  if (choice === undefined) return;
  ui.precursors.getState().replace({ target: choice, startFrom: [], maxSteps: 5, onlyListed: false, onlyInScope: false, searched: false });
  ui.family.getState().closeFamily();
  setMode(PRECURSORS_MODE);
}
