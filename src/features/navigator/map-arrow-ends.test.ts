/**
 * Step 8.5c C0 (owner, live site): EVERY arrow the map draws starts on the border of its from-family's box and ends on the border of its
 * to-family's box (within 3 px), whatever the view: a two-way pair is drawn as two parallel lines (8.4c), and a pair whose two arcs bow far
 * apart (the layout bows an arrow and its reverse to opposite sides by up to 160 px) used to be shifted bodily towards each other, which left
 * both ends beside their boxes in empty space (Carboxylic acids <-> Arenes on the owner's data: ends 68 px off). Pure, over fixed layouts.
 */
import { describe, expect, it } from 'vitest';
import type { Scene, SceneEdge, SceneNode } from '@/render/scene';
import { mapView } from './map-view';

const TOLERANCE = 3;
type P = { x: number; y: number };

function node(id: string, x: number, y: number): SceneNode {
  return { id, glyph: 'class_hub', box: 'hub', x, y, width: 120, height: 50, label: [{ text: id }], badges: [], emphasis: 'anchor', state: { dimmed: false, onPath: false }, minLod: 0, ariaLabel: id, group: 'G', tone: 'blue' };
}
/** The sampled quadratic the grid layout draws for an arc (24 segments), bowed by `offset` px to a side of the chord. */
function arc(a: P, b: P, offset: number): P[] {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const run = Math.hypot(b.x - a.x, b.y - a.y);
  const control = { x: mid.x + (-(b.y - a.y) / run) * 2 * offset, y: mid.y + ((b.x - a.x) / run) * 2 * offset };
  return Array.from({ length: 25 }, (_, i) => {
    const t = i / 24;
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * control.x + t * t * b.x, y: u * u * a.y + 2 * u * t * control.y + t * t * b.y };
  });
}
function edge(id: string, from: string, to: string, points: P[]): SceneEdge {
  return { id, from, to, points, semantic: 'produces', stroke: 'solid', weight: 'normal', arrowHead: 'filled', labelAt: points[12] as P, minLod: 0, ariaLabel: id } as SceneEdge;
}
/** The distance from a point to the BORDER of a box (inside or outside). */
function offBorder(p: P, box: SceneNode): number {
  const dx = Math.max(box.x - p.x, 0, p.x - (box.x + box.width));
  const dy = Math.max(box.y - p.y, 0, p.y - (box.y + box.height));
  const outside = Math.hypot(dx, dy);
  return outside > 0 ? outside : Math.min(p.x - box.x, box.x + box.width - p.x, p.y - box.y, box.y + box.height - p.y);
}

/** A pair a <-> b: the two ports 20 px apart on facing sides, the arcs bowed `offset` px to opposite sides. */
function pairScene(a: SceneNode, b: SceneNode, ends: readonly [P, P, P, P], offset: number): Scene {
  const forward = arc(ends[0], ends[1], offset);
  const back = arc(ends[2], ends[3], offset); // the reverse runs the other way along its own chord, so the same offset bows to the other side
  return { revision: 1, projectionKey: 'k', layoutKey: 'l', nodes: [a, b], edges: [edge('ab', a.id, b.id, forward), edge('ba', b.id, a.id, back)], bounds: { width: 3000, height: 3000 }, truncation: null };
}

const CASES: readonly { name: string; a: SceneNode; b: SceneNode; ends: readonly [P, P, P, P] }[] = [
  { name: 'across, to the right and up', a: node('a', 0, 600), b: node('b', 1400, 0), ends: [{ x: 120, y: 615 }, { x: 1400, y: 15 }, { x: 1400, y: 35 }, { x: 120, y: 635 }] },
  { name: 'side by side', a: node('a', 0, 0), b: node('b', 800, 0), ends: [{ x: 120, y: 15 }, { x: 800, y: 15 }, { x: 800, y: 35 }, { x: 120, y: 35 }] },
  { name: 'one above the other', a: node('a', 0, 0), b: node('b', 0, 700), ends: [{ x: 50, y: 50 }, { x: 50, y: 700 }, { x: 70, y: 700 }, { x: 70, y: 50 }] },
];

describe('a two-way pair keeps both ends of both lines on the borders of its two boxes', () => {
  for (const c of CASES) {
    for (const offset of [0, 40, 80, 120, 160]) {
      for (const zoom of [0.4, 1, 2]) {
        it(`${c.name}, arcs bowed ${offset} px, zoom ${zoom}: every end within ${TOLERANCE} px of its box border (focus and chapter)`, () => {
          const scene = pairScene(c.a, c.b, c.ends, offset);
          for (const options of [{ focusId: 'a', chapter: false }, { focusId: null, chapter: true }]) {
            const view = mapView(scene, { ...options, showUnclassified: false, zoom });
            expect(view.scene.edges.length).toBe(2);
            for (const e of view.scene.edges) {
              const from = scene.nodes.find((n) => n.id === e.from) as SceneNode;
              const to = scene.nodes.find((n) => n.id === e.to) as SceneNode;
              expect(offBorder(e.points[0] as P, from), `${e.id} start`).toBeLessThanOrEqual(TOLERANCE);
              expect(offBorder(e.points[e.points.length - 1] as P, to), `${e.id} end`).toBeLessThanOrEqual(TOLERANCE);
            }
          }
        });
      }
    }
  }
});
