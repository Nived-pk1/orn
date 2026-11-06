/** The exam choice's UI state (step 8.3b, B2, B3): "Only <exam>" or "Everything", and whether the first-run card was answered. Optional fields, no version bump. */
import { describe, expect, it } from 'vitest';
import { effectiveOnly, parseExamChoice } from './exam-state';
import { createNavigatorUi, parseNavigatorUi, type NavigatorUiPort } from './navigator-persist';

const timers = () => ({ after: (_ms: number, _run: () => void) => () => undefined });

describe('parseExamChoice', () => {
  it('nothing saved: Only, not asked, no damage', () => {
    expect(parseExamChoice(undefined)).toEqual({ mode: 'only', asked: false, damaged: [] });
  });
  it('reads good fields and names a damaged one without touching the other', () => {
    expect(parseExamChoice({ mode: 'everything', asked: true })).toEqual({ mode: 'everything', asked: true, damaged: [] });
    const bad = parseExamChoice({ mode: 'sideways', asked: true });
    expect(bad).toEqual({ mode: 'only', asked: true, damaged: ['examChoice.mode'] });
    expect(parseExamChoice({ asked: 'yes' }).damaged).toEqual(['examChoice.asked']);
    expect(parseExamChoice('nope').damaged).toEqual(['examChoice']);
  });
});

describe('effectiveOnly', () => {
  it('"Only" applies only with an exam chosen', () => {
    expect(effectiveOnly({ active: null, mode: 'only' })).toBe(false);
    expect(effectiveOnly({ active: { examId: 'e', examVersionId: 'v' } as never, mode: 'only' })).toBe(true);
    expect(effectiveOnly({ active: { examId: 'e', examVersionId: 'v' } as never, mode: 'everything' })).toBe(false);
  });
});

describe('the exam choice part of uiState', () => {
  it('is saved with the entry and read back', async () => {
    const saves: Record<string, unknown>[] = [];
    const port: NavigatorUiPort = { stored: undefined, mode: () => 'writable', save: (v) => (saves.push({ ...v }), Promise.resolve()) };
    const ui = createNavigatorUi(port, { after: (_ms, run) => { run(); return () => undefined; } });
    ui.stores.exam.getState().setMode('everything');
    ui.stores.exam.getState().setAsked(true);
    await ui.flush();
    const saved = saves.at(-1) as Record<string, unknown>;
    expect(saved.examChoice).toEqual({ mode: 'everything', asked: true });
    const again = createNavigatorUi({ stored: saved, mode: () => 'writable', save: () => Promise.resolve() }, timers());
    expect(again.stores.exam.getState()).toMatchObject({ mode: 'everything', asked: true });
    ui.dispose();
    again.dispose();
  });
  it('an entry saved before this step has no examChoice: Only, not asked, and nothing is reported damaged', () => {
    const parsed = parseNavigatorUi({ activeExam: { examId: 'e1', examVersionId: 'v1' } });
    expect(parsed.examChoice).toEqual({ mode: 'only', asked: false, damaged: [] });
    expect(parsed.damaged).toEqual([]);
  });
});
