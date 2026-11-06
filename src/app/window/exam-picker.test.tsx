// @vitest-environment jsdom
/** The exam card (step 8.3b, B3): "Which exam are you preparing for?", one chip per exam and "Just exploring"; the same card is "Change exam" on a phone. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubDialog } from '@/test-support/window-kit';
import { ExamPicker } from './exam-picker';
import type { ExamChoice } from './exam-choice';

beforeEach(stubDialog);
afterEach(cleanup);

const choices: readonly ExamChoice[] = [
  { examId: 'cbse', name: 'CBSE Class 11', versionId: 'v-cbse', provisional: true },
  { examId: 'jee', name: 'JEE Main', versionId: 'v-jee', provisional: false },
];

describe('ExamPicker', () => {
  it('asks the question and offers one chip per exam plus "Just exploring"', () => {
    render(<ExamPicker open choices={choices} title="Which exam are you preparing for?" onChoose={() => undefined} onClose={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Which exam are you preparing for?' }) ?? screen.getByText('Which exam are you preparing for?')).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent).filter((t) => ['CBSE Class 11', 'JEE Main', 'Just exploring'].includes(t ?? ''))).toEqual(['CBSE Class 11', 'JEE Main', 'Just exploring']);
  });
  it('choosing an exam reports it; "Just exploring" reports none (All exams)', () => {
    const onChoose = vi.fn();
    render(<ExamPicker open choices={choices} title="t" onChoose={onChoose} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'JEE Main' }));
    expect(onChoose).toHaveBeenLastCalledWith(choices[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Just exploring' }));
    expect(onChoose).toHaveBeenLastCalledWith(null);
  });
  it('a provisional exam shows no version words (the student sees the exam name only)', () => {
    render(<ExamPicker open choices={choices} title="t" onChoose={() => undefined} onClose={() => undefined} />);
    expect(screen.queryByText(/provisional|v-cbse|version/i)).toBeNull();
  });
  it('the chosen exam is marked when the card is the "Change exam" card', () => {
    render(<ExamPicker open choices={choices} chosenExamId="jee" title="Change exam" onChoose={() => undefined} onClose={() => undefined} />);
    expect(screen.getByRole('button', { name: 'JEE Main' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'CBSE Class 11' }).getAttribute('aria-pressed')).toBe('false');
  });
});
