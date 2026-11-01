/**
 * How an entry point opens a named reaction's or a mechanism's page (step 7.4 D, E): the inspector's "Show in Named reactions" / "Show in
 * Mechanisms", the palette's "Open ..." commands, Alt+Enter on a hit, the badge on a reaction card, and the links between the pages and the
 * Chapters view. Opens that record (the list filters start clean), remembers the phone's Explore tab and the explorer, closes an open family
 * page and switches the mode. The `...List` forms open the list as it was left.
 */
import type { NavigatorUiStores } from '@/ui/state';
import { MECHANISMS_MODE, NAMED_MODE, SYLLABUS_MODE } from './modes';

type Stores = Pick<NavigatorUiStores, 'named' | 'mechanisms' | 'overview' | 'family' | 'explorer'>;

function enter(ui: Stores, setMode: (mode: string) => void, kind: 'named' | 'mechanisms' | 'syllabus'): void {
  ui.family.getState().closeFamily();
  ui.overview.getState().setPhoneTab('explore');
  ui.explorer.getState().setLast(kind);
  setMode(kind === 'named' ? NAMED_MODE : kind === 'syllabus' ? SYLLABUS_MODE : MECHANISMS_MODE);
}

export function openNamed(ui: Stores, setMode: (mode: string) => void, namedReactionId: string): void {
  ui.named.getState().open(namedReactionId);
  enter(ui, setMode, 'named');
}

export function openNamedList(ui: Stores, setMode: (mode: string) => void): void {
  enter(ui, setMode, 'named');
}

export function openMechanism(ui: Stores, setMode: (mode: string) => void, mechanismId: string): void {
  ui.mechanisms.getState().open(mechanismId);
  enter(ui, setMode, 'mechanisms');
}

export function openMechanismsList(ui: Stores, setMode: (mode: string) => void): void {
  enter(ui, setMode, 'mechanisms');
}

/** Opens the Syllabus view (7.6) as it was left: from the palette and the quiet link in the Chapters header. */
export function openSyllabus(ui: Stores, setMode: (mode: string) => void): void {
  enter(ui, setMode, 'syllabus');
}
