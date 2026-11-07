/** The map's derived view (step 8.2a, D1 to D5): which arrows are drawn, their style, merged pairs, faded boxes, captions, Unclassified. Pure. */
import { describe, expect, it } from 'vitest';
import type { Scene, SceneEdge, SceneNode } from '@/render/scene';
import { withChips } from './map-chips';
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

  it('the two lines of a pair in a family focus stay at least 6 px apart', () => {
    const view = mapView(sceneOf(), { ...quiet, focusId: 'a' });
    const first = view.scene.edges.find((e) => e.id === 'ab') as SceneEdge;
    const second = view.scene.edges.find((e) => e.id === 'ba') as SceneEdge;
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(Math.abs((first.points[0]?.y ?? 0) - (second.points[1]?.y ?? 0))).toBeGreaterThanOrEqual(6); // both run along x = 0 to 100, one each way
  });

  it('a chapter draws all its arrows; a two-way pair is one line with a head and a chip at each end and a spoken name (D2, D3)', () => {
    const view = mapView(sceneOf(), { ...quiet, chapter: true });
    expect(view.scene.edges.map((e) => e.id).sort()).toEqual(['ab', 'ac', 'cd']); // ba is merged into ab; loops and Unclassified arrows are not drawn
    const pair = view.scene.edges.find((e) => e.id === 'ab') as SceneEdge;
    expect(pair.ariaLabel).toBe('Fam a to Fam b: 3 reactions; Fam b to Fam a: 2 reactions');
    const mark = view.marks.edges.get('ab');
    expect(mark).toMatchObject({ role: 'pair', startHead: true });
    expect(mark?.extraChip?.size).toBe(2);
    expect(pair.bundleSize).toBe(3);
    // the b to a chip sits near a (the start of the line); the a to b chip near b
    expect(mark?.extraChip?.at.x).toBeLessThan(pair.labelAt.x);
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
