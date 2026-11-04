/** The map's chapter (step 8.2a, D2): the edge set is built from that chapter's reactions only; the rule is the 7.3b one. */
import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { buildChapterIndex } from '@/core/chapters';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { demoState } from '@/test-support/app-boot-kit';
import { navigatorRig } from '@/test-support/navigator-kit';
import { createNavigatorModel } from './pipeline';
import { chapterFilters } from './chapter-filters';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};
const CHAPTER = 'top_alcohols-phenols-ethers';
const reactionsDrawn = (edges: readonly { readonly bundleSize?: number }[]): number => edges.reduce((sum, edge) => sum + (edge.bundleSize ?? 1), 0);

describe('chapterFilters', () => {
  it('no chapter leaves the filters alone; a chapter asks for its topic', () => {
    const base = { scopes: [], topicIds: [], reagentFamilies: [] };
    expect(chapterFilters(base, null)).toBe(base);
    expect(chapterFilters(base, CHAPTER)).toEqual({ scopes: [], topicIds: [CHAPTER], reagentFamilies: [] });
  });

  it('the topic filter gives the reactions of the 7.3b chapter rule (flat tree)', () => {
    const state = demoState();
    const store = createCanonicalStore({ initial: state, revision: 0, validateInitial: false });
    const indexes = createDerivedIndexes({ store, clock: { nowMs: () => 0 } }).current();
    const byFilter = new Set(indexes.recordsInTopic(CHAPTER as never, { transitive: true }).filter((ref) => ref.kind === 'reaction').map((ref) => ref.id));
    const index = buildChapterIndex(state);
    const byRule = new Set(Object.keys(state.records.reaction).filter((id) => index.membershipsOf({ kind: 'reaction', id }).some((m) => m.chapterId === CHAPTER)));
    expect(byFilter.size).toBeGreaterThan(0);
    expect([...byFilter].sort()).toEqual([...byRule].sort());
  });
});

describe('the pipeline with a map chapter', () => {
  it('draws only that chapter\'s reactions and counts only them; "All chapters" brings the rest back', async () => {
    const store = createCanonicalStore({ initial: demoState(), validateInitial: false });
    const rig = navigatorRig(store);
    const model = createNavigatorModel(rig.ports);
    model.start();
    await settle();
    const all = reactionsDrawn(model.getState().scene?.edges ?? []);
    rig.ui.map.getState().setChapter(CHAPTER);
    await settle();
    const chapter = reactionsDrawn(model.getState().scene?.edges ?? []);
    const index = buildChapterIndex(store.getState());
    const inChapter = Object.keys(store.getState().records.reaction).filter((id) => index.membershipsOf({ kind: 'reaction', id }).some((m) => m.chapterId === CHAPTER)).length;
    expect(chapter).toBeGreaterThan(0);
    expect(chapter).toBeLessThanOrEqual(inChapter);
    expect(chapter).toBeLessThan(all);
    rig.ui.map.getState().setChapter(null);
    await settle();
    expect(reactionsDrawn(model.getState().scene?.edges ?? [])).toBe(all);
    model.stop();
  });
});
