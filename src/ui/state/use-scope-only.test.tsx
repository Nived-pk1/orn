// @vitest-environment jsdom
/** The one switch every view reads (step 8.3b, B2): "Only <exam>" is on when an exam is chosen and the mode says Only. */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createActiveExamStore } from './navigator-stores';
import { useScopeOnly } from './use-scope-only';

describe('useScopeOnly', () => {
  it('follows the exam store: off with no exam, on once an exam is chosen, off again on Everything', () => {
    const exam = createActiveExamStore();
    const { result } = renderHook(() => useScopeOnly(exam));
    expect(result.current).toBe(false);
    act(() => exam.getState().setActive({ examId: 'e' as never, examVersionId: 'v' as never }));
    expect(result.current).toBe(true);
    act(() => exam.getState().setMode('everything'));
    expect(result.current).toBe(false);
    act(() => exam.getState().setMode('only'));
    expect(result.current).toBe(true);
  });
});
