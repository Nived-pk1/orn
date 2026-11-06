/**
 * The exam choice for students (step 8.3b, B1; ADR-046): the select picks an EXAM by its display name. The version used is the exam's current one:
 * the newest `official`, else the newest `provisional` (then the select shows a small "provisional" word). Drafts are an author's business
 * (Studio's Version select). Newest = year, then effective date, then id. Pure over the canonical state; derived, never stored.
 */
import type { CanonicalState, Exam, ExamVersion } from '@/core/schema';
import type { ExamOption, ExamOptions } from './exam-scope';

export const PROVISIONAL_TIP = 'This syllabus is not checked against the official document yet';
const GONE_EXAM = 'An exam that is not in this dataset';

export interface ExamChoice {
  readonly examId: string;
  readonly name: string;
  readonly versionId: string;
  /** The version in use is not official: the select says so in a word. */
  readonly provisional: boolean;
}

const rank = (version: ExamVersion): number => (version.status === 'official' ? 2 : version.status === 'provisional' ? 1 : 0);
const newer = (a: ExamVersion, b: ExamVersion): number =>
  (a.year ?? -1) - (b.year ?? -1) || (a.effectiveFrom ?? '').localeCompare(b.effectiveFrom ?? '') || a.id.localeCompare(b.id);

/** The exam's current version, or undefined when it has none (a draft counts only with `allowDraft`). */
export function currentVersionOf(versions: readonly ExamVersion[], examId: string, options: { readonly allowDraft?: boolean } = {}): ExamVersion | undefined {
  const usable = versions.filter((version) => version.examId === examId && (rank(version) > 0 || options.allowDraft === true));
  return usable.sort((a, b) => rank(b) - rank(a) || newer(b, a))[0];
}

export function examChoicesOf(state: CanonicalState, options: { readonly allowDraft?: boolean } = {}): readonly ExamChoice[] {
  const versions = Object.values(state.records.exam_version as Readonly<Record<string, ExamVersion>>);
  const exams = state.records.exam as Readonly<Record<string, Exam>>;
  const examIds = [...new Set(versions.map((version) => version.examId))];
  const choices: ExamChoice[] = [];
  for (const examId of examIds) {
    const current = currentVersionOf(versions, examId, options);
    if (current === undefined) continue;
    choices.push({ examId, name: exams[examId]?.name ?? GONE_EXAM, versionId: current.id, provisional: current.status !== 'official' });
  }
  return choices.sort((a, b) => a.name.localeCompare(b.name) || a.examId.localeCompare(b.examId));
}

/** The palette's "Choose the exam scope: <exam>" commands: one per exam, named by its display name, carrying its current version (step 8.3b, B1). */
export function examOptionsByExam(state: CanonicalState, options: { readonly allowDraft?: boolean } = {}): ExamOptions {
  return { options: examChoicesOf(state, options).map((choice) => ({ examId: choice.examId as ExamOption['examId'], examVersionId: choice.versionId as ExamOption['examVersionId'], label: choice.name })), omitted: 0 };
}
