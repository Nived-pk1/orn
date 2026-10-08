/**
 * The record kinds a change can touch before the navigator's screen is stale (step 5.5a, review decision 6 (5)).
 *  - PROJECTION_KINDS: what the projection reads (`navigatorProjection.readsKinds`; proved by tests/property/navigator-reads-kinds.test.ts). A ChangeSet touching one rebuilds the
 *    projection, and the previous Projection object is kept when `sameProjection` holds.
 *  - SCENE_KINDS: what the Scene ports read. `describe` reads names, formulas and charges (species, class, reagent, concept,
 *    named_reaction: all in the projection list); `arrowTextOf` reads the reaction, its `reaction_scheme` records and
 *    `entity_display` (whether a reactant is drawn as a node); `depictionKeyOf` reads a species' structure. So the list is the
 *    projection's plus `reaction_scheme`. A ChangeSet touching one recomputes sizes and the layout request and rebuilds the Scene.
 * A ChangeSet touching neither rebuilds nothing. A kind listed too much costs a rebuild; a kind missing is a stale screen.
 */
import type { RecordKind } from '@/core/schema';
import { navigatorProjection } from '@/core/graph';

export const PROJECTION_KINDS: ReadonlySet<RecordKind> = new Set(navigatorProjection.readsKinds ?? []);
export const SCENE_KINDS: ReadonlySet<RecordKind> = new Set<RecordKind>([...(navigatorProjection.readsKinds ?? []), 'reaction_scheme']);

export type Touch = 'none' | 'scene' | 'projection';

/** What a ChangeSet forces: everything on a replace or a remote change, else by the kinds of the records it created, updated or deleted. */
export function touchOf(change: { readonly cause: string; readonly created: readonly { readonly kind: RecordKind }[]; readonly updated: readonly { readonly kind: RecordKind }[]; readonly deleted: readonly { readonly kind: RecordKind }[] }): Touch {
  if (change.cause === 'replace' || change.cause === 'remote') return 'projection';
  let touch: Touch = 'none';
  for (const list of [change.created, change.updated, change.deleted]) {
    for (const ref of list) {
      if (PROJECTION_KINDS.has(ref.kind)) return 'projection';
      if (SCENE_KINDS.has(ref.kind)) touch = 'scene';
    }
  }
  return touch;
}
