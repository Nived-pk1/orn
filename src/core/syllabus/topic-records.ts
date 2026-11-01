/**
 * The records at a topic and below it (7.6 C), by the Chapters list's own rule: a study record counts for topic T when one of its topic
 * mappings is at T or below T (the ancestor closure of the topics it is mapped to); a concept mapped nowhere takes the topics of the records
 * it is a prerequisite of (one hop); a concept with no text is not counted; reactions are counted as CARDS (an example folds under its
 * general reaction within one topic). Bounded: the ancestor walk is capped at the chapters' depth cap.
 */
import { CHAPTER_GROUPS, isUnwrittenConcept, prerequisiteDependents, studyRecords, type GroupKey } from '../chapters';
import { foldExamples } from '../graph/family/examples';
import type { CanonicalState, RecordRef } from '../schema';
import type { TopicCounts } from './types';

export const MAX_DEPTH = 32;
const GROUP_OF = new Map(CHAPTER_GROUPS.flatMap((group) => group.kinds.map((kind) => [kind, group.key] as const)));
const keyOf = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;

export interface TopicRecords {
  /** The study records at the topic and below. */
  recordsAt(topicId: string): readonly RecordRef[];
  /** The counts of those records, and how many there are. */
  countsAt(topicId: string): { readonly counts: TopicCounts; readonly total: number };
  /** Every record at or below ANY of the topics, each once. */
  distinctIn(topicIds: readonly string[]): number;
}

export function topicRecords(state: CanonicalState): TopicRecords {
  const parentOf = new Map(Object.values(state.records.topic).map((t) => [t.id as string, t.parentId as string | undefined]));
  const own = new Map<string, Set<string>>();
  for (const mapping of Object.values(state.records.topic_mapping)) {
    if (!parentOf.has(mapping.topicId)) continue;
    const set = own.get(keyOf(mapping.target)) ?? new Set<string>();
    set.add(mapping.topicId);
    own.set(keyOf(mapping.target), set);
  }
  const dependents = prerequisiteDependents(state);
  const topicsOf = (ref: RecordRef): ReadonlySet<string> => {
    const direct = own.get(keyOf(ref));
    if (direct !== undefined) return direct;
    if (ref.kind !== 'concept') return new Set();
    const merged = new Set<string>();
    for (const dependent of dependents.get(ref.id) ?? []) for (const id of own.get(keyOf(dependent)) ?? []) merged.add(id);
    return merged;
  };

  const at = new Map<string, RecordRef[]>();
  for (const ref of studyRecords(state)) {
    if (isUnwrittenConcept(state, ref)) continue;
    const closure = new Set<string>();
    for (const start of topicsOf(ref)) {
      let id: string | undefined = start;
      for (let depth = 0; id !== undefined && depth < MAX_DEPTH && !closure.has(id); depth += 1) {
        closure.add(id);
        id = parentOf.get(id);
      }
    }
    for (const id of closure) {
      const list = at.get(id);
      if (list === undefined) at.set(id, [ref]);
      else list.push(ref);
    }
  }

  const lookup = {
    instanceOf: (id: string) => state.records.reaction[id]?.instanceOfId,
    isGeneric: (id: string) => state.records.reaction[id]?.scope === 'generic',
    sortKey: (id: string) => id,
  };
  const empty = (): Record<GroupKey, number> => Object.fromEntries(CHAPTER_GROUPS.map((group) => [group.key, 0])) as Record<GroupKey, number>;
  const cache = new Map<string, { counts: TopicCounts; total: number }>();
  return {
    recordsAt: (topicId) => at.get(topicId) ?? [],
    countsAt(topicId) {
      const cached = cache.get(topicId);
      if (cached !== undefined) return cached;
      const counts = empty();
      const reactions: string[] = [];
      const refs = at.get(topicId) ?? [];
      for (const ref of refs) {
        if (ref.kind === 'reaction') reactions.push(ref.id);
        else counts[GROUP_OF.get(ref.kind) as GroupKey] += 1;
      }
      counts.reactions = foldExamples(reactions, lookup).shown.length;
      const made = { counts, total: refs.length };
      cache.set(topicId, made);
      return made;
    },
    distinctIn(topicIds) {
      const seen = new Set<string>();
      for (const id of topicIds) for (const ref of at.get(id) ?? []) seen.add(keyOf(ref));
      return seen.size;
    },
  };
}
