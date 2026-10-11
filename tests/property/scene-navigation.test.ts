/**
 * Keyboard navigation over a Scene (step 5.7, item f): over generated Scenes, an arrow key is deterministic (the order of the
 * Scene's nodes never changes the answer), reaches a family whenever one lies in that direction (and only one that does), never
 * answers the family it started from or a node that is not a family, and Tab through the reading order visits every family once.
 */
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import type { BoxKind, Scene, SceneNode } from '@/render/scene';
import { familiesOf, firstFamily, lastFamily, neighbourInDirection, readingOrder, stepInReadingOrder } from '@/render/scene';
import type { Direction } from '@/render/scene';
import { PARAMS, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

const DIRECTIONS: readonly Direction[] = ['left', 'right', 'up', 'down'];

const nodeArb = (index: number): fc.Arbitrary<SceneNode> =>
  fc
    .record({
      x: fc.integer({ min: 0, max: 40 }),
      y: fc.integer({ min: 0, max: 30 }),
      box: fc.constantFrom<BoxKind>('hub', 'hub', 'hub', 'unclassified', 'species', 'member'),
    })
    .map(({ x, y, box }) => ({
      id: `n${index}`,
      glyph: box === 'hub' ? ('class_hub' as const) : ('species' as const),
      box,
      x: x * 10,
      y: y * 10,
      width: 40,
      height: 20,
      label: [{ text: `n${index}` }],
      badges: [],
      emphasis: 'normal',
      state: { dimmed: false, onPath: false },
      minLod: 0,
      ariaLabel: `n${index}`,
    }));

const sceneArb: fc.Arbitrary<Scene> = fc
  .integer({ min: 1, max: 14 })
  .chain((count) => fc.tuple(...Array.from({ length: count }, (_, index) => nodeArb(index))))
  .map((nodes) => ({ revision: 0, projectionKey: 'p', layoutKey: 'l', nodes, edges: [], bounds: { width: 500, height: 400 }, truncation: null }));

const centre = (node: SceneNode): { x: number; y: number } => ({ x: node.x + node.width / 2, y: node.y + node.height / 2 });
const lies = (from: SceneNode, to: SceneNode, direction: Direction): boolean => {
  const a = centre(from);
  const b = centre(to);
  return direction === 'right' ? b.x > a.x : direction === 'left' ? b.x < a.x : direction === 'down' ? b.y > a.y : b.y < a.y;
};

describe('keyboard navigation over a Scene', () => {
  it('an arrow key is deterministic, reaches a family whenever one lies in that direction, and only ever one that does', () => {
    let reached = 0;
    fc.assert(
      fc.property(sceneArb, (scene) => {
        const families = familiesOf(scene);
        const reversed: Scene = { ...scene, nodes: [...scene.nodes].reverse() };
        for (const from of families) {
          for (const direction of DIRECTIONS) {
            const answer = neighbourInDirection(scene, from.id, direction);
            expect(neighbourInDirection(reversed, from.id, direction)).toBe(answer);
            const candidates = families.filter((node) => node.id !== from.id && lies(from, node, direction));
            if (candidates.length === 0) expect(answer).toBeUndefined();
            else {
              expect(answer).toBeDefined();
              const target = families.find((node) => node.id === answer) as SceneNode;
              expect(target.id).not.toBe(from.id);
              expect(lies(from, target, direction)).toBe(true);
              reached += 1;
            }
          }
        }
        // a node that is not a family answers nothing
        const other = scene.nodes.find((node) => !families.includes(node));
        if (other !== undefined) expect(neighbourInDirection(scene, other.id, 'right')).toBeUndefined();
      }),
      PARAMS,
    );
    expect(reached).toBeGreaterThan(0);
  });

  it('the reading order is a permutation, the same for any order of the Scene, and Tab through it visits every family once', () => {
    fc.assert(
      fc.property(sceneArb, (scene) => {
        const families = familiesOf(scene);
        const ordered = readingOrder(families);
        expect(ordered.map((node) => node.id).sort()).toEqual(families.map((node) => node.id).sort());
        expect(readingOrder([...families].reverse()).map((node) => node.id)).toEqual(ordered.map((node) => node.id));
        const visited: string[] = [];
        let at = firstFamily(scene);
        while (at !== undefined) {
          visited.push(at);
          at = stepInReadingOrder(scene, at, 1);
        }
        expect(visited).toEqual(ordered.map((node) => node.id));
        expect(lastFamily(scene)).toBe(visited.at(-1));
        // and back with Shift+Tab
        const back: string[] = [];
        let from = lastFamily(scene);
        while (from !== undefined) {
          back.push(from);
          from = stepInReadingOrder(scene, from, -1);
        }
        expect(back).toEqual([...visited].reverse());
      }),
      PARAMS,
    );
  });
});
