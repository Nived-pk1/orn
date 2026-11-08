/** The busy-chapter rule, the legend rows and chain mode of the map's derived view (step 8.2b, B2, B3, C2). Pure. */
import { describe, expect, it } from 'vitest';
import type { Scene, SceneEdge, SceneNode } from '@/render/scene';
import { keyOf } from './legend';
import { BUSY_CHAPTER_ARROWS, mapView } from './map-view';

const text = (s: string) => [{ text: s }];
const node = (id: string, x: number, over: Partial<SceneNode> = {}): SceneNode => ({ id, glyph: 'class_hub', box: 'hub', x, y: 0, width: 100, height: 40, label: text(id), badges: [], emphasis: 'anchor', state: { dimmed: false, onPath: false }, minLod: 0, ariaLabel: `${id}, family`, group: 'G', tone: 'blue', ...over }) as SceneNode;
const edge = (from: string, to: string, size?: number): SceneEdge =>
  ({ id: `${from}>${to}`, from, to, points: [{ x: 0, y: 20 }, { x: 100, y: 20 }], semantic: 'produces', stroke: 'solid', weight: 'normal', arrowHead: 'filled', labelAt: { x: 50, y: 20 }, ...(size === undefined ? {} : { bundleSize: size }), minLod: 0, ariaLabel: `${from} to ${to}` }) as SceneEdge;
/** `n` one-way arrows between n + 1 boxes (no pairs) */
function chainScene(n: number): Scene {
  const ids = Array.from({ length: n + 1 }, (_, i) => `f${i}`);
  const nodes = ids.map((id, i) => node(id, i * 150));
  const edges = ids.slice(0, -1).map((id, i) => edge(id, ids[i + 1] as string));
  return { revision: 1, projectionKey: 'k', layoutKey: 'l', nodes, edges, bounds: { width: 5000, height: 100 }, truncation: null };
}
const chapter = { focusId: null, chapter: true, showUnclassified: false } as const;

describe('the busy chapter rule (B2)', () => {
  it('is 15 arrows', () => expect(BUSY_CHAPTER_ARROWS).toBe(15));
  it('draws every arrow of a chapter with 15 arrows', () => {
    const view = mapView(chainScene(15), chapter);
    expect(view.scene.edges).toHaveLength(15);
    expect(view.busy).toBe(0);
  });
  it('draws none for 16 arrows, says how many there are, and keeps the chapter families at full strength', () => {
    const view = mapView(chainScene(16), chapter);
    expect(view.scene.edges).toHaveLength(0);
    expect(view.busy).toBe(16);
    expect(view.quiet).toBe(false);
    expect(view.marks.faded.size).toBe(0);
  });
  it('counts lines, a pair as two (step 8.4c, C: pairs are no longer merged): 16 arrows of which two are a pair are 16 lines, so busy', () => {
    const scene = chainScene(15);
    const withBack: Scene = { ...scene, edges: [...scene.edges, edge('f1', 'f0')] };
    expect(mapView(withBack, chapter).busy).toBe(16);
  });
  it('a chosen family draws its own part of a busy chapter as in a family focus', () => {
    const view = mapView(chainScene(16), { ...chapter, focusId: 'f3' });
    expect(view.scene.edges.map((e) => e.id).sort()).toEqual(['f2>f3', 'f3>f4']);
    expect(view.busy).toBe(0);
  });
});

describe('the legend rows follow the arrows (B3)', () => {
  it('lines and chip show only while an arrow is drawn; within and Unclassified stay', () => {
    const quiet = keyOf(mapView(chainScene(3), { focusId: null, chapter: false, showUnclassified: false }));
    expect(quiet.lines).toBe(false);
    expect(quiet.chip).toBe(false);
    const drawn = keyOf(mapView(chainScene(3), { focusId: 'f1', chapter: false, showUnclassified: false }));
    expect(drawn.lines).toBe(true);
    expect(drawn.chip).toBe(true);
  });
});

describe('chain mode (C2)', () => {
  it('draws only the chain arrows, heavy and solid in the From family colour, the rest faded', () => {
    const scene = chainScene(4);
    const nodes = scene.nodes.map((n, i) => (i === 0 ? { ...n, tone: 'green' as const } : n));
    const view = mapView({ ...scene, nodes }, { focusId: null, chapter: true, showUnclassified: false, chain: [{ from: 'f0', to: 'f1' }, { from: 'f1', to: 'f2' }] });
    expect(view.scene.edges.map((e) => e.id)).toEqual(['f0>f1', 'f1>f2']);
    expect(view.scene.edges.every((e) => e.weight === 'heavy' && e.stroke === 'solid')).toBe(true);
    expect(view.marks.edges.get('f1>f2')).toMatchObject({ role: 'makes', tone: 'green' });
    expect([...view.marks.faded].sort()).toEqual(['f3', 'f4']);
    expect(view.busy).toBe(0);
    expect(view.quiet).toBe(false);
  });
});
