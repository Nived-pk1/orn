/**
 * Shows a record on the map: the palette's way, and the address's (step 8.4g, G1). The map is shown, the inspector shows the record and
 * opens its pane; a family is then focused on the map, a reaction opens its family page at its card, anything else has its places in the inspector.
 */
import { placeOf } from '@/features/inspector';
import type { RecordRef } from '@/core/schema';
import type { AppContextValue } from './context';
import { NAVIGATOR_MODE } from './modes';

export function showRecord(app: Pick<AppContextValue, 'navigator' | 'inspector'>, setMode: (mode: string) => void, openPane: () => void, ref: RecordRef, title: string): void {
  const { navigator } = app;
  setMode(NAVIGATOR_MODE);
  if (navigator.ui.overview.getState().phoneTab === 'explore') navigator.ui.overview.getState().setPhoneTab('families');
  app.inspector.ui.inspector.getState().open(ref);
  openPane();
  placeOf(ref, title, navigator.indexes.current(), { selection: navigator.ui.selection, family: navigator.ui.family }, true).actions[0]?.run();
}
