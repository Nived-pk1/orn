/**
 * Where a record has a place in the current view (step 5.6a, item g). In the navigator: a family on the map ("Show on map" selects
 * its hub on the overview, "Open family" opens its page) and a reaction ("Show in family" opens the page of the family its substrate
 * belongs to, at its card). Anything else has no place, and the status line says so. Reads the roll-up index only; the buttons are
 * calls on the UI stores (never on records).
 */
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { RecordRef } from '@/core/schema';
import { UNCLASSIFIED_HUB_ID } from '@/core/graph';
import type { FamilyStore, SelectionStore } from '@/ui/state';

export interface PlaceAction {
  readonly label: string;
  readonly run: () => void;
}

export interface Place {
  readonly actions: readonly PlaceAction[];
  /** Set when there is no action: why, in words, for the status line. */
  readonly line?: string;
}

export interface PlaceStores {
  readonly selection: SelectionStore;
  readonly family: FamilyStore;
}

export function placeOf(ref: RecordRef, name: string, indexes: ReadonlyIndexes, stores: PlaceStores, navigatorShown: boolean): Place {
  const none = (why: string): Place => ({ actions: [], line: `${name} ${why}` });
  if (!navigatorShown) return none('has no place in this view.');
  const rollup = indexes.navigatorRollup();
  if (ref.kind === 'class' || ref.kind === 'species') {
    if (!rollup.hubs.some((hub) => hub.id === ref.id)) return none('has no place in this view: it is not a family on the map.');
    return {
      actions: [
        {
          label: 'Show on map',
          run: () => {
            stores.family.getState().closeFamily();
            stores.selection.getState().select({ kind: 'node', id: ref.id });
          },
        },
        { label: 'Open family', run: () => stores.family.getState().openFamily(ref.id) },
      ],
    };
  }
  if (ref.kind === 'reaction') {
    for (const hubId of [...rollup.hubs.map((hub) => hub.id), UNCLASSIFIED_HUB_ID]) {
      const found = rollup.candidatesFrom(hubId).find((candidate) => candidate.reactionId === ref.id);
      if (found === undefined) continue;
      return {
        actions: [
          {
            label: 'Show in family',
            run: () => {
              stores.family.getState().openFamily(hubId, { section: 'reactions_of', hubId: found.toHub });
              stores.family.getState().selectReaction(ref.id);
            },
          },
        ],
      };
    }
    return none('has no place in this view: no family on the map holds its substrate.');
  }
  return none('has no place in this view.');
}
