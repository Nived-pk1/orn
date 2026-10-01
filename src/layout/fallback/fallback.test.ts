/**
 * The in-house fallback layout (step 4.4): valid (every node and edge answered, no overlapping boxes, finite numbers) on cycles,
 * self-loops, disconnected graphs, parallel edges, the empty graph and 400 nodes / 800 edges; layering and ordering as specified;
 * `layerHint` and `orderHint` honoured; the notes for what it cannot do; deterministic; the sweep count and the caps.
 */
import { describe, expect, it } from 'vitest';
import { MAX_LAYOUT_EDGES, MAX_LAYOUT_NODES, type LayoutRequest } from '../contracts';
import { layoutProblems, randomRequest, request, withoutTiming } from '@/test-support/layout-kit';
import { layoutFallback, SWEEPS } from './index';

const run = (req: LayoutRequest) => layoutFallback(req, 'elk_error', () => 0);
const valid = (req: LayoutRequest) => {
  const result = run(req);
  expect(layoutProblems(req, result)).toEqual([]);
  return result;
};
const layerOf = (result: ReturnType<typeof run>, direction: 'x' | 'y' = 'x') => (id: string): number => (result.positions[id] as { x: number; y: number })[direction];

describe('valid layouts', () => {
  it('a chain flows in layers along the direction; every direction is valid and the mirror image of its opposite', () => {
    const req = request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']] });
    const right = valid(req);
    const x = layerOf(right);
    expect(x('a')).toBeLessThan(x('b'));
    expect(x('b')).toBeLessThan(x('c'));
    const left = valid({ ...req, direction: 'LEFT' });
    expect(layerOf(left)('a')).toBeGreaterThan(layerOf(left)('b'));
    const down = valid({ ...req, direction: 'DOWN' });
    expect(layerOf(down, 'y')('a')).toBeLessThan(layerOf(down, 'y')('c'));
    const up = valid({ ...req, direction: 'UP' });
    expect(layerOf(up, 'y')('a')).toBeGreaterThan(layerOf(up, 'y')('c'));
    expect(right.bounds).toEqual(left.bounds);
  });

  it('spacing: layers are a layer gap apart along the flow, nodes of a layer a node gap apart across it, layers centred on the widest', () => {
    const result = valid(request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['a', 'c']] }));
    const at = (id: string) => result.positions[id] as { x: number; y: number };
    expect(at('b').x - at('a').x).toBe(120 + 60); // node width + layer gap
    expect(at('c').y - at('b').y).toBe(40 + 20); // node height + node gap
    expect(at('a').y).toBe((40 + 20 + 40 - 40) / 2); // the single node of layer 0 is centred on the two of layer 1 (extent 100)
    expect(result.bounds).toEqual({ width: 120 + 60 + 120, height: 100 });
  });

  it('the empty graph and a single node', () => {
    const empty = valid(request({ nodes: [] }));
    expect(empty.bounds).toEqual({ width: 0, height: 0 });
    const one = valid(request({ nodes: ['a'] }));
    expect(one.positions.a).toEqual({ x: 0, y: 0 });
  });

  it('a cycle: the back edge is reversed, so the layers still advance (a, b, c in three layers)', () => {
    const result = valid(request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c'], ['c', 'a']] }));
    const x = layerOf(result);
    expect([x('a') < x('b'), x('b') < x('c')]).toEqual([true, true]);
  });

  it('self-loops and parallel edges (same and opposite direction) are valid; a loop has a four-point route outside its node', () => {
    const req = request({ nodes: ['a', 'b'], edges: [['a', 'a'], ['a', 'b'], ['a', 'b'], ['b', 'a'], ['b', 'b']] });
    const result = valid(req);
    const loop = result.edgeRoutes.e00000 as { x: number; y: number }[];
    expect(loop).toHaveLength(4);
    expect(loop[1]?.x).toBeGreaterThan((result.positions.a as { x: number }).x + 120);
    expect(result.bounds.width).toBeGreaterThanOrEqual(loop[1]?.x ?? 0);
  });

  it('disconnected components share the layers and never overlap', () => {
    const result = valid(request({ nodes: ['a', 'b', 'c', 'd', 'e', 'lone'], edges: [['a', 'b'], ['c', 'd'], ['d', 'e']] }));
    expect(Object.keys(result.positions)).toHaveLength(6);
  });

  it('400 nodes and 800 edges, with cycles, loops and parallel edges, in many shapes', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const direction of ['RIGHT', 'DOWN'] as const) {
        const req = { ...randomRequest({ nodes: 400, edges: 800, seed, selfLoops: 10, parallel: 20 }), direction };
        expect(layoutProblems(req, run(req)), `seed ${seed} ${direction}`).toEqual([]);
      }
    }
  });

  it('the caps: 2,000 nodes and 4,000 edges are laid out, well inside a second', () => {
    const req = randomRequest({ nodes: MAX_LAYOUT_NODES, edges: MAX_LAYOUT_EDGES, seed: 9, selfLoops: 20, parallel: 40 });
    const began = performance.now();
    const result = run(req);
    expect(performance.now() - began).toBeLessThan(1_000);
    expect(layoutProblems(req, result)).toEqual([]);
  });

  it('very different node sizes still never overlap', () => {
    const req = request({
      nodes: [{ id: 'a', width: 400, height: 10 }, { id: 'b', width: 5, height: 300 }, { id: 'c', width: 90, height: 90 }, { id: 'd', width: 1, height: 1 }],
      edges: [['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'd']],
    });
    for (const direction of ['RIGHT', 'LEFT', 'DOWN', 'UP'] as const) expect(layoutProblems({ ...req, direction }, run({ ...req, direction })), direction).toEqual([]);
  });
});

describe('layering and ordering', () => {
  it('longest-path layering: a node sits one layer after its deepest predecessor', () => {
    // a -> b -> c, a -> c, a -> d: c is two layers after a, d one
    const result = valid(request({ nodes: ['a', 'b', 'c', 'd'], edges: [['a', 'b'], ['b', 'c'], ['a', 'c'], ['a', 'd']] }));
    const x = layerOf(result);
    expect(x('c')).toBeGreaterThan(x('b'));
    expect(x('d')).toBe(x('b'));
  });

  it('uses a fixed number of sweeps', () => {
    expect(SWEEPS).toBe(8);
  });

  it('barycentric ordering removes a crossing a plain id order would leave', () => {
    // sources a1 < a2; targets t1 < t2; a1 -> t2 and a2 -> t1 cross in id order
    const result = valid(request({ nodes: ['a1', 'a2', 't1', 't2'], edges: [['a1', 't2'], ['a2', 't1']] }));
    const y = layerOf(result, 'y');
    expect(Math.sign(y('a1') - y('a2'))).toBe(Math.sign(y('t2') - y('t1')));
  });
});

describe('hints', () => {
  it('layerHint places a node exactly on its layer (and the layers nobody uses are squeezed out)', () => {
    const req = request({ nodes: [{ id: 'a', layerHint: 0 }, { id: 'b', layerHint: 7 }, { id: 'c', layerHint: 3 }, 'd'], edges: [['a', 'd']] });
    const result = valid(req);
    const x = layerOf(result);
    expect(x('a')).toBeLessThan(x('c'));
    expect(x('c')).toBeLessThan(x('b'));
    expect(result.bounds.width).toBe(120 * 4 + 60 * 3); // four occupied layers: 0 (a), 1 (d, after a), 3 (c), 7 (b); no empty columns between
  });

  it('layerHint beats edge direction: an edge between hinted nodes may point backwards', () => {
    const result = valid(request({ nodes: [{ id: 'a', layerHint: 2 }, { id: 'b', layerHint: 0 }], edges: [['a', 'b']] }));
    expect(layerOf(result)('b')).toBeLessThan(layerOf(result)('a'));
  });

  it('orderHint decides the order among hinted nodes of a layer, whatever the barycentres say', () => {
    const nodes = ['s', 'x', 'y', 'z'].map((id) => (id === 's' ? { id } : { id, orderHint: { x: 3, y: 1, z: 2 }[id] }));
    const result = valid(request({ nodes, edges: [['s', 'x'], ['s', 'y'], ['s', 'z']] }));
    const y = layerOf(result, 'y');
    expect([y('y') < y('z'), y('z') < y('x')]).toEqual([true, true]);
  });

  it('orderHint among some nodes leaves the others free', () => {
    const nodes = [{ id: 's' }, { id: 'a', orderHint: 2 }, { id: 'b', orderHint: 1 }, { id: 'c' }];
    const result = valid(request({ nodes, edges: [['s', 'a'], ['s', 'b'], ['s', 'c']] }));
    const y = layerOf(result, 'y');
    expect(y('b')).toBeLessThan(y('a'));
  });
});

describe('what it cannot do is said', () => {
  it('lists the algorithm, pinned, previous and edge priority; says nothing when none apply', () => {
    expect(run(request({ nodes: ['a', 'b'], edges: [['a', 'b']] })).notes).toEqual([]);
    const asked = run(
      request({
        nodes: [{ id: 'a', pinned: { x: 1, y: 2 } }, 'b'],
        edges: [{ id: 'e1', from: 'a', to: 'b', priority: 3 }],
        algorithm: 'radial',
        previous: { a: { x: 0, y: 0 } },
      }),
    );
    expect(asked.notes).toEqual([
      'edge priority is not used by the fallback layout',
      'pinned positions of 1 node(s) are not honoured by the fallback layout',
      'previous positions are not used by the fallback layout',
      'the fallback layout is always layered; radial was requested',
    ]);
  });

  it('answers with the engine and the reason it was asked for', () => {
    const result = layoutFallback(request({ nodes: ['a'] }), 'timeout', () => 5);
    expect(result).toMatchObject({ engine: 'fallback', fallbackReason: 'timeout', durationMs: 5, requestId: 'req' });
  });
});

describe('determinism', () => {
  it('the same request gives the same bytes, every time, whatever order the object keys were built in', () => {
    const req = randomRequest({ nodes: 120, edges: 260, seed: 4, selfLoops: 3, parallel: 6 });
    const first = JSON.stringify(withoutTiming(run(req)));
    for (let i = 0; i < 3; i += 1) expect(JSON.stringify(withoutTiming(run(structuredClone(req))))).toBe(first);
  });
});
