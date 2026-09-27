/**
 * Hub resolution for the navigator (docs/GRAPH_SEMANTICS.md §3): the hub of a substance is the anchored
 * record itself; else the nearest anchored ancestor class (shortest path through `classIds` then
 * `parentIds`, ties to the lowest ID); else the virtual Unclassified hub. Iterative, cycle-safe, memoised.
 */
import type { ClassId, RecordRef } from '../../schema';
import type { ReadonlyIndexes } from '../../indexes/contracts';

export const UNCLASSIFIED_HUB_ID = 'virtual:unclassified:hub';

export interface HubResolution {
  /** Node ID of the hub: the anchored record's ID, or `UNCLASSIFIED_HUB_ID`. */
  readonly hubId: string;
  /** The anchored record, or null for Unclassified. */
  readonly hub: RecordRef | null;
  /** True when attachment goes through class membership (drawn dotted); false when stated. */
  readonly inferred: boolean;
}

const UNCLASSIFIED: HubResolution = { hubId: UNCLASSIFIED_HUB_ID, hub: null, inferred: false };

const uniqueSorted = (ids: Iterable<string>): string[] => [...new Set(ids)].sort();

/** Records that can be hubs: anchored, present, and not `showAsNode = never`. Keyed by ID. */
export function hubTargets(indexes: ReadonlyIndexes): ReadonlyMap<string, RecordRef> {
  const targets = new Map<string, RecordRef>();
  for (const anchor of indexes.anchors()) {
    const { target } = anchor;
    if (indexes.get(target.id) === undefined) continue;
    if (indexes.displayOf(target)?.showAsNode === 'never') continue;
    if (!targets.has(target.id)) targets.set(target.id, target);
  }
  return targets;
}

function parentsOf(indexes: ReadonlyIndexes, id: string): readonly string[] {
  const record = indexes.get(id);
  return record?.kind === 'class' ? record.parentIds : [];
}

function startingClasses(indexes: ReadonlyIndexes, ref: RecordRef): readonly string[] {
  const record = indexes.get(ref.id);
  if (record === undefined) return [];
  if (record.kind === 'species' || record.kind === 'reagent') return record.classIds;
  if (record.kind === 'class') return record.parentIds;
  return [];
}

export function createHubResolver(indexes: ReadonlyIndexes, targets: ReadonlyMap<string, RecordRef>) {
  const memo = new Map<string, HubResolution>();

  function climb(ref: RecordRef): HubResolution {
    const own = targets.get(ref.id);
    if (own !== undefined) return { hubId: own.id, hub: own, inferred: false };
    const visited = new Set<string>();
    let frontier = uniqueSorted(startingClasses(indexes, ref));
    while (frontier.length > 0) {
      for (const id of frontier) visited.add(id);
      const hit = frontier.find((id) => targets.has(id));
      if (hit !== undefined) return { hubId: hit, hub: targets.get(hit) as RecordRef, inferred: true };
      frontier = uniqueSorted(frontier.flatMap((id) => parentsOf(indexes, id as ClassId))).filter((id) => !visited.has(id));
    }
    return UNCLASSIFIED;
  }

  return (ref: RecordRef): HubResolution => {
    const cached = memo.get(ref.id);
    if (cached !== undefined) return cached;
    const found = climb(ref);
    memo.set(ref.id, found);
    return found;
  };
}
