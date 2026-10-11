/**
 * The exam-scope choices (step 5.8; JEE_ONTOLOGY §3, §4): "All (no exam scope)" and every exam version in the data, each named with its
 * exam and its status in words ("JEE Main, provisional, not verified"). Pure over the canonical state; derived, never stored. The
 * choice itself is the navigator's `exam` UI store (saved in `uiState`).
 */
import type { CanonicalState, Exam, ExamId, ExamVersion, ExamVersionId } from '@/core/schema';

export const ALL_LABEL = 'All (no exam scope)';
/** The most versions offered (a dataset with more is cut, and the selector says so). */
export const MAX_EXAM_OPTIONS = 50;

export interface ExamOption {
  readonly examId: ExamId;
  readonly examVersionId: ExamVersionId;
  readonly label: string;
}

export const statusInWords = (status: ExamVersion['status']): string =>
  status === 'official' ? 'official' : status === 'provisional' ? 'provisional, not verified' : 'draft, not verified';

export interface ExamOptions {
  readonly options: readonly ExamOption[];
  /** Versions beyond `MAX_EXAM_OPTIONS`, not offered. */
  readonly omitted: number;
}

export function examOptions(state: CanonicalState): ExamOptions {
  const exams = state.records.exam as Readonly<Record<string, Exam>>;
  const versions = Object.values(state.records.exam_version as Readonly<Record<string, ExamVersion>>);
  const perExam = new Map<string, number>();
  for (const version of versions) perExam.set(version.examId, (perExam.get(version.examId) ?? 0) + 1);
  const nameOf = (version: ExamVersion): string => exams[version.examId]?.name ?? 'An exam that is not in this dataset';
  const sorted = [...versions].sort((a, b) => nameOf(a).localeCompare(nameOf(b)) || (a.year ?? 0) - (b.year ?? 0) || a.id.localeCompare(b.id));
  const options = sorted.slice(0, MAX_EXAM_OPTIONS).map((version) => ({
    examId: version.examId,
    examVersionId: version.id,
    // one version of an exam: the exam's name; several: each version's own label, so two choices never read alike
    label: `${(perExam.get(version.examId) ?? 0) > 1 ? version.label : nameOf(version)}, ${statusInWords(version.status)}`,
  }));
  return { options, omitted: Math.max(0, sorted.length - MAX_EXAM_OPTIONS) };
}

/** The label of the chosen version, or undefined when the data has no such version (a saved choice that no longer exists). */
export function labelOfChoice(options: readonly ExamOption[], examVersionId: string): string | undefined {
  return options.find((option) => option.examVersionId === examVersionId)?.label;
}
