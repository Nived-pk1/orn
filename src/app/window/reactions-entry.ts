/**
 * How an entry point opens Reactions (step 7.1b E2, E3): the palette's Alt+Enter and the inspector's "Show its reactions" and "Open these n
 * reactions in Reactions". The filter a record stands for is data (its kind decides), not a branch on a name; opening REPLACES the filter
 * (an old one does not linger), keeps Cards/Compact, remembers the phone's Explore tab and closes an open family page.
 */
import type { RecordRef } from '@/core/schema';
import type { ExplorerFilter, NavigatorUiStores } from '@/ui/state';
import { REACTIONS_MODE } from './modes';

/** The filter a record stands for: a species, class or reagent is a substance (Used as: Any), a named reaction is itself; else none. */
export function filterFor(ref: RecordRef): Partial<ExplorerFilter> | undefined {
  if (ref.kind === 'species' || ref.kind === 'class' || ref.kind === 'reagent') return { substanceIds: [ref.id], usedAs: 'any' };
  if (ref.kind === 'named_reaction') return { namedReactionIds: [ref.id] };
  return undefined;
}

export function openReactions(ui: Pick<NavigatorUiStores, 'explorer' | 'overview' | 'family'>, setMode: (mode: string) => void, filter: Partial<ExplorerFilter>): void {
  ui.explorer.getState().replaceFilter(filter);
  ui.overview.getState().setPhoneTab('explore');
  ui.explorer.getState().setLast('reactions');
  ui.family.getState().closeFamily();
  setMode(REACTIONS_MODE);
}
