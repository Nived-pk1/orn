import { describe, expect, it } from 'vitest';
import type { CanonicalState } from '@/core/schema';
import { ALL_LABEL, examOptions } from './exam-scope';

const exam = (id: string, name: string) => ({ id: `exm_${id}`, name });
const version = (id: string, examBody: string, label: string, status: string, year?: number) => ({ id: `exv_${id}`, examId: `exm_${examBody}`, label, status, year });
const stateOf = (exams: object[], versions: object[]) =>
  ({
    records: {
      exam: Object.fromEntries(exams.map((e) => [(e as { id: string }).id, e])),
      exam_version: Object.fromEntries(versions.map((v) => [(v as { id: string }).id, v])),
    },
  }) as unknown as CanonicalState;

describe('the exam scope choices', () => {
  it('are a flat list by exam name, then year; "All (no exam scope)" is not among them (the selector puts it first)', () => {
    const state = stateOf(
      [exam('z', 'Zeta entrance test'), exam('a', 'Alpha board exam')],
      [version('z1', 'z', 'Zeta 2026', 'official', 2026), version('a2', 'a', 'Alpha 2027', 'draft', 2027), version('a1', 'a', 'Alpha 2026', 'official', 2026)],
    );
    const { options, omitted } = examOptions(state);
    expect(options.map((o) => o.label)).toEqual(['Alpha 2026, official', 'Alpha 2027, draft, not verified', 'Zeta entrance test, official']);
    expect(options.some((o) => o.label === ALL_LABEL)).toBe(false);
    expect(omitted).toBe(0);
  });
});
