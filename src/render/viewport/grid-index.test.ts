import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { SceneNode } from '@/render/scene';
import { seeded, syntheticScene } from '@/test-support/viewport-kit';
import type { Rect } from './contracts';
import { buildGridIndex, edgeBoxes, GRID_CELL, MAX_CELLS_PER_ITEM, nodeBoxes } from './grid-index';

const touches = (a: Rect, b: Rect): boolean => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
const brute = (boxes: readonly Rect[], rect: Rect): number[] => boxes.flatMap((box, i) => (touches(box, rect) ? [i] : []));

describe('grid index', () => {
  it('answers exactly what a brute-force scan answers (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 1, max: 9999 }),
        fc.integer({ min: -2000, max: 9000 }),
        fc.integer({ min: -2000, max: 9000 }),
        fc.integer({ min: 1, max: 6000 }),
        fc.integer({ min: 1, max: 6000 }),
        (count, seed, x, y, w, h) => {
          const scene = syntheticScene(count, count * 2, seed, 6000);
          const rect = { x0: x, y0: y, x1: x + w, y1: y + h };
          const found = buildGridIndex(scene).query(rect);
          expect(found.nodes).toEqual(brute(nodeBoxes(scene), rect));
          expect(found.edges).toEqual(brute(edgeBoxes(scene), rect));
        },
      ),
      { numRuns: 150 },
    );
  });

  it('keeps a box far larger than the cell budget (it goes to the large list) and negative coordinates', () => {
    const scene = syntheticScene(3, 0, 5, 1000);
    const huge = { ...(scene.nodes[0] as SceneNode), x: -50_000, y: -50_000, width: 200_000, height: 200_000 };
    const withHuge = { ...scene, nodes: [huge, ...scene.nodes.slice(1)] };
    expect((huge.width / GRID_CELL) ** 2).toBeGreaterThan(MAX_CELLS_PER_ITEM);
    expect(buildGridIndex(withHuge).query({ x0: 10, y0: 10, x1: 20, y1: 20 }).nodes).toContain(0);
    expect(buildGridIndex(withHuge).query({ x0: 900_000, y0: 0, x1: 900_100, y1: 10 }).nodes).toEqual([]);
  });

  it('is deterministic and handles an empty scene', () => {
    expect(seeded(3)()).toBe(seeded(3)());
    expect(buildGridIndex(syntheticScene(0, 0)).query({ x0: -1, y0: -1, x1: 1, y1: 1 })).toEqual({ nodes: [], edges: [] });
  });
});
