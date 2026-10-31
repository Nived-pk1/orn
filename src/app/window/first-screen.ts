/**
 * Which screen the app opens on (step 7.3b D5, E1). Study opens on Chapters when the dataset has at least one chapter topic, else on the
 * Navigator; Studio is unchanged. The rule runs ONCE per start, when data first exists, and only while the visitor has not moved: a mode
 * they already chose stays, and on a phone a tab they chose before (saved) wins (`adoptDefaultTab` does nothing then).
 */
import { useEffect, useRef } from 'react';
import type { CanonicalState } from '@/core/schema';
import { EDITING } from '@/app/edition';
import type { OverviewStore } from '@/ui/state';
import { CHAPTERS_MODE, NAVIGATOR_MODE } from './modes';

export const hasChapterTopic = (state: CanonicalState): boolean => Object.values(state.records.topic).some((topic) => topic.topicKind === 'chapter');

/** True when this edition starts on Chapters for this dataset. */
export const startsOnChapters = (editing: boolean, chapterTopics: boolean): boolean => !editing && chapterTopics;

export function useFirstScreen(args: {
  readonly hasData: boolean;
  readonly chapterTopics: boolean;
  readonly phone: boolean;
  readonly overview: OverviewStore;
  readonly setMode: (update: (current: string) => string) => void;
}): void {
  const { hasData, chapterTopics, phone, overview, setMode } = args;
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !hasData) return;
    decided.current = true;
    if (!startsOnChapters(EDITING, chapterTopics)) return;
    if (phone) overview.getState().adoptDefaultTab('chapters');
    else setMode((current) => (current === NAVIGATOR_MODE ? CHAPTERS_MODE : current));
  }, [hasData, chapterTopics, phone, overview, setMode]);
}
