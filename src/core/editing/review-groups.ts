/**
 * The Review page's groupings (7.3a E1, E3; 7.3b A1, A2). Pure and derived; nothing is stored.
 *  - IMPORT (the default): the import a record arrived with, newest first, named "<file> · imported <time>"; then "Imported before
 *    tracking", "Demo data", "Made in Studio". The id is `provenance.importBatchId`, stamped on every record an import writes.
 *  - CHAPTER: the chapter TOPIC of the record's own mappings (`core/chapters`, shared with the Chapters view). A record in two chapters
 *    is listed in each; a record in none is under "No chapter yet", last.
 *  - KIND: the kind in words.
 */
import { buildChapterIndex, NO_CHAPTER, NO_CHAPTER_TITLE } from '../chapters';
import type { CanonicalState, RecordRef } from '../schema';
import type { QueueRow } from './review-queue';

export { NO_CHAPTER_TITLE };
export type GroupBy = 'import' | 'chapter' | 'kind';

/** A place a row can be listed under: a chapter or an import. */
export interface Chapter {
  readonly key: string;
  readonly title: string;
  /** Position among the places of its dimension. */
  readonly order: number;
}

export interface ReviewGroup {
  readonly key: string;
  readonly title: string;
  /** The title with the number of records: "Kind (n)", or "<file> · imported <time> · n records" for an import. */
  readonly heading: string;
  readonly rows: readonly QueueRow[];
}

/** One import in the journal, newest first. */
export interface ImportLine {
  readonly id: string;
  readonly fileName: string;
  readonly appliedAt: string;
}

export interface GroupPlaces {
  readonly chapters: (ref: RecordRef) => readonly Chapter[];
  readonly imports: (row: QueueRow) => Chapter;
}

const BEFORE_TRACKING = 'Imported before tracking';
const DEMO_DATA = 'Demo data';
const MADE_IN_STUDIO = 'Made in Studio';

export function chapterIndexOf(state: CanonicalState): (ref: RecordRef) => readonly Chapter[] {
  const index = buildChapterIndex(state);
  const info = new Map(index.chapters.map((chapter) => [chapter.id, chapter]));
  return (ref) =>
    index
      .membershipsOf(ref)
      .map((membership) => info.get(membership.chapterId))
      .filter((chapter): chapter is NonNullable<typeof chapter> => chapter !== undefined)
      .map((chapter) => ({ key: chapter.id, title: chapter.title, order: chapter.order }));
}

/** Where a row came from: its import (when the journal knows the id), else by origin. `log` is newest first. */
export function importIndexOf(log: readonly ImportLine[], formatTime: (iso: string) => string): (row: QueueRow) => Chapter {
  const known = new Map(log.map((line, order) => [line.id, { line, order }]));
  const tail = log.length;
  return (row) => {
    const found = row.importBatchId === undefined ? undefined : known.get(row.importBatchId);
    if (found !== undefined) return { key: found.line.id, title: `${found.line.fileName} · imported ${formatTime(found.line.appliedAt)}`, order: found.order };
    if (row.origin === 'seed') return { key: 'demo', title: DEMO_DATA, order: tail + 1 };
    if (row.origin === 'user') return { key: 'studio', title: MADE_IN_STUDIO, order: tail + 2 };
    return { key: 'before', title: BEFORE_TRACKING, order: tail };
  };
}

const recordsWords = (n: number): string => `${n} ${n === 1 ? 'record' : 'records'}`;
const headingOf = (by: GroupBy, title: string, n: number): string => (by === 'import' ? `${title} · ${recordsWords(n)}` : `${title} (${n})`);

export function groupQueueRows(rows: readonly QueueRow[], by: GroupBy, places: GroupPlaces): readonly ReviewGroup[] {
  if (by === 'kind') {
    const groups = new Map<string, QueueRow[]>();
    for (const row of rows) groups.set(row.kindWords, [...(groups.get(row.kindWords) ?? []), row]);
    return [...groups.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([title, list]) => ({ key: `kind:${title}`, title, heading: headingOf(by, title, list.length), rows: list }));
  }
  if (by === 'import') {
    const groups = new Map<string, { place: Chapter; rows: QueueRow[] }>();
    for (const row of rows) {
      const place = places.imports(row);
      const group = groups.get(place.key) ?? { place, rows: [] };
      group.rows.push(row);
      groups.set(place.key, group);
    }
    return [...groups.values()].sort((a, b) => a.place.order - b.place.order).map((g) => ({ key: `import:${g.place.key}`, title: g.place.title, heading: headingOf(by, g.place.title, g.rows.length), rows: g.rows }));
  }
  const groups = new Map<string, { chapter: Chapter; rows: QueueRow[] }>();
  const none: QueueRow[] = [];
  for (const row of rows) {
    const chapters = places.chapters(row.ref);
    if (chapters.length === 0) none.push(row);
    for (const chapter of chapters) {
      const group = groups.get(chapter.key) ?? { chapter, rows: [] };
      group.rows.push(row);
      groups.set(chapter.key, group);
    }
  }
  const out: ReviewGroup[] = [...groups.values()]
    .sort((a, b) => a.chapter.order - b.chapter.order)
    .map((g) => ({ key: `chapter:${g.chapter.key}`, title: g.chapter.title, heading: headingOf(by, g.chapter.title, g.rows.length), rows: g.rows }));
  if (none.length > 0) out.push({ key: `chapter:${NO_CHAPTER}`, title: NO_CHAPTER_TITLE, heading: headingOf(by, NO_CHAPTER_TITLE, none.length), rows: none });
  return out;
}

/** The saved choice of the grouping (`uiState`, key `review`), read tolerantly: anything unusable is Import, the default. */
export function groupByOf(stored: unknown): GroupBy {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return 'import';
  const value = (stored as { readonly groupBy?: unknown }).groupBy;
  return value === 'chapter' || value === 'kind' || value === 'import' ? value : 'import';
}

/** The filters that depend on chapters and imports; `chapter` is a chapter key or 'none'; `import` is an import key. */
export interface ChosenFacets {
  readonly kind?: string;
  readonly chapter?: string;
  readonly status?: string;
  readonly import?: string;
}

export interface FacetOption {
  readonly title: string;
  readonly count: number;
}
export interface Facets {
  readonly kinds: ReadonlyMap<string, FacetOption>;
  readonly chapters: ReadonlyMap<string, FacetOption>;
  readonly statuses: ReadonlyMap<string, FacetOption>;
  readonly imports: ReadonlyMap<string, FacetOption>;
}

const inChapter = (row: QueueRow, places: GroupPlaces, key: string): boolean => {
  const chapters = places.chapters(row.ref);
  return key === NO_CHAPTER ? chapters.length === 0 : chapters.some((chapter) => chapter.key === key);
};

/** The rows that pass the chosen kind, chapter, status and import. */
export function rowsMatching(rows: readonly QueueRow[], places: GroupPlaces, chosen: ChosenFacets): readonly QueueRow[] {
  return rows.filter(
    (row) =>
      (chosen.kind === undefined || row.ref.kind === chosen.kind) &&
      (chosen.status === undefined || row.status === chosen.status) &&
      (chosen.chapter === undefined || inChapter(row, places, chosen.chapter)) &&
      (chosen.import === undefined || places.imports(row).key === chosen.import),
  );
}

/**
 * The count of every option of the kind, chapter, status and import filters, each dimension ignoring its own choice (so an option shows
 * what choosing it would give). A row in several chapters counts once in each.
 */
export function facetCountsOf(rows: readonly QueueRow[], places: GroupPlaces, chosen: ChosenFacets): Facets {
  const kinds = new Map<string, { title: string; count: number }>();
  const statuses = new Map<string, { title: string; count: number }>();
  const chapters = new Map<string, { title: string; count: number; order: number }>();
  const imports = new Map<string, { title: string; count: number; order: number }>();
  const bump = <T extends { count: number }>(map: Map<string, T>, key: string, make: () => T): void => void (map.get(key) ?? map.set(key, make()).get(key) as T).count++;
  for (const row of rowsMatching(rows, places, { ...chosen, kind: undefined })) bump(kinds, row.ref.kind, () => ({ title: row.kindWords, count: 0 }));
  for (const row of rowsMatching(rows, places, { ...chosen, status: undefined })) bump(statuses, row.status, () => ({ title: row.statusWords, count: 0 }));
  for (const row of rowsMatching(rows, places, { ...chosen, chapter: undefined })) {
    const list = places.chapters(row.ref);
    if (list.length === 0) bump(chapters, NO_CHAPTER, () => ({ title: NO_CHAPTER_TITLE, count: 0, order: Number.POSITIVE_INFINITY }));
    for (const chapter of list) bump(chapters, chapter.key, () => ({ title: chapter.title, count: 0, order: chapter.order }));
  }
  for (const row of rowsMatching(rows, places, { ...chosen, import: undefined })) {
    const place = places.imports(row);
    bump(imports, place.key, () => ({ title: place.title, count: 0, order: place.order }));
  }
  const ordered = (map: Map<string, { title: string; count: number; order: number }>): Map<string, FacetOption> =>
    new Map([...map.entries()].sort((a, b) => a[1].order - b[1].order).map(([key, one]) => [key, { title: one.title, count: one.count }]));
  return {
    kinds: new Map([...kinds.entries()].sort((a, b) => (a[1].title < b[1].title ? -1 : 1))),
    chapters: ordered(chapters),
    statuses,
    imports: ordered(imports),
  };
}
