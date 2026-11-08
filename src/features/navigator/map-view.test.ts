/** The map's derived view (step 8.2a, D1 to D5): which arrows are drawn, their style, merged pairs, faded boxes, captions, Unclassified. Pure. */
import { describe, expect, it } from 'vitest';
import type { Scene, SceneEdge, SceneNode } from '@/render/scene';
import { withChips } from './map-chips';
import { pairGapPx, pairSeparationMap, strokePx } from '@/render/svg';
import { mapView } from './map-view';

const text = (s: string) => [{ text: s }];
function node(id: string, x: number, over: Partial<SceneNode> = {}): SceneNode {
  return { id, glyph: 'class_hub', box: 'hub', x, y: 0, width: 100, height: 40, label: text(`Fam ${id}`), badges: [], emphasis: 'anchor', state: { dimmed: false, onPath: false }, minLod: 0, ariaLabel: `Fam ${id}, family`, group: 'G', tone: 'blue', ...over };
}
function edge(id: string, from: string, to: string, size?: number, points?: SceneEdge['points']): SceneEdge {
  return { id, from, to, points: points ?? [{ x: 0, y: 20 }, { x: 100, y: 20 }], semantic: 'produces', stroke: 'solid', weight: 'normal', arrowHead: 'filled', labelAt: { x: 50, y: 20 }, ...(size === undefined ? {} : { bundleSize: size }), minLod: 0, ariaLabel: `${from} to ${to}` } as SceneEdge;
}
const counts = (loops: number) => ({ out: 0, in: 0, loops, outAll: 0, inAll: 0 });
function sceneOf(): Scene {
  const nodes = [node('a', 0, { reactionCounts: counts(4) }), node('b', 200, { tone: 'green' }), node('c', 400, { reactionCounts: counts(1) }), node('d', 600), node('u', 800, { box: 'unclassified', glyph: 'unclassified' })];
  const edges = [edge('ab', 'a', 'b', 3), edge('ba', 'b', 'a', 2, [{ x: 100, y: 20 }, { x: 0, y: 20 }]), edge('ac', 'a', 'c'), edge('cd', 'c', 'd', 5), edge('aa', 'a', 'a', 4), edge('du', 'd', 'u', 2), edge('au', 'a', 'u')];
  return { revision: 1, projectionKey: 'k', layoutKey: 'l', nodes, edges, bounds: { width: 900, height: 100 }, truncation: null };
}
const quiet = { focusId: null, chapter: false, showUnclassified: false } as const;

describe('mapView', () => {
  it('draws no arrow with nothing selected and fades nothing (D1)', () => {
    const view = mapView(sceneOf(), quiet);
    expect(view.scene.edges).toEqual([]);
    expect(view.quiet).toBe(true);
    expect(view.marks.faded.size).toBe(0);
  });

  it('a focused family draws exactly its own in and out arrows: makes solid in its tone, made from dashed without a tone', () => {
    const view = mapView(sceneOf(), { ...quiet, focusId: 'b' });
    expect(view.quiet).toBe(false);
    const byId = new Map(view.scene.edges.map((e) => [e.id, e]));
    expect([...byId.keys()].sort()).toEqual(['ab', 'ba']);
    expect(byId.get('ba')?.stroke).toBe('solid');
    expect(view.marks.edges.get('ba')).toMatchObject({ role: 'makes', tone: 'green' });
    expect(byId.get('ab')?.stroke).toBe('dashed');
    expect(view.marks.edges.get('ab')?.role).toBe('madeFrom');
    expect(view.marks.edges.get('ab')?.tone).toBeUndefined();
  });

  it('fades every box but the focus and the ends of the drawn arrows', () => {
    const view = mapView(sceneOf(), { ...quiet, focusId: 'b' });
    expect([...view.marks.faded].sort()).toEqual(['c', 'd']); // a is an end, b the focus; u is hidden, so it is not drawn at all
  });

  // step 8.4c, C (user decision 2026-11-08, ADR-044 addendum): a two-way pair is TWO parallel lines, one per direction, in the chapter and in a focus alike
  const perpendicular = (first: SceneEdge, second: SceneEdge): number => {
    const a = first.points[0] as { x: number; y: number };
    const b = first.points[first.points.length - 1] as { x: number; y: number };
    const m = second.points[0] as { x: number; y: number };
    const run = Math.hypot(b.x - a.x, b.y - a.y);
    return Math.abs(((m.x - a.x) * (b.y - a.y) - (m.y - a.y) * (b.x - a.x)) / run);
  };
  for (const zoom of [0.7, 1, 1.2, 2]) { // below about 0.6 the cap (the room on a box side) applies: see the next test
    it(`the two lines of a pair are ${'`pairSeparationMap`'} apart at zoom ${zoom} (stroke edges 8 to 16 px apart on the screen), in a focus and in a chapter`, () => {
      const wanted = pairSeparationMap(zoom);
      for (const options of [{ ...quiet, focusId: 'a' }, { ...quiet, chapter: true }]) {
        const view = mapView(sceneOf(), { ...options, zoom });
        const first = view.scene.edges.find((e) => e.id === 'ab') as SceneEdge;
        const second = view.scene.edges.find((e) => e.id === 'ba') as SceneEdge;
        expect(perpendicular(first, second)).toBeCloseTo(wanted, 4);
        expect(perpendicular(first, second) * zoom - strokePx('normal', zoom)).toBeGreaterThanOrEqual(8 - 1e-6);
        expect(perpendicular(first, second) * zoom - strokePx('normal', zoom)).toBeLessThanOrEqual(16 + 1e-6);
      }
    });
  }

  it('far out (zoom 0.4) the lines are moved apart by no more than the room on a box side: 20 map units', () => {
    const view = mapView(sceneOf(), { ...quiet, chapter: true, zoom: 0.4 });
    const first = view.scene.edges.find((e) => e.id === 'ab') as SceneEdge;
    const second = view.scene.edges.find((e) => e.id === 'ba') as SceneEdge;
    expect(perpendicular(first, second)).toBeCloseTo(20, 4);
  });

  it('heavier lines are further apart: the stroke EDGES keep the gap whatever the weight', () => {
    const scene = sceneOf();
    const heavy: Scene = { ...scene, edges: scene.edges.map((e) => (e.id === 'ab' || e.id === 'ba' ? { ...e, weight: 'heavy' as const } : e)) };
    const view = mapView(heavy, { ...quiet, chapter: true, zoom: 0.8 });
    const first = view.scene.edges.find((e) => e.id === 'ab') as SceneEdge;
    const second = view.scene.edges.find((e) => e.id === 'ba') as SceneEdge;
    expect(perpendicular(first, second) * 0.8 - strokePx('heavy', 0.8)).toBeCloseTo(pairGapPx(0.8), 4);
  });

  it('a pair keeps the side each line was on (the order the layout chose) and its direction and ends', () => {
    const scene = sceneOf();
    const lower: Scene = { ...scene, edges: scene.edges.map((e) => (e.id === 'ba' ? { ...e, points: [{ x: 100, y: 32 }, { x: 0, y: 32 }] } : e)) };
    const view = mapView(lower, { ...quiet, chapter: true, zoom: 1 });
    const first = view.scene.edges.find((e) => e.id === 'ab') as SceneEdge;
    const second = view.scene.edges.find((e) => e.id === 'ba') as SceneEdge;
    expect((second.points[0]?.x ?? 0) > (second.points[1]?.x ?? 0)).toBe(true); // b to a still runs right to left
    expect(second.points[0]?.y).toBeGreaterThan(first.points[0]?.y ?? 0); // b to a stayed below a to b
    expect((first.points[0]?.x ?? 1) < (first.points[1]?.x ?? 0)).toBe(true);
  });

  it('a chapter draws all its arrows, a two-way pair as two lines, each solid and in ink with its own mark and its own spoken name (D2, D3)', () => {
    const view = mapView(sceneOf(), { ...quiet, chapter: true });
    expect(view.scene.edges.map((e) => e.id).sort()).toEqual(['ab', 'ac', 'ba', 'cd']); // loops and Unclassified arrows are not drawn
    for (const id of ['ab', 'ba']) {
      const line = view.scene.edges.find((e) => e.id === id) as SceneEdge;
      expect(line.stroke).toBe('solid');
      expect(line.ariaLabel).toBe(id === 'ab' ? 'a to b' : 'b to a');
      expect(view.marks.edges.get(id)).toMatchObject({ role: 'makes', paired: true });
      expect(view.marks.edges.get(id)?.tone).toBeUndefined(); // nothing selected: both dark
    }
    expect(view.marks.edges.get('ac')).toMatchObject({ role: 'makes', tone: 'blue' });
    expect(view.marks.edges.get('ac')?.paired).toBeUndefined();
    expect(view.scene.edges.find((e) => e.id === 'ab')?.bundleSize).toBe(3);
    expect(view.scene.edges.find((e) => e.id === 'ba')?.bundleSize).toBe(2);
  });

  it('with one end of the pair selected: the line it makes is solid in its colour, the line made from it is dashed and dark', () => {
    const view = mapView(sceneOf(), { ...quiet, focusId: 'a' });
    expect(view.marks.edges.get('ab')).toMatchObject({ role: 'makes', tone: 'blue', paired: true });
    expect(view.scene.edges.find((e) => e.id === 'ab')?.stroke).toBe('solid');
    expect(view.marks.edges.get('ba')).toMatchObject({ role: 'madeFrom', paired: true });
    expect(view.marks.edges.get('ba')?.tone).toBeUndefined();
    expect(view.scene.edges.find((e) => e.id === 'ba')?.stroke).toBe('dashed');
    // one-way arrows keep their style exactly
    expect(view.marks.edges.get('ac')?.paired).toBeUndefined();
    expect(view.scene.edges.find((e) => e.id === 'ac')?.points).toEqual([{ x: 0, y: 20 }, { x: 100, y: 20 }]);
  });

  it('both lines of a pair get a count chip, even one with a single reaction (each near its own head)', () => {
    const scene = sceneOf();
    const lone: Scene = { ...scene, edges: scene.edges.map((e) => (e.id === 'ba' ? { ...e, bundleSize: undefined } : e)) };
    const view = mapView(lone, { ...quiet, chapter: true, facts: () => ({ reactions: 1 }), chips: withChips, zoom: 1 });
    expect(view.marks.edges.get('ab')?.chip).toBeDefined();
    expect(view.marks.edges.get('ba')?.chip).toBeDefined();
    expect(view.marks.edges.get('ba')?.chipHidden).toBeUndefined();
  });

  it('no merged mark is left: a pair has no start head, no extra chip and no pair role', () => {
    const view = mapView(sceneOf(), { ...quiet, chapter: true });
    for (const mark of view.marks.edges.values()) expect(Object.keys(mark).filter((key) => ['startHead', 'extraChip', 'pair'].includes(key))).toEqual([]);
    expect([...view.marks.edges.values()].some((mark) => (mark.role as string) === 'pair')).toBe(false);
  });

  it('in a chapter a box at no arrow with no reaction inside is faded; a box with a reaction inside is not', () => {
    expect([...mapView(sceneOf(), { ...quiet, chapter: true }).marks.faded]).toEqual([]);
    const sparse = sceneOf();
    const trimmed: Scene = { ...sparse, edges: sparse.edges.filter((e) => e.id === 'ab' || e.id === 'ba') };
    expect([...mapView(trimmed, { ...quiet, chapter: true }).marks.faded]).toEqual(['d']); // c has one reaction inside, a has 4, b is an end
  });

  it('a family with reactions inside says "4 within the family" (singular for 1, nothing for 0) and never draws a loop (D4)', () => {
    const view = mapView(sceneOf(), quiet);
    expect(view.marks.captions.get('a')).toBe('↻ 4');
    expect(view.marks.captionNames?.get('a')).toBe('4 reactions within the family');
    expect(view.marks.captionNames?.get('c')).toBe('1 reaction within the family');
    expect(view.marks.captions.has('b')).toBe(false);
    expect(mapView(sceneOf(), { ...quiet, chapter: true }).scene.edges.some((e) => e.from === e.to)).toBe(false);
  });

  it('hides Unclassified by default, counts the reactions that lead there, and shows it when asked (D5)', () => {
    const hidden = mapView(sceneOf(), { ...quiet, focusId: 'd' });
    expect(hidden.scene.nodes.some((n) => n.id === 'u')).toBe(false);
    expect(hidden.scene.edges.some((e) => e.to === 'u')).toBe(false);
    expect(hidden.unclassified).toEqual({ present: true, shown: false, reactions: 3 }); // du has 2, au has 1
    const shown = mapView(sceneOf(), { ...quiet, focusId: 'd', showUnclassified: true });
    expect(shown.scene.nodes.some((n) => n.id === 'u')).toBe(true);
    expect(shown.scene.edges.map((e) => e.id)).toContain('du');
    expect(shown.unclassified.shown).toBe(true);
  });

  it('what the keyboard moves through has no hidden Unclassified box but keeps every arrow between the visible boxes, drawn or not', () => {
    const view = mapView(sceneOf(), quiet);
    expect(view.navigation.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(view.navigation.edges.map((e) => e.id).sort()).toEqual(['aa', 'ab', 'ac', 'ba', 'cd']);
    expect(mapView(sceneOf(), { ...quiet, showUnclassified: true }).navigation.nodes.map((n) => n.id)).toContain('u');
  });

  it('keeps a selected arrow drawn even when it is not one of the focused ones', () => {
    const view = mapView(sceneOf(), { ...quiet, focusId: 'b', selectedEdgeId: 'cd' });
    expect(view.scene.edges.map((e) => e.id).sort()).toEqual(['ab', 'ba', 'cd']);
    expect(view.marks.faded.has('c')).toBe(false);
    expect(view.marks.faded.has('d')).toBe(false);
  });
});

describe('mapView: the bucket in focus (step 8.2b-fix, S4, B2)', () => {
  const withBucketOut = (): Scene => {
    const scene = sceneOf();
    return { ...scene, edges: [...scene.edges, edge('ub', 'u', 'b', 2)] };
  };
  it('arrows INTO the bucket are dashed and tone-free; arrows OUT of it are solid, tone-free (neutral ink), never a family colour', () => {
    const view = mapView(withBucketOut(), { ...quiet, focusId: 'u', showUnclassified: true });
    const byId = new Map(view.scene.edges.map((e) => [e.id, e]));
    expect([...byId.keys()].sort()).toEqual(['au', 'du', 'ub']);
    for (const id of ['au', 'du']) {
      expect(byId.get(id)?.stroke).toBe('dashed');
      expect(view.marks.edges.get(id)).toMatchObject({ role: 'madeFrom' });
    }
    expect(byId.get('ub')?.stroke).toBe('solid');
    expect(view.marks.edges.get('ub')?.role).toBe('makes');
    expect(view.marks.edges.get('ub')?.tone).toBeUndefined();
  });
});

describe('mapView: the chip module arrives later (step 8.2b-fix, D)', () => {
  const facts = (from: string, to: string) => (from === 'c' && to === 'd' ? { reactions: 1, words: 'PCC' } : undefined);
  const lone = (): Scene => {
    const scene = sceneOf();
    return { ...scene, edges: [...scene.edges, { ...edge('cx', 'c', 'd', undefined, [{ x: 500, y: 20 }, { x: 600, y: 20 }]), labelAt: { x: 550, y: 20 } }] };
  };
  it('without the chips function (not loaded yet) the arrows are drawn with no chip mark; with it the words appear', () => {
    const before = mapView(lone(), { ...quiet, focusId: 'c', facts });
    expect(before.marks.edges.get('cx')?.chip).toBeUndefined();
    const after = mapView(lone(), { ...quiet, focusId: 'c', facts, chips: withChips });
    expect(after.marks.edges.get('cx')?.chip?.text).toBe('PCC');
  });
});
