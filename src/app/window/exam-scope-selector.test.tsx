// @vitest-environment jsdom
/**
 * The exam selector (step 8.3b, B1, B2): it picks an EXAM by its display name (the version used is the exam's current one); Studio also shows a
 * Version select; with an exam chosen a two-choice switch "Only <exam> | Everything" appears; a provisional version shows a small word.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalState } from '@/core/schema';
import { ToastProvider } from '@/ui/primitives';
import { createActiveExamStore } from '@/ui/state';
import { STUDIO_CHROME, studyChrome, StudyChromeProvider } from '@/ui/study-chrome';
import { ExamScopeSelector, type ExamScopeBinding } from './exam-scope-selector';

afterEach(cleanup);

const state = {
  records: {
    exam: { exm_jee: { id: 'exm_jee', name: 'JEE Main' }, exm_cbse: { id: 'exm_cbse', name: 'CBSE Class 11' } },
    exam_version: {
      exv_jee_2025: { id: 'exv_jee_2025', kind: 'exam_version', examId: 'exm_jee', label: 'JEE Main 2025', status: 'official', year: 2025, units: [] },
      exv_jee_2026: { id: 'exv_jee_2026', kind: 'exam_version', examId: 'exm_jee', label: 'JEE Main 2026', status: 'provisional', year: 2026, units: [] },
      exv_cbse_2026: { id: 'exv_cbse_2026', kind: 'exam_version', examId: 'exm_cbse', label: 'CBSE 2026', status: 'provisional', year: 2026, units: [] },
    },
  },
} as unknown as CanonicalState;

function setup(edition: 'study' | 'studio', initial: { examId: string; examVersionId: string } | null = null) {
  const exam = createActiveExamStore(initial as never);
  const binding: ExamScopeBinding = { exam, store: { getState: () => state, subscribe: () => () => undefined }, hasData: true, log: vi.fn() };
  const chrome = edition === 'studio' ? STUDIO_CHROME : studyChrome('study', { ownData: false });
  render(
    <ToastProvider>
      <StudyChromeProvider value={chrome}>
        <ExamScopeSelector binding={binding} />
      </StudyChromeProvider>
    </ToastProvider>,
  );
  return exam;
}

const examSelect = (): HTMLSelectElement => screen.getByRole('combobox', { name: 'Exam' }) as HTMLSelectElement;

describe('ExamScopeSelector, the student edition', () => {
  it('lists All exams and each exam by its display name (no version words, no ids)', () => {
    setup('study');
    expect([...examSelect().options].map((o) => o.textContent)).toEqual(['All exams', 'CBSE Class 11', 'JEE Main']);
    expect(screen.queryByRole('combobox', { name: 'Version' })).toBeNull();
    expect(screen.queryByText(/exv_|exm_|no exam scope/i)).toBeNull();
  });
  it('choosing an exam uses its current version: the official one wins over a newer provisional one', () => {
    const exam = setup('study');
    fireEvent.change(examSelect(), { target: { value: 'exm_jee' } });
    expect(exam.getState().active).toEqual({ examId: 'exm_jee', examVersionId: 'exv_jee_2025' });
  });
  it('a provisional exam shows a small "provisional" word with the tooltip', () => {
    setup('study', { examId: 'exm_cbse', examVersionId: 'exv_cbse_2026' });
    const word = screen.getByText('provisional');
    expect(word.getAttribute('title')).toBe('This syllabus is not checked against the official document yet');
  });
  it('no word for an official version, and none with All exams', () => {
    setup('study', { examId: 'exm_jee', examVersionId: 'exv_jee_2025' });
    expect(screen.queryByText('provisional')).toBeNull();
    cleanup();
    setup('study');
    expect(screen.queryByText('provisional')).toBeNull();
  });
  it('the switch appears with an exam chosen: "Only JEE Main" is on by default; Everything turns it off and back', () => {
    const exam = setup('study');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    act(() => exam.getState().setActive({ examId: 'exm_jee', examVersionId: 'exv_jee_2025' } as never));
    const group = screen.getByRole('radiogroup', { name: 'Show' });
    const only = within(group).getByRole('radio', { name: 'Only JEE Main' }) as HTMLInputElement;
    expect(only.checked).toBe(true);
    fireEvent.click(within(group).getByRole('radio', { name: 'Everything' }));
    expect(exam.getState().mode).toBe('everything');
    fireEvent.click(within(group).getByRole('radio', { name: 'Only JEE Main' }));
    expect(exam.getState().mode).toBe('only');
  });
  it('choosing All exams clears the exam and the switch goes away', () => {
    const exam = setup('study', { examId: 'exm_jee', examVersionId: 'exv_jee_2025' });
    fireEvent.change(examSelect(), { target: { value: '' } });
    expect(exam.getState().active).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
  it('a saved older version of the exam is brought to the exam\'s current one (the student never picks a version)', () => {
    const exam = setup('study', { examId: 'exm_jee', examVersionId: 'exv_jee_2026' });
    expect(exam.getState().active).toEqual({ examId: 'exm_jee', examVersionId: 'exv_jee_2025' });
  });
});

describe('ExamScopeSelector, Studio', () => {
  it('also shows a Version select with every version of the chosen exam, in words with their status; changing it keeps the exam', () => {
    const exam = setup('studio', { examId: 'exm_jee', examVersionId: 'exv_jee_2025' });
    const version = screen.getByRole('combobox', { name: 'Version' }) as HTMLSelectElement;
    expect([...version.options].map((o) => o.textContent)).toEqual(['JEE Main 2025, official', 'JEE Main 2026, provisional, not verified']);
    fireEvent.change(version, { target: { value: 'exv_jee_2026' } });
    expect(exam.getState().active).toEqual({ examId: 'exm_jee', examVersionId: 'exv_jee_2026' });
  });
  it('a Studio choice of an older version is kept (author tool, unchanged behaviour)', () => {
    const exam = setup('studio', { examId: 'exm_jee', examVersionId: 'exv_jee_2026' });
    expect(exam.getState().active).toEqual({ examId: 'exm_jee', examVersionId: 'exv_jee_2026' });
  });
  it('no Version select while All exams is chosen', () => {
    setup('studio');
    expect(screen.queryByRole('combobox', { name: 'Version' })).toBeNull();
  });
});
