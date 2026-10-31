/**
 * The Chapters view's core types (7.3b A2, C1, C2). Everything here is derived from the canonical state; nothing is stored.
 */
import type { RecordKind, RecordRef } from '../schema';

export type MappingRole = 'core' | 'supporting' | 'enrichment';
export type CoverageWord = 'included' | 'partial';

/** The id of the pseudo chapter "No chapter yet": records mapped nowhere. */
export const NO_CHAPTER = 'none';
export const NO_CHAPTER_TITLE = 'No chapter yet';

export type GroupKey = 'concepts' | 'reactions' | 'named' | 'mechanisms' | 'caveats' | 'compounds' | 'reagents' | 'routes' | 'transformations';

/** The fixed study order of a chapter page, with the record kinds each group holds. */
export const CHAPTER_GROUPS: readonly { readonly key: GroupKey; readonly title: string; readonly kinds: readonly RecordKind[] }[] = [
  { key: 'concepts', title: 'Concepts', kinds: ['concept'] },
  { key: 'reactions', title: 'Reactions', kinds: ['reaction'] },
  { key: 'named', title: 'Named reactions', kinds: ['named_reaction'] },
  { key: 'mechanisms', title: 'Mechanisms', kinds: ['mechanism'] },
  { key: 'caveats', title: 'Caveats and traps', kinds: ['caveat'] },
  { key: 'compounds', title: 'Compounds and classes', kinds: ['species', 'class'] },
  { key: 'reagents', title: 'Reagents', kinds: ['reagent'] },
  { key: 'routes', title: 'Routes', kinds: ['route'] },
  { key: 'transformations', title: 'Transformations', kinds: ['transformation'] },
];

export interface ChapterInfo {
  /** The chapter topic's id. */
  readonly id: string;
  readonly title: string;
  /** Position in the tree order (sibling order, depth first). */
  readonly order: number;
}

/** One record in one chapter. */
export interface Membership {
  readonly chapterId: string;
  /** The strongest role among the record's mappings in this chapter. */
  readonly role: MappingRole;
  /** Where the record's earliest mapped topic is in the tree order: the "section-topic order". */
  readonly sectionPos: number;
}

export interface ChapterIndex {
  readonly chapters: readonly ChapterInfo[];
  /** The chapters of a record, in chapter order; empty when it is mapped nowhere. */
  membershipsOf(ref: RecordRef): readonly Membership[];
  /** The chapter a topic belongs to: the nearest chapter topic at or above it, else its top-level topic. */
  chapterOfTopic(topicId: string): string | undefined;
}

export interface ExamChip {
  readonly examVersionId: string;
  /** The exam's short name, or its name (words for a chip). */
  readonly examName: string;
  readonly versionLabel: string;
  readonly coverage: CoverageWord;
}

export type KindCounts = Readonly<Record<GroupKey, { readonly core: number; readonly other: number }>>;

export interface ChapterSummary {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly counts: KindCounts;
  /** Records in the chapter, each counted once. */
  readonly total: number;
  readonly exams: readonly ExamChip[];
  /** With an exam scope: how the scoped version covers the chapter. */
  readonly scopeCoverage?: CoverageWord;
}

export interface ChaptersList {
  readonly chapters: readonly ChapterSummary[];
  readonly noChapter: { readonly counts: KindCounts; readonly total: number };
  /** With an exam scope: the number of chapters it hides. */
  readonly hiddenByExam: number;
}

export interface ChapterPart {
  readonly part: MappingRole;
  /** "Also used here" for supporting, "Extra" for enrichment, none for core. */
  readonly title: string | undefined;
  readonly refs: readonly RecordRef[];
}

export interface ChapterGroup {
  readonly key: GroupKey;
  readonly title: string;
  /** Cards (examples of a reaction folded under it are not counted). */
  readonly count: number;
  readonly parts: readonly ChapterPart[];
  /** Reactions only: the general reaction id -> its folded examples, and how many were folded. */
  readonly examplesOf?: ReadonlyMap<string, readonly string[]>;
  readonly exampleOf?: ReadonlyMap<string, string>;
  readonly exampleCount?: number;
}

export interface ChapterContents {
  readonly chapterId: string;
  readonly groups: readonly ChapterGroup[];
}
