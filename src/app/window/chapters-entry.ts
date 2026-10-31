/**
 * How an entry point opens a chapter's page (step 7.3b D4): the inspector's "In chapters" links. Opens that chapter (the filters start clean),
 * remembers the phone's Chapters tab, closes an open family page and switches to the Chapters mode.
 */
import type { NavigatorUiStores } from '@/ui/state';
import { CHAPTERS_MODE } from './modes';

export function openChapter(ui: Pick<NavigatorUiStores, 'chapters' | 'overview' | 'family'>, setMode: (mode: string) => void, chapterId: string): void {
  ui.chapters.getState().open(chapterId);
  ui.overview.getState().setPhoneTab('chapters');
  ui.family.getState().closeFamily();
  setMode(CHAPTERS_MODE);
}
