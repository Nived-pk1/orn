/**
 * The Syllabus page's core types (7.6 C). Everything here is derived from the canonical state; nothing is stored.
 */
import type { GroupKey } from '../chapters';
import type { CoverageLevel } from '../schema';

/** The two levels a topic can be covered at (an `excluded` row means "not in this syllabus"). */
export type CoveredLevel = Exclude<CoverageLevel, 'excluded'>;

/** Records per kind group at a topic and below, examples folded for reactions (as the Chapters list counts). */
export type TopicCounts = Readonly<Record<GroupKey, number>>;

export interface TopicNode {
  readonly topicId: string;
  readonly name: string;
  readonly topicKind: string;
  /** The chapter a link opens: the nearest chapter at or above the topic (the Chapters view opens chapters only). */
  readonly chapterId: string | undefined;
  readonly coverage: CoveredLevel;
  /** The unit's own note for this topic, when its row has the level shown. */
  readonly note?: string;
  readonly counts: TopicCounts;
  /** Records at the topic and below, each once (examples folded under a reaction are included here, as in the Chapters list). */
  readonly total: number;
  /** Covered, and no record at or below it. */
  readonly gap: boolean;
  readonly children: readonly TopicNode[];
}

export interface ExcludedTopic {
  readonly topicId: string;
  readonly name: string;
}

export interface UnitView {
  readonly id: string;
  readonly code?: string;
  readonly title: string;
  readonly officialText?: string;
  /** The covered topics as a tree (topic tree order). */
  readonly roots: readonly TopicNode[];
  /** "Not in this syllabus": excluded here and covered by no unit of the version. */
  readonly excluded: readonly ExcludedTopic[];
}

export interface SyllabusTotals {
  /** Distinct topics the version covers. */
  readonly topics: number;
  readonly withContent: number;
  readonly gaps: number;
  /** Records at or below a covered topic, each once. */
  readonly records: number;
}

export interface SyllabusPage {
  readonly versionId: string;
  readonly examId: string;
  readonly label: string;
  readonly status: 'official' | 'provisional' | 'draft';
  readonly year?: number;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string;
  readonly units: readonly UnitView[];
  readonly totals: SyllabusTotals;
}

export interface DiffRow {
  readonly topicId: string;
  readonly name: string;
  readonly chapterId: string | undefined;
  /** Records at the topic and below: what the change affects. */
  readonly records: number;
}

export interface ChangedRow extends DiffRow {
  /** The level in the compared version (B) and in this one (A). */
  readonly from: CoveredLevel;
  readonly to: CoveredLevel;
}

export type SyllabusDiff =
  | {
      readonly ok: true;
      /** Covered in A, not in B. */
      readonly added: readonly DiffRow[];
      /** Covered in B, not in A. */
      readonly removed: readonly DiffRow[];
      readonly changed: readonly ChangedRow[];
      readonly empty: boolean;
    }
  | { readonly ok: false; readonly reason: 'different_exams' | 'unknown_version' };
