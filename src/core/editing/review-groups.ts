/**
 * The Review page's groupings (7.3a E1, E3). Pure and derived; nothing is stored.
 *  - KIND: today's grouping, by the kind in words.
 *  - CHAPTER: "<exam version> › <unit>". A record is in the units whose coverage (included or partial) holds one of the topics it is
 *    mapped to, or an ancestor of one (the exam scope's own `mappedScope` reading). A record with no mapping of its own takes, when it
 *    is a concept, the chapters of the records it is a prerequisite of (the exam scope's one-hop prerequisite rule, `graph/scope.ts`);
 *    otherwise it has none and is listed under "No chapter yet", last. A record in several chapters is listed in each.
 * There is no grouping by import: a record carries no import id (E3), so that question is a REVIEW REQUIRED item.
 */
import type { CanonicalState, RecordRef } from '../schema';
import type { QueueRow } from './review-queue';

export const NO_CHAPTER_TITLE = 'No chapter yet';
export type GroupBy = 'chapter' | 'kind';

export interface Chapter {
  readonly key: string;
  readonly title: string;
  /** Position: exam version, then the unit's order in it. */
  readonly order: number;
}

export interface ReviewGroup {
  readonly key: string;
  readonly title: string;
  readonly rows: readonly QueueRow[];
}

const MAX_TOPIC_DEPTH = 32;
const keyOf = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;

export function chapterIndexOf(state: CanonicalState, examVersionId?: string): (ref: RecordRef) => readonly Chapter[] {
  const versions = Object.values(state.records.exam_version)
    .filter((version) => examVersionId === undefined || version.id === examVersionId)
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : a.id < b.id ? -1 : 1));
  const units: { readonly chapter: Chapter; readonly topics: ReadonlySet<string> }[] = [];
  for (const version of versions) {
    version.units.forEach((unit) => {
      const topics = new Set(unit.topicCoverage.filter((c) => c.coverage !== 'excluded').map((c) => c.topicId as string));
      units.push({ chapter: { key: `${version.id}|${unit.id}`, title: `${version.label} › ${unit.title}`, order: units.length }, topics });
    });
  }
  const topicsOf = new Map<string, Set<string>>();
  const topics = state.records.topic;
  for (const mapping of Object.values(state.records.topic_mapping)) {
    const set = topicsOf.get(keyOf(mapping.target)) ?? new Set<string>();
    let at: string | undefined = mapping.topicId;
    for (let depth = 0; at !== undefined && depth < MAX_TOPIC_DEPTH && !set.has(at); depth += 1) {
      set.add(at);
      at = topics[at as keyof typeof topics]?.parentId;
    }
    topicsOf.set(keyOf(mapping.target), set);
  }
  const own = (ref: RecordRef): Chapter[] => {
    const mine = topicsOf.get(keyOf(ref));
    if (mine === undefined) return [];
    return units.filter((unit) => [...mine].some((topic) => unit.topics.has(topic))).map((unit) => unit.chapter);
  };
  // concept -> the records it is a prerequisite of (one hop; the exam scope's own rule)
  const dependents = new Map<string, RecordRef[]>();
  const add = (conceptId: string, ref: RecordRef): void => void dependents.set(conceptId, [...(dependents.get(conceptId) ?? []), ref]);
  for (const reaction of Object.values(state.records.reaction)) for (const id of reaction.prerequisiteConceptIds ?? []) add(id, { kind: 'reaction', id: reaction.id });
  for (const named of Object.values(state.records.named_reaction)) for (const id of named.prerequisiteConceptIds ?? []) add(id, { kind: 'named_reaction', id: named.id } as RecordRef);
  for (const relation of Object.values(state.records.relationship)) if (relation.type === 'prerequisite_of' && relation.from.kind === 'concept') add(relation.from.id, relation.to);
  return (ref) => {
    const direct = own(ref);
    if (direct.length > 0 || ref.kind !== 'concept') return direct;
    const merged = new Map<string, Chapter>();
    for (const dependent of dependents.get(ref.id) ?? []) for (const chapter of own(dependent)) merged.set(chapter.key, chapter);
    return [...merged.values()].sort((a, b) => a.order - b.order);
  };
}

export function groupQueueRows(rows: readonly QueueRow[], by: GroupBy, chaptersOf: (ref: RecordRef) => readonly Chapter[]): readonly ReviewGroup[] {
  if (by === 'kind') {
    const groups = new Map<string, QueueRow[]>();
    for (const row of rows) groups.set(row.kindWords, [...(groups.get(row.kindWords) ?? []), row]);
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([title, list]) => ({ key: `kind:${title}`, title, rows: list }));
  }
  const groups = new Map<string, { chapter: Chapter; rows: QueueRow[] }>();
  const none: QueueRow[] = [];
  for (const row of rows) {
    const chapters = chaptersOf(row.ref);
    if (chapters.length === 0) none.push(row);
    for (const chapter of chapters) {
      const group = groups.get(chapter.key) ?? { chapter, rows: [] };
      group.rows.push(row);
      groups.set(chapter.key, group);
    }
  }
  const out: ReviewGroup[] = [...groups.values()].sort((a, b) => a.chapter.order - b.chapter.order).map((g) => ({ key: `chapter:${g.chapter.key}`, title: g.chapter.title, rows: g.rows }));
  if (none.length > 0) out.push({ key: 'chapter:none', title: NO_CHAPTER_TITLE, rows: none });
  return out;
}

/** The saved choice of the grouping (`uiState`, key `review`), read tolerantly: anything unusable is Kind, today's grouping. */
export function groupByOf(stored: unknown): GroupBy {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return 'kind';
  const value = (stored as { readonly groupBy?: unknown }).groupBy;
  return value === 'chapter' || value === 'kind' ? value : 'kind';
}

/** The filters that depend on chapters; `chapter` is a chapter key, or 'none' for "No chapter yet". */
export interface ChosenFacets {
  readonly kind?: string;
  readonly chapter?: string;
  readonly status?: string;
}

export interface FacetOption {
  readonly title: string;
  readonly count: number;
}
export interface Facets {
  readonly kinds: ReadonlyMap<string, FacetOption>;
  readonly chapters: ReadonlyMap<string, FacetOption>;
  readonly statuses: ReadonlyMap<string, FacetOption>;
}

const inChapter = (row: QueueRow, chaptersOf: (ref: RecordRef) => readonly Chapter[], key: string): boolean => {
  const chapters = chaptersOf(row.ref);
  return key === 'none' ? chapters.length === 0 : chapters.some((chapter) => chapter.key === key);
};

/** The rows that pass the chosen kind, chapter and status. */
export function rowsMatching(rows: readonly QueueRow[], chaptersOf: (ref: RecordRef) => readonly Chapter[], chosen: ChosenFacets): readonly QueueRow[] {
  return rows.filter((row) => (chosen.kind === undefined || row.ref.kind === chosen.kind) && (chosen.status === undefined || row.status === chosen.status) && (chosen.chapter === undefined || inChapter(row, chaptersOf, chosen.chapter)));
}

/**
 * The count of every option of the kind, chapter and status filters, each dimension ignoring its own choice (so an option shows what
 * choosing it would give). A row in several chapters counts once in each.
 */
export function facetCountsOf(rows: readonly QueueRow[], chaptersOf: (ref: RecordRef) => readonly Chapter[], chosen: ChosenFacets): Facets {
  const kinds = new Map<string, { title: string; count: number }>();
  const statuses = new Map<string, { title: string; count: number }>();
  const chapters = new Map<string, { title: string; count: number; order: number }>();
  const bump = <T extends { count: number }>(map: Map<string, T>, key: string, make: () => T): void => void (map.get(key) ?? map.set(key, make()).get(key) as T).count++;
  for (const row of rowsMatching(rows, chaptersOf, { ...chosen, kind: undefined })) bump(kinds, row.ref.kind, () => ({ title: row.kindWords, count: 0 }));
  for (const row of rowsMatching(rows, chaptersOf, { ...chosen, status: undefined })) bump(statuses, row.status, () => ({ title: row.statusWords, count: 0 }));
  for (const row of rowsMatching(rows, chaptersOf, { ...chosen, chapter: undefined })) {
    const list = chaptersOf(row.ref);
    if (list.length === 0) bump(chapters, 'none', () => ({ title: NO_CHAPTER_TITLE, count: 0, order: Number.POSITIVE_INFINITY }));
    for (const chapter of list) bump(chapters, chapter.key, () => ({ title: chapter.title, count: 0, order: chapter.order }));
  }
  const sorted = [...chapters.entries()].sort((a, b) => a[1].order - b[1].order);
  return {
    kinds: new Map([...kinds.entries()].sort((a, b) => (a[1].title < b[1].title ? -1 : 1))),
    chapters: new Map(sorted.map(([key, one]) => [key, { title: one.title, count: one.count }])),
    statuses,
  };
}
