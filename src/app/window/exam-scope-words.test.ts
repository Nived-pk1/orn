/** The exam select in plain words (step 8.3, C5): "Exam", "All exams", each exam by its display name; Studio keeps the status words. */
import { describe, expect, it } from 'vitest';
import { ALL_LABEL, EXAM_LABEL, examOptions } from './exam-scope';
import type { CanonicalState } from '@/core/schema';

const state = {
  records: {
    exam: { exm_main: { id: 'exm_main', name: 'JEE Main' }, exm_adv: { id: 'exm_adv', name: 'JEE Advanced' } },
    exam_version: {
      ev_main: { id: 'ev_main', examId: 'exm_main', label: 'JEE Main 2025', year: 2025, status: 'provisional' },
      ev_adv: { id: 'ev_adv', examId: 'exm_adv', label: 'JEE Advanced 2025', year: 2025, status: 'official' },
    },
  },
} as unknown as CanonicalState;

describe('exam select words', () => {
  it('the label is "Exam" and the first option "All exams"', () => {
    expect(EXAM_LABEL).toBe('Exam');
    expect(ALL_LABEL).toBe('All exams');
  });
  it('Studio: the name and its status in words', () => {
    expect(examOptions(state).options.map((o) => o.label)).toEqual(['JEE Advanced, official', 'JEE Main, provisional, not verified']);
  });
  it('Study: the exam display name only, no status words and no ids', () => {
    const labels = examOptions(state, { statusWords: false }).options.map((o) => o.label);
    expect(labels).toEqual(['JEE Advanced', 'JEE Main']);
    for (const label of labels) expect(label).not.toMatch(/exm_|ev_|provisional|official/);
  });
});
