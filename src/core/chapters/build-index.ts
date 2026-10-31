/**
 * The chapter of every record (7.3b A2). A record's chapter is the nearest topic of kind "chapter" at or above each topic it is mapped
 * to; a topic with no chapter above it is its own top-level topic. A concept mapped nowhere takes the chapters of the records it is a
 * prerequisite of (one hop, the exam scope's own rule), as "supporting". Bounded: the topic tree depth is capped.
 */
import type { CanonicalState, RecordRef, Topic } from '../schema';
import type { ChapterIndex, ChapterInfo, MappingRole, Membership } from './types';

const MAX_TOPIC_DEPTH = 32;
const ROLE_RANK: Readonly<Record<MappingRole, number>> = { core: 0, supporting: 1, enrichment: 2 };
const keyOf = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;

const compareTopics = (a: Topic, b: Topic): number => (a.order !== b.order ? a.order - b.order : a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Pre-order position of every topic: roots by sibling order, then each root's children, depth first. */
function treeOrder(topics: readonly Topic[]): Map<string, number> {
  const known = new Set(topics.map((t) => t.id as string));
  const children = new Map<string | undefined, Topic[]>();
  for (const topic of topics) {
    const parent = topic.parentId !== undefined && known.has(topic.parentId) ? topic.parentId : undefined;
    children.set(parent, [...(children.get(parent) ?? []), topic]);
  }
  const position = new Map<string, number>();
  const visit = (parent: string | undefined, depth: number): void => {
    if (depth > MAX_TOPIC_DEPTH) return;
    for (const topic of [...(children.get(parent) ?? [])].sort(compareTopics)) {
      if (position.has(topic.id)) continue;
      position.set(topic.id, position.size);
      visit(topic.id, depth + 1);
    }
  };
  visit(undefined, 0);
  return position;
}

export function buildChapterIndex(state: CanonicalState): ChapterIndex {
  const topics = Object.values(state.records.topic);
  const byId = new Map(topics.map((t) => [t.id as string, t]));
  const position = treeOrder(topics);

  const chapterOfTopic = (topicId: string): string | undefined => {
    let at = byId.get(topicId);
    let root: Topic | undefined;
    for (let depth = 0; at !== undefined && depth < MAX_TOPIC_DEPTH; depth += 1) {
      if (at.topicKind === 'chapter') return at.id;
      root = at;
      at = at.parentId === undefined ? undefined : byId.get(at.parentId);
    }
    return root?.id;
  };

  const direct = new Map<string, Map<string, { role: MappingRole; sectionPos: number }>>();
  const used = new Set<string>();
  for (const mapping of Object.values(state.records.topic_mapping)) {
    const chapterId = chapterOfTopic(mapping.topicId);
    if (chapterId === undefined) continue;
    used.add(chapterId);
    const per = direct.get(keyOf(mapping.target)) ?? new Map<string, { role: MappingRole; sectionPos: number }>();
    const sectionPos = position.get(mapping.topicId) ?? Number.MAX_SAFE_INTEGER;
    const before = per.get(chapterId);
    per.set(chapterId, {
      role: before === undefined || ROLE_RANK[mapping.role] < ROLE_RANK[before.role] ? mapping.role : before.role,
      sectionPos: before === undefined ? sectionPos : Math.min(before.sectionPos, sectionPos),
    });
    direct.set(keyOf(mapping.target), per);
  }

  // the chapter list: every chapter topic, plus a top-level topic that some mapping resolved to
  const listed = topics.filter((t) => t.topicKind === 'chapter' || used.has(t.id)).sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
  const chapters: ChapterInfo[] = listed.map((topic, order) => ({ id: topic.id, title: topic.name, order }));
  const orderOf = new Map(chapters.map((c) => [c.id as string, c.order]));
  const byChapterOrder = (a: Membership, b: Membership): number => (orderOf.get(a.chapterId) ?? 0) - (orderOf.get(b.chapterId) ?? 0);

  // concept -> the records it is a prerequisite of (one hop)
  const dependents = new Map<string, RecordRef[]>();
  const add = (conceptId: string, ref: RecordRef): void => void dependents.set(conceptId, [...(dependents.get(conceptId) ?? []), ref]);
  for (const reaction of Object.values(state.records.reaction)) for (const id of reaction.prerequisiteConceptIds ?? []) add(id, { kind: 'reaction', id: reaction.id });
  for (const named of Object.values(state.records.named_reaction)) for (const id of named.prerequisiteConceptIds ?? []) add(id, { kind: 'named_reaction', id: named.id } as RecordRef);
  for (const relation of Object.values(state.records.relationship)) if (relation.type === 'prerequisite_of' && relation.from.kind === 'concept') add(relation.from.id, relation.to);

  const own = (ref: RecordRef): Membership[] => {
    const per = direct.get(keyOf(ref));
    if (per === undefined) return [];
    return [...per.entries()].map(([chapterId, one]) => ({ chapterId, ...one })).sort(byChapterOrder);
  };

  const cache = new Map<string, readonly Membership[]>();
  return {
    chapters,
    chapterOfTopic,
    membershipsOf(ref) {
      const key = keyOf(ref);
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      let found: readonly Membership[] = own(ref);
      if (found.length === 0 && ref.kind === 'concept') {
        const merged = new Map<string, Membership>();
        for (const dependent of dependents.get(ref.id) ?? []) for (const m of own(dependent)) merged.set(m.chapterId, { chapterId: m.chapterId, role: 'supporting', sectionPos: Number.MAX_SAFE_INTEGER });
        found = [...merged.values()].sort(byChapterOrder);
      }
      cache.set(key, found);
      return found;
    },
  };
}
