/** The exam choice for students (step 8.3b, B1): the select picks an EXAM; the version used is the exam's current one (newest official, else newest provisional). */
import { describe, expect, it } from 'vitest';
import type { CanonicalState, ExamVersion } from '@/core/schema';
import { currentVersionOf, examChoicesOf, examOptionsByExam, PROVISIONAL_TIP } from './exam-choice';

const version = (id: string, examId: string, status: ExamVersion['status'], year?: number, effectiveFrom?: string): ExamVersion =>
  ({ id, kind: 'exam_version', examId, label: id, status, ...(year === undefined ? {} : { year }), ...(effectiveFrom === undefined ? {} : { effectiveFrom }), units: [] }) as unknown as ExamVersion;
const stateOf = (exams: Record<string, string>, versions: readonly ExamVersion[]): CanonicalState =>
  ({ records: { exam: Object.fromEntries(Object.entries(exams).map(([id, name]) => [id, { id, name }])), exam_version: Object.fromEntries(versions.map((v) => [v.id, v])) } }) as unknown as CanonicalState;

describe('currentVersionOf', () => {
  it('an official version wins over a newer provisional one', () => {
    const list = [version('v1', 'e', 'provisional', 2026), version('v2', 'e', 'official', 2024)];
    expect(currentVersionOf(list, 'e')?.id).toBe('v2');
  });
  it('the newest wins among the same status (year, then effective date, then id)', () => {
    expect(currentVersionOf([version('a', 'e', 'official', 2023), version('b', 'e', 'official', 2025)], 'e')?.id).toBe('b');
    expect(currentVersionOf([version('a', 'e', 'official', 2025, '2025-01-01'), version('b', 'e', 'official', 2025, '2025-06-01')], 'e')?.id).toBe('b');
    expect(currentVersionOf([version('a', 'e', 'official', 2025), version('b', 'e', 'official', 2025)], 'e')?.id).toBe('b');
  });
  it('provisional is the fallback when nothing is official', () => {
    expect(currentVersionOf([version('a', 'e', 'provisional', 2024), version('b', 'e', 'provisional', 2026)], 'e')?.id).toBe('b');
  });
  it('none: no version, only other exams, or only drafts (unless a draft is asked for)', () => {
    expect(currentVersionOf([], 'e')).toBeUndefined();
    expect(currentVersionOf([version('a', 'other', 'official', 2024)], 'e')).toBeUndefined();
    expect(currentVersionOf([version('a', 'e', 'draft', 2024)], 'e')).toBeUndefined();
    expect(currentVersionOf([version('a', 'e', 'draft', 2024)], 'e', { allowDraft: true })?.id).toBe('a');
  });
  it('an unknown year sorts oldest', () => {
    expect(currentVersionOf([version('a', 'e', 'official'), version('b', 'e', 'official', 2020)], 'e')?.id).toBe('b');
  });
});

describe('examOptionsByExam', () => {
  it('the palette commands name an exam by its display name and carry its current version', () => {
    const state = stateOf({ jee: 'JEE Main', cbse: 'CBSE Class 11' }, [version('jee-1', 'jee', 'official', 2025), version('cbse-1', 'cbse', 'provisional', 2025)]);
    expect(examOptionsByExam(state).options).toEqual([
      { examId: 'cbse', examVersionId: 'cbse-1', label: 'CBSE Class 11' },
      { examId: 'jee', examVersionId: 'jee-1', label: 'JEE Main' },
    ]);
    expect(examOptionsByExam(state).omitted).toBe(0);
  });
});

describe('examChoicesOf', () => {
  const state = stateOf({ jee: 'JEE Main', cbse: 'CBSE Class 11', ghost: 'Ghost exam' }, [
    version('jee-1', 'jee', 'official', 2025),
    version('cbse-1', 'cbse', 'provisional', 2025),
    version('ghost-1', 'ghost', 'draft', 2025),
  ]);
  it('one choice per exam with a current version, named by the exam, sorted by name; drafts-only exams are left out', () => {
    expect(examChoicesOf(state).map((c) => [c.name, c.versionId, c.provisional])).toEqual([
      ['CBSE Class 11', 'cbse-1', true],
      ['JEE Main', 'jee-1', false],
    ]);
  });
  it('Studio (allowDraft) lists the draft-only exam too', () => {
    expect(examChoicesOf(state, { allowDraft: true }).map((c) => c.name)).toEqual(['CBSE Class 11', 'Ghost exam', 'JEE Main']);
  });
  it('the provisional tooltip words', () => {
    expect(PROVISIONAL_TIP).toBe('This syllabus is not checked against the official document yet');
  });
  it('an exam record that is gone: the version still shows under a plain name, never an id', () => {
    const lonely = stateOf({}, [version('x-1', 'exam_gone', 'official', 2025)]);
    expect(examChoicesOf(lonely).map((c) => c.name)).toEqual(['An exam that is not in this dataset']);
  });
});
