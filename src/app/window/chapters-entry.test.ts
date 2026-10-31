import { describe, expect, it } from 'vitest';
import { createChaptersStore, createFamilyStore, createOverviewStore } from '@/ui/state';
import { openChapter } from './chapters-entry';

describe('openChapter (7.3b D4)', () => {
  it('opens the chapter with clean filters, remembers the Chapters tab, closes a family page and switches the mode', () => {
    const ui = { chapters: createChaptersStore({ kinds: ['concepts'], text: 'x' }), overview: createOverviewStore(), family: createFamilyStore('hub_a') };
    const modes: string[] = [];
    openChapter(ui, (mode) => modes.push(mode), 'top_chap-a');
    expect(ui.chapters.getState()).toMatchObject({ chapterId: 'top_chap-a', kinds: [], text: '' });
    expect(ui.overview.getState().phoneTab).toBe('chapters');
    expect(ui.family.getState().open).toBeNull();
    expect(modes).toEqual(['chapters']);
  });
});
