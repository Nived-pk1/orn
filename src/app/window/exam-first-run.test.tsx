// @vitest-environment jsdom
/** The Study first run and the phone's exam chip (step 8.3b, B3): ask once which exam, never guess, never ask again. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalState } from "@/core/schema";
import { stubDialog } from "@/test-support/window-kit";
import { createActiveExamStore } from "@/ui/state";
import { ExamFirstRun } from "./exam-first-run";
import type { ExamScopeBinding } from "./exam-scope-selector";

beforeEach(stubDialog);
afterEach(cleanup);

const state = {
  records: {
    exam: { exm_jee: { id: 'exm_jee', name: 'JEE Main' }, exm_cbse: { id: 'exm_cbse', name: 'CBSE Class 11' } },
    exam_version: {
      exv_jee: { id: 'exv_jee', kind: 'exam_version', examId: 'exm_jee', label: 'JEE Main 2026', status: 'official', year: 2026, units: [] },
      exv_cbse: { id: 'exv_cbse', kind: 'exam_version', examId: 'exm_cbse', label: 'CBSE 2026', status: 'provisional', year: 2026, units: [] },
    },
  },
} as unknown as CanonicalState;

function setup(over: { hasData?: boolean; asked?: boolean; empty?: boolean } = {}) {
  const exam = createActiveExamStore(null, { asked: over.asked ?? false });
  const data = over.empty === true ? ({ records: { exam: {}, exam_version: {} } } as unknown as CanonicalState) : state;
  const binding: ExamScopeBinding = { exam, store: { getState: () => data, subscribe: () => () => undefined }, hasData: over.hasData ?? true, log: vi.fn() };
  return { exam, binding };
}

describe('ExamFirstRun', () => {
  it('asks "Which exam are you preparing for?" with a chip per exam and "Just exploring"', () => {
    const { binding } = setup();
    render(<ExamFirstRun binding={binding} />);
    expect(screen.getByText('Which exam are you preparing for?')).toBeTruthy();
    for (const name of ['CBSE Class 11', 'JEE Main', 'Just exploring']) expect(screen.getByRole('button', { name })).toBeTruthy();
  });
  it('choosing an exam sets it with its current version and "Only", and the card never comes back', () => {
    const { exam, binding } = setup();
    render(<ExamFirstRun binding={binding} />);
    fireEvent.click(screen.getByRole('button', { name: 'JEE Main' }));
    expect(exam.getState()).toMatchObject({ active: { examId: 'exm_jee', examVersionId: 'exv_jee' }, mode: 'only', asked: true });
    expect(screen.queryByText('Which exam are you preparing for?')).toBeNull();
  });
  it('"Just exploring" means All exams and asked: the app never guesses an exam', () => {
    const { exam, binding } = setup();
    render(<ExamFirstRun binding={binding} />);
    fireEvent.click(screen.getByRole('button', { name: 'Just exploring' }));
    expect(exam.getState()).toMatchObject({ active: null, asked: true });
    expect(screen.queryByText('Which exam are you preparing for?')).toBeNull();
  });
  it('closing the card without choosing counts as Just exploring (it does not come back, and no exam is guessed)', () => {
    const { exam, binding } = setup();
    render(<ExamFirstRun binding={binding} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent(screen.getByRole('dialog', { hidden: true }), new Event('cancel', { cancelable: true }));
    expect(exam.getState().active).toBeNull();
    expect(exam.getState().asked).toBe(true);
  });
  it('not shown once asked, before the data is there, or when the data has no exam', () => {
    for (const over of [{ asked: true }, { hasData: false }, { empty: true }]) {
      cleanup();
      const { binding } = setup(over);
      render(<ExamFirstRun binding={binding} />);
      expect(screen.queryByText('Which exam are you preparing for?')).toBeNull();
    }
  });
});
