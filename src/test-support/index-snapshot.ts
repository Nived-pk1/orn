/**
 * Every observable answer of the cross-record indexes (step 2.1) for a set of IDs, so an apply ≡ build
 * comparison (INV-18) sees stale leftovers as well as missing entries. Also a brute-force oracle that
 * answers the same questions by scanning the state, independently of the index code.
 */
import type { ReadonlyIndexes } from '@/core/indexes';
import { UNCLASSIFIED_HUB_ID } from '@/core/indexes/navigator-rollup';
import { REAGENT_FAMILIES, recordKindOfId, RECORD_KINDS } from '@/core/schema';
import type { AnyRecord, CanonicalState, RecordRef } from '@/core/schema';

const refOf = (id: string): RecordRef => ({ kind: recordKindOfId(id) ?? 'species', id }) as RecordRef;

/** All IDs a snapshot should ask about: record IDs, every ID a record points at, and nested IDs. */
export function idsOf(state: CanonicalState): Set<string> {
  const ids = new Set<string>();
  for (const kind of RECORD_KINDS) {
    for (const record of Object.values(state.records[kind] as Record<string, AnyRecord>)) {
      ids.add(record.id);
      for (const match of JSON.stringify(record).matchAll(/"([a-z]+_[^"]+)"/g)) {
        const id = match[1] as string;
        if (recordKindOfId(id) !== undefined) ids.add(id);
      }
    }
  }
  return ids;
}

/** Every observable answer of the navigator roll-up index (step 2.9), keyed by every real hub plus Unclassified. */
export function navigatorRollupSnapshot(ix: ReadonlyIndexes): unknown {
  const rollup = ix.navigatorRollup();
  const hubIds = [...rollup.hubs.map((hub) => hub.id), UNCLASSIFIED_HUB_ID].sort();
  return {
    hubs: rollup.hubs,
    unanchoredReactionIds: rollup.unanchoredReactionIds,
    byHub: hubIds.map((id) => [id, rollup.candidatesFrom(id), rollup.candidatesTo(id)]),
    // Step 5.4c: the per-pair table (pair order, and each pair's candidates in rank order).
    pairs: rollup.pairs(),
  };
}

export function derivedSnapshot(ix: ReadonlyIndexes, ids: Iterable<string>): unknown {
  const both = [{ includeDescendants: false }, { includeDescendants: true }] as const;
  return {
    revision: ix.revision,
    anchors: ix.anchors(),
    families: REAGENT_FAMILIES.map((f) => ix.reactionsByReagentFamily(f)),
    navigatorRollup: navigatorRollupSnapshot(ix),
    perId: [...ids].sort().map((id) => {
      const ref = refOf(id);
      const any = id as never;
      return [
        id,
        ix.participationsOf(ref),
        ix.productionsOf(ref),
        ix.reactionsByReagent(any),
        both.map((o) => ix.reactionsByNamedReaction(any, o)),
        ix.reactionsByTransformation(any),
        both.map((o) => ix.reactionsByConcept(any, o)),
        ix.reactionsByMechanism(any),
        [false, true].map((transitive) => ix.speciesInClass(any, { transitive })),
        [false, true].map((transitive) => ix.recordsInTopic(any, { transitive })),
        ix.topicsOf(ref),
        ix.relationshipsOf(ref),
        ix.caveatsFor(ref),
        ix.displayOf(ref),
      ];
    }),
  };
}

const all = <K extends AnyRecord['kind']>(state: CanonicalState, kind: K): Extract<AnyRecord, { kind: K }>[] =>
  Object.values(state.records[kind] as Record<string, Extract<AnyRecord, { kind: K }>>).sort((a, b) =>
    a.id < b.id ? -1 : 1,
  );

/** Scan-based answers for the same questions, written without the index machinery. */
export function oracle(state: CanonicalState) {
  const reactions = all(state, 'reaction');
  const walk = (kind: 'class' | 'concept' | 'named_reaction' | 'topic', id: string): string[] => {
    const table = state.records[kind] as Record<string, { parentIds?: string[]; parentId?: string }>;
    const out = new Set<string>();
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const [childId, child] of Object.entries(table)) {
        const parents = child.parentIds ?? (child.parentId === undefined ? [] : [child.parentId]);
        if (parents.includes(current) && childId !== id && !out.has(childId)) {
          out.add(childId);
          queue.push(childId);
        }
      }
    }
    return [...out];
  };
  const withDescendants = (kind: 'class' | 'concept' | 'named_reaction' | 'topic', id: string, on: boolean) =>
    on ? [id, ...walk(kind, id)] : [id];
  const sortedIds = (ids: Iterable<string>) => [...new Set(ids)].sort();
  return {
    participationsOf: (id: string) =>
      reactions.flatMap((r) =>
        r.participants.filter((p) => p.ref.id === id).map((p) => ({ reactionId: r.id, participantId: p.id, role: p.role })),
      ),
    productionsOf: (id: string) =>
      reactions.flatMap((r) =>
        r.outcomes.flatMap((o) =>
          o.products
            .filter((p) => p.ref.id === id)
            .map((p) => ({ reactionId: r.id, outcomeId: o.id, productId: p.id, selectivity: o.selectivity, productRole: p.role })),
        ),
      ),
    reactionsByReagent: (id: string) =>
      reactions.filter((r) => r.participants.some((p) => p.ref.kind === 'reagent' && p.ref.id === id)).map((r) => r.id),
    reactionsByFamily: (family: string) => {
      const reagents = new Set<string>(all(state, 'reagent').filter((g) => (g.families as string[]).includes(family)).map((g) => g.id));
      return reactions.filter((r) => r.participants.some((p) => reagents.has(p.ref.id))).map((r) => r.id);
    },
    reactionsByNamed: (id: string, on: boolean) => {
      const ids = withDescendants('named_reaction', id, on);
      return reactions.filter((r) => r.namedReactionIds.some((n) => ids.includes(n))).map((r) => r.id);
    },
    reactionsByConcept: (id: string, on: boolean) => {
      const ids = withDescendants('concept', id, on);
      return reactions
        .filter((r) =>
          [
            ...r.conceptIds,
            ...r.reactionTypes.map((c) => c.conceptId),
            ...r.mechanismClasses.map((c) => c.conceptId),
            ...r.outcomes.flatMap((o) => o.conceptIds),
          ].some((c) => ids.includes(c)),
        )
        .map((r) => r.id);
    },
    reactionsByMechanism: (id: string) =>
      reactions
        .filter((r) => r.mechanismIds.includes(id as never) || r.outcomes.some((o) => o.mechanism?.mechanismId === id))
        .map((r) => r.id),
    speciesInClass: (id: string, transitive: boolean) => {
      const classes = withDescendants('class', id, transitive);
      return sortedIds(all(state, 'species').filter((s) => s.classIds.some((c) => classes.includes(c))).map((s) => s.id));
    },
    recordsInTopic: (id: string, transitive: boolean) => {
      const topics = withDescendants('topic', id, transitive);
      return sortedIds(all(state, 'topic_mapping').filter((m) => topics.includes(m.topicId)).map((m) => m.target.id));
    },
    topicsOf: (id: string) => sortedIds(all(state, 'topic_mapping').filter((m) => m.target.id === id).map((m) => m.topicId)),
    relationshipsOf: (id: string) =>
      all(state, 'relationship').filter((r) => r.from.id === id || r.to.id === id).map((r) => r.id),
    caveatsFor: (id: string) => all(state, 'caveat').filter((c) => c.targets.some((t) => t.ref.id === id)).map((c) => c.id),
    anchors: () =>
      all(state, 'navigator_anchor').sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1)).map((a) => a.id),
    displayOf: (id: string) => all(state, 'entity_display').find((d) => d.target.id === id),
  };
}
