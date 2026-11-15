/**
 * The "Links" of a family in the panel (step 8.4m, M3): what it turns into and what it is made from, one named row per neighbour box of
 * the map with its number of reactions. Only a record that is a box of the map has links. Pure; the counting is `familyLinksOf` (core).
 */
import { familyLinksOf, UNCLASSIFIED_HUB_ID, type FamilyLink } from '@/core/graph';
import type { RecordRef } from '@/core/schema';
import { nameOf, refOfId } from './describe';
import { NOT_IN_A_FAMILY } from './map-inspector-view';
import type { Snapshot } from './study-connected';

export interface LinkRow {
  /** The neighbour's map node id. */
  readonly id: string;
  readonly name: string;
  readonly reactions: number;
}

export interface StudyLinks {
  readonly turnsInto: readonly LinkRow[];
  readonly madeFrom: readonly LinkRow[];
}

export function linksOf(snapshot: Snapshot, ref: RecordRef): StudyLinks | undefined {
  const rollup = snapshot.indexes.navigatorRollup();
  if (!rollup.hubs.some((hub) => hub.id === ref.id && hub.kind === ref.kind)) return undefined;
  const named = (rows: readonly FamilyLink[]): LinkRow[] =>
    rows.flatMap((row) => {
      if (row.id === UNCLASSIFIED_HUB_ID) return [{ ...row, name: NOT_IN_A_FAMILY }];
      const other = refOfId(row.id);
      return other === undefined ? [] : [{ ...row, name: nameOf(snapshot.state, other) }];
    });
  const found = familyLinksOf(rollup, ref.id);
  const links = { turnsInto: named(found.turnsInto), madeFrom: named(found.madeFrom) };
  return links.turnsInto.length + links.madeFrom.length === 0 ? undefined : links;
}
