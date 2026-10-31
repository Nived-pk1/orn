import { describe, expect, it } from 'vitest';
import { emptyRecordTables, type CanonicalState } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { hasChapterTopic, startsOnChapters } from './first-screen';

describe('the first screen (7.3b D5)', () => {
  it('Study starts on Chapters only when the dataset has a chapter topic; Studio never does', () => {
    expect(startsOnChapters(false, true)).toBe(true);
    expect(startsOnChapters(false, false)).toBe(false);
    expect(startsOnChapters(true, true)).toBe(false);
  });
  it('the demo has chapter topics; a dataset with none does not', () => {
    expect(hasChapterTopic(demoState())).toBe(true);
    const bare = { ...demoState(), records: emptyRecordTables() } as CanonicalState;
    expect(hasChapterTopic(bare)).toBe(false);
  });
});
