/**
 * A family's links on the map (step 8.4m, M3): one row per neighbour box and direction, with the number of DISTINCT reactions that run
 * that way. Read from the navigator roll-up, so it is the same set the map's lines are built from, across all chapters. A reaction from the
 * family to itself is not a link. The bucket ("Not in a family yet") is a neighbour like any other, under its own id. Derived, never
 * stored. Work is proportional to the family's own candidates.
 */
import type { NavigatorCandidate } from '../../indexes/contracts';

export interface FamilyLink {
  /** The neighbour's map node id (a hub's record id, or the Unclassified hub id). */
  readonly id: string;
  readonly reactions: number;
}

export interface FamilyLinks {
  readonly turnsInto: readonly FamilyLink[];
  readonly madeFrom: readonly FamilyLink[];
}

interface Rollup {
  candidatesFrom(hubId: string): readonly NavigatorCandidate[];
  candidatesTo(hubId: string): readonly NavigatorCandidate[];
}

function rows(candidates: readonly NavigatorCandidate[], own: string, far: (candidate: NavigatorCandidate) => string): FamilyLink[] {
  const found = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const id = far(candidate);
    if (id === own) continue;
    const set = found.get(id);
    if (set === undefined) found.set(id, new Set([candidate.reactionId]));
    else set.add(candidate.reactionId);
  }
  return [...found].map(([id, set]) => ({ id, reactions: set.size })).sort((a, b) => b.reactions - a.reactions || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function familyLinksOf(rollup: Rollup, hubId: string): FamilyLinks {
  return { turnsInto: rows(rollup.candidatesFrom(hubId), hubId, (c) => c.toHub), madeFrom: rows(rollup.candidatesTo(hubId), hubId, (c) => c.fromHub) };
}
