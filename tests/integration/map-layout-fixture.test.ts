/**
 * The map layout fixture (step 8.2a Part C): own data, NOT demo data, about the size of the user's real data. It imports through the normal
 * parser, has no L1-L3 error, and has the shapes the map clean-up is judged on: about 20 families in 4 groups, about 80 family-to-family
 * arrows, two-way pairs, families with reactions inside, reactions into no family, three chapters with arrows that cross chapters.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import { navigatorProjection } from '@/core/graph';
import { buildChapterIndex } from '@/core/chapters';
import { validateEverything } from '@/test-support/rule-harness';
import { contextOf, requestOf } from '@/test-support/graph-state';

const raw: unknown = JSON.parse(readFileSync(new URL('./../fixtures/map-layout/map-layout.orn.json', import.meta.url), 'utf8'));
const parsed = documentToState(raw as never);
if (!parsed.ok) throw new Error('the layout fixture has duplicate ids');
const state = parsed.state;

describe('map layout fixture', () => {
  it('has no L1 finding and no error', () => {
    const found = validateEverything(state);
    expect(found.filter((f) => f.level === 1 || f.severity === 'error')).toEqual([]);
  });

  it('has the sizes and shapes the map is judged on', () => {
    const projection = navigatorProjection.build(contextOf(state), requestOf('navigator'));
    const hubs = projection.nodes.filter((n) => n.role === 'anchor');
    expect(hubs.length).toBe(20);
    expect(new Set(hubs.map((n) => n.arrangement?.group)).size).toBe(4);
    const paths = new Set(projection.bundles.map((b) => `${b.from}>${b.to}`));
    for (const edge of projection.edges) paths.add(`${edge.from}>${edge.to}`);
    const between = [...paths].filter((p) => { const [a, b] = p.split('>') as [string, string]; return a !== b && !p.includes('unclassified'); });
    expect(between.length).toBeGreaterThanOrEqual(80);
    const twoWay = between.filter((p) => { const [a, b] = p.split('>') as [string, string]; return a < b && between.includes(`${b}>${a}`); });
    expect(twoWay.length).toBeGreaterThanOrEqual(6);
    const loops = [...paths].filter((p) => { const [a, b] = p.split('>') as [string, string]; return a === b; });
    expect(loops.length).toBeGreaterThanOrEqual(4);
    expect(projection.nodes.some((n) => n.role === 'unclassified')).toBe(true);
    expect(projection.truncation).toBeNull();
  });

  it('has reactions into no family and reactions in four chapters (three busy, one small), with arrows that cross chapters', () => {
    const projection = navigatorProjection.build(contextOf(state), requestOf('navigator'));
    const intoNone = projection.edges.filter((e) => e.to.includes('unclassified') || projection.nodes.find((n) => n.id === e.to)?.role === 'unclassified');
    expect(new Set(intoNone.map((e) => e.reactionId)).size).toBeGreaterThanOrEqual(5);
    const index = buildChapterIndex(state);
    expect(index.chapters.length).toBe(4);
    const chaptersOfPair = new Map<string, Set<string>>();
    for (const edge of projection.edges) {
      if (edge.reactionId === undefined) continue;
      const set = chaptersOfPair.get(`${edge.from}>${edge.to}`) ?? new Set<string>();
      for (const m of index.membershipsOf({ kind: 'reaction', id: edge.reactionId })) set.add(m.chapterId);
      chaptersOfPair.set(`${edge.from}>${edge.to}`, set);
    }
    expect([...chaptersOfPair.values()].some((s) => s.size >= 2)).toBe(true);
  });

  it('Chapter 4 is small (step 8.2b-fix, E5): three arrows once the two-way pair is one line, so it is not a busy chapter', () => {
    const projection = navigatorProjection.build(contextOf(state), requestOf('navigator'));
    const index = buildChapterIndex(state);
    const pairs = new Set<string>();
    for (const edge of projection.edges) {
      if (edge.reactionId === undefined || !index.membershipsOf({ kind: 'reaction', id: edge.reactionId }).some((m) => m.chapterId === 'top_chapter-4')) continue;
      pairs.add(edge.from < edge.to ? `${edge.from}|${edge.to}` : `${edge.to}|${edge.from}`);
    }
    expect(pairs.size).toBe(3);
    expect(pairs.has('cls_family-08|cls_family-13')).toBe(true);
  });
});
