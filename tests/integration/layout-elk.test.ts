/**
 * The ELK adapter over REAL elkjs 0.12.0 (step 4.4), in process: layered, radial and stress give valid layouts (every node and
 * edge answered, no overlapping boxes) on cycles, loops, parallel edges and disconnected graphs; the hints ELK honours are honoured
 * and the ones it cannot are ignored AND listed in `notes`; the seed reaches ELK; the same request gives byte-identical output
 * from fresh instances. The docs/ comment at the top of src/layout/elk/map-request.ts is the table these tests prove.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createElkEngine, loadElk } from '@/layout/elk';
import { createFallbackEngine } from '@/layout';
import type { LayoutAlgorithm, LayoutEngine, LayoutRequest } from '@/layout/contracts';
import { layoutProblems, randomRequest, request, withoutTiming } from '@/test-support/layout-kit';

const clock = () => performance.now();
const make = await loadElk();
const freshElk = (): LayoutEngine => createElkEngine({ make, clock });
const fallback = (): LayoutEngine => createFallbackEngine({ reason: 'elk_error', clock });
const signal = new AbortController().signal;
const run = async (req: LayoutRequest, engine: LayoutEngine = freshElk()) => engine.layout(structuredClone(req), signal);
const ALGORITHMS: readonly LayoutAlgorithm[] = ['layered', 'radial', 'stress'];
const x = (result: Awaited<ReturnType<typeof run>>, id: string): number => (result.positions[id] as { x: number }).x;
const y = (result: Awaited<ReturnType<typeof run>>, id: string): number => (result.positions[id] as { y: number }).y;

describe('valid layouts, all three algorithms', () => {
  const shapes: [string, LayoutRequest][] = [
    ['a chain', request({ nodes: ['a', 'b', 'c', 'd'], edges: [['a', 'b'], ['b', 'c'], ['c', 'd']] })],
    ['a cycle', request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c'], ['c', 'a']] })],
    ['self-loops and parallel edges', request({ nodes: ['a', 'b'], edges: [['a', 'a'], ['a', 'b'], ['a', 'b'], ['b', 'a'], ['b', 'b']] })],
    ['a disconnected graph with isolated nodes', request({ nodes: ['a', 'b', 'c', 'd', 'e', 'f', 'lone'], edges: [['a', 'b'], ['b', 'c'], ['d', 'e'], ['e', 'f'], ['f', 'd']] })],
    ['a single node', request({ nodes: ['a'] })],
    ['the empty graph', request({ nodes: [] })],
    ['a dense random graph', randomRequest({ nodes: 40, edges: 120, seed: 3, selfLoops: 3, parallel: 8 })],
  ];
  for (const algorithm of ALGORITHMS) {
    for (const [name, base] of shapes) {
      it(`${algorithm}: ${name}`, async () => {
        const req = { ...base, algorithm };
        const result = await run(req);
        expect(layoutProblems(req, result)).toEqual([]);
        expect(result).toMatchObject({ engine: 'elk', requestId: 'req' });
        expect(result.fallbackReason).toBeUndefined();
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        structuredClone(result); // a worker answer must cross the port
      });
    }
  }

  it('every direction of the layered layout is valid, and the flow follows it', async () => {
    const base = request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']] });
    const right = await run({ ...base, direction: 'RIGHT' });
    const left = await run({ ...base, direction: 'LEFT' });
    const down = await run({ ...base, direction: 'DOWN' });
    const up = await run({ ...base, direction: 'UP' });
    for (const [direction, result] of [['RIGHT', right], ['LEFT', left], ['DOWN', down], ['UP', up]] as const) expect(layoutProblems({ ...base, direction }, result), direction).toEqual([]);
    expect(x(right, 'a')).toBeLessThan(x(right, 'c'));
    expect(x(left, 'a')).toBeGreaterThan(x(left, 'c'));
    expect(y(down, 'a')).toBeLessThan(y(down, 'c'));
    expect(y(up, 'a')).toBeGreaterThan(y(up, 'c'));
  });

  it('spacing is mapped: a larger layer gap moves the layers apart, a larger node gap the nodes within a layer', async () => {
    const base = request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['a', 'c']] });
    const tight = await run(base);
    const wide = await run({ ...base, spacing: { node: 80, layer: 200, edge: 10 } });
    expect(x(wide, 'b') - x(wide, 'a')).toBeGreaterThan(x(tight, 'b') - x(tight, 'a') + 100);
    expect(Math.abs(y(wide, 'b') - y(wide, 'c'))).toBeGreaterThan(Math.abs(y(tight, 'b') - y(tight, 'c')) + 30);
  });

  it('larger graphs: layered 120 nodes / 240 edges, radial 400 / 800, stress 40 / 80 (random graphs with cycles, loops and parallel edges) are valid', async () => {
    for (const [algorithm, nodes, edges] of [['layered', 120, 240], ['radial', 400, 800], ['stress', 40, 80]] as const) {
      const req = randomRequest({ nodes, edges, seed: 5, selfLoops: 5, parallel: 10, algorithm });
      expect(layoutProblems(req, await run(req)), algorithm).toEqual([]);
    }
  }, 60_000);

  it('radial and stress spread overlapping results (their rings and edge lengths ignore node sizes) and say so; layered never needs it', async () => {
    const req = randomRequest({ nodes: 60, edges: 120, seed: 8, algorithm: 'radial' });
    const result = await run({ ...req, spacing: { node: 20, layer: 0, edge: 10 }, nodes: req.nodes.map((n) => ({ ...n, width: 300, height: 120 })) });
    expect(layoutProblems(req, result)).toEqual([]);
    expect(result.notes.some((note) => note.startsWith('positions were spread by a factor of'))).toBe(true);
  });
});

describe('hints: honoured, or ignored AND listed in notes', () => {
  it('layered layerHint: the order of layers follows the hints (not exact layer numbers); no note', async () => {
    const req = request({ nodes: [{ id: 'a', layerHint: 1 }, { id: 'b', layerHint: 2 }, { id: 'c', layerHint: 0 }, { id: 'd', layerHint: 3 }], edges: [['a', 'b'], ['b', 'c'], ['a', 'd']] });
    const result = await run(req);
    expect(layoutProblems(req, result)).toEqual([]);
    expect([x(result, 'c') < x(result, 'a'), x(result, 'a') < x(result, 'b'), x(result, 'b') < x(result, 'd')]).toEqual([true, true, true]);
    expect(result.notes).toEqual([]);
  });

  it('layered orderHint: a preference (model order) among nodes ELK would otherwise place by id; no note', async () => {
    const hints: Record<string, number> = { x: 1, y: 3, z: 2 };
    const nodes = [{ id: 's' }, ...['x', 'y', 'z'].map((id) => ({ id, orderHint: hints[id] as number }))];
    const req = request({ nodes, edges: [['s', 'x'], ['s', 'y'], ['s', 'z']] });
    const result = await run(req);
    expect(result.notes).toEqual([]);
    expect([y(result, 'x') < y(result, 'z'), y(result, 'z') < y(result, 'y')]).toEqual([true, true]);
    const flipped = await run({ ...req, nodes: req.nodes.map((n) => (n.id === 's' ? n : { ...n, orderHint: 10 - (n.orderHint as number) })) });
    expect([y(flipped, 'y') < y(flipped, 'z'), y(flipped, 'z') < y(flipped, 'x')]).toEqual([true, true]);
  });

  it('layered previous: the order inside layers follows the previous positions, so an expansion does not reshuffle; a new node takes its neighbours', async () => {
    const base = request({ nodes: ['s', 'x', 'y', 'z'], edges: [['s', 'x'], ['s', 'y'], ['s', 'z']] });
    const forward = await run({ ...base, previous: { s: { x: 0, y: 50 }, x: { x: 200, y: 0 }, y: { x: 200, y: 50 }, z: { x: 200, y: 100 } } });
    expect([y(forward, 'x') < y(forward, 'y'), y(forward, 'y') < y(forward, 'z')]).toEqual([true, true]);
    const reversed = await run({ ...base, previous: { s: { x: 0, y: 50 }, x: { x: 200, y: 100 }, y: { x: 200, y: 50 }, z: { x: 200, y: 0 } } });
    expect([y(reversed, 'z') < y(reversed, 'y'), y(reversed, 'y') < y(reversed, 'x')]).toEqual([true, true]);
    expect(reversed.notes).toEqual([]);
    const grown = request({ nodes: ['s', 'w', 'x', 'y', 'z'], edges: [['s', 'w'], ['s', 'x'], ['s', 'y'], ['s', 'z']], previous: { s: { x: 0, y: 50 }, x: { x: 200, y: 100 }, y: { x: 200, y: 50 }, z: { x: 200, y: 0 } } });
    const after = await run(grown);
    expect(layoutProblems(grown, after)).toEqual([]);
    expect([y(after, 'z') < y(after, 'y'), y(after, 'y') < y(after, 'x')]).toEqual([true, true]); // the three old ones keep their order
  });

  it('previous positions that name no node of the request, and orderHint next to previous, are said', async () => {
    const stranger = await run(request({ nodes: ['a', 'b'], edges: [['a', 'b']], previous: { nope: { x: 0, y: 0 } } }));
    expect(stranger.notes).toEqual(['previous positions name no node of the request, so they were not used']);
    const both = await run(request({ nodes: [{ id: 'a', orderHint: 1 }, 'b'], edges: [['a', 'b']], previous: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } } }));
    expect(both.notes).toEqual(['orderHint of 1 node(s) is ignored: previous positions decide the order']);
  });

  it('pinned is ignored by every algorithm and listed; the layout is the one without the pin', async () => {
    for (const algorithm of ALGORITHMS) {
      const plain = request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']], algorithm });
      const pinned = request({ nodes: [{ id: 'a', pinned: { x: 900, y: 900 } }, 'b', 'c'], edges: [['a', 'b'], ['b', 'c']], algorithm });
      const result = await run(pinned);
      expect(result.notes, algorithm).toEqual([`pinned positions of 1 node(s) are ignored: ELK ${algorithm} cannot fix positions`]);
      expect(withoutTiming({ ...result, notes: [], requestId: 'req', cacheKey: '' }), algorithm).toEqual(withoutTiming({ ...(await run(plain)), notes: [], cacheKey: '' }));
    }
  });

  it('radial and stress: layerHint, orderHint, previous and edge priority are listed as ignored (radial: layerHint only picks the root)', async () => {
    const nodes = [{ id: 'a', layerHint: 0, orderHint: 1 }, { id: 'b' }, { id: 'c' }];
    const edges = [{ id: 'e1', from: 'a', to: 'b', priority: 2 }, { id: 'e2', from: 'b', to: 'c' }];
    const previous = { a: { x: 0, y: 0 } };
    const radial = await run(request({ nodes, edges, algorithm: 'radial', previous }));
    expect(radial.notes).toEqual([
      'edge priority is ignored by the radial layout',
      'layerHint of 1 node(s) only chooses the root of each tree in a radial layout',
      'orderHint of 1 node(s) is ignored by the radial layout',
      'previous positions are ignored by the radial layout',
    ]);
    const stress = await run(request({ nodes, edges, algorithm: 'stress', previous }));
    expect(stress.notes).toEqual([
      'edge priority is ignored by the stress layout',
      'layerHint of 1 node(s) is ignored by the stress layout',
      'orderHint of 1 node(s) is ignored by the stress layout',
      'previous positions are ignored by the stress layout',
    ]);
  });

  it('layered edge priority is mapped and changes nothing that breaks validity', async () => {
    const req = request({ nodes: ['a', 'b', 'c'], edges: [{ id: 'e1', from: 'a', to: 'b', priority: 9 }, { id: 'e2', from: 'b', to: 'c', priority: 0 }, { id: 'e3', from: 'c', to: 'a', priority: 1 }] });
    const result = await run(req);
    expect(layoutProblems(req, result)).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it('radial: the node with the lowest layerHint is the centre (the root of its tree)', async () => {
    const req = request({ nodes: ['a', 'b', 'c', 'd', { id: 'focus', layerHint: 0 }], edges: [['focus', 'a'], ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'focus']], algorithm: 'radial' });
    const result = await run(req);
    const centre = { x: x(result, 'focus') + 60, y: y(result, 'focus') + 20 };
    const distance = (id: string): number => Math.hypot(x(result, id) + 60 - centre.x, y(result, id) + 20 - centre.y);
    expect(distance('a')).toBeLessThan(distance('c'));
    expect(distance('d')).toBeLessThan(distance('c'));
  });
});

describe('radial needs a tree: the adapter gives it one and says what it did', () => {
  it('non-tree edges (a cycle, a parallel edge, a loop) are drawn straight and counted in the notes; no ELK failure', async () => {
    const req = request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c'], ['c', 'a'], ['a', 'b'], ['c', 'c']], algorithm: 'radial' });
    const result = await run(req);
    expect(layoutProblems(req, result)).toEqual([]);
    expect(result.engine).toBe('elk');
    expect(result.notes).toEqual(['3 edge(s) outside the spanning tree are drawn straight (a radial layout needs a tree)']);
    expect(result.edgeRoutes.e00004).toHaveLength(4); // the loop
  });

  it('several components are joined under a virtual centre that is not in the answer; nothing overlaps', async () => {
    const req = request({ nodes: ['a', 'b', 'c', 'd', 'e', 'lone'], edges: [['a', 'b'], ['b', 'c'], ['d', 'e']], algorithm: 'radial' });
    const result = await run(req);
    expect(layoutProblems(req, result)).toEqual([]);
    expect(Object.keys(result.positions).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'lone']);
    expect(Object.keys(result.edgeRoutes)).toHaveLength(3);
    expect(result.notes).toEqual(['3 components were joined under a virtual centre node for the radial layout']);
  });

  it('a node or an edge named like the virtual ones does not clash', async () => {
    const req = request({ nodes: ['virtual-centre', 'virtual-a', 'a', 'lone'], edges: [['a', 'virtual-a']], algorithm: 'radial' });
    expect(layoutProblems(req, await run(req))).toEqual([]);
  });
});

describe('the seed reaches ELK', () => {
  it('stress: different seeds give different layouts, the same seed the same one', async () => {
    const base = randomRequest({ nodes: 12, edges: 14, seed: 2, algorithm: 'stress' });
    const a = await run({ ...base, seed: 1 });
    const b = await run({ ...base, seed: 2 });
    expect(JSON.stringify(a.positions)).not.toBe(JSON.stringify(b.positions));
    expect(JSON.stringify((await run({ ...base, seed: 1 })).positions)).toBe(JSON.stringify(a.positions));
  });

  it('seed 0 and the largest seed are deterministic too (ELK reads a raw 0 as "from the clock": found by the determinism property)', async () => {
    for (const algorithm of ALGORITHMS) {
      for (const seed of [0, 4_294_967_295]) {
        const req = { ...randomRequest({ nodes: 2, edges: 1, seed: 2, algorithm }), seed };
        const first = JSON.stringify((await run(req)).positions);
        for (let i = 0; i < 4; i += 1) expect(JSON.stringify((await run(req)).positions), `${algorithm} seed ${seed}`).toBe(first);
      }
    }
  });
});

describe('determinism: the same request gives byte-identical positions and routes, fresh instances, both engines', () => {
  const requestArb = fc
    .record({
      nodes: fc.integer({ min: 1, max: 24 }),
      edgeFactor: fc.double({ min: 0, max: 2.5, noNaN: true }),
      seed: fc.integer({ min: 0, max: 1000 }),
      loops: fc.integer({ min: 0, max: 2 }),
      parallel: fc.integer({ min: 0, max: 3 }),
      algorithm: fc.constantFrom(...ALGORITHMS),
      direction: fc.constantFrom(...(['RIGHT', 'LEFT', 'DOWN', 'UP'] as const)),
    })
    .map((p) => ({ ...randomRequest({ nodes: p.nodes, edges: Math.max(p.loops + p.parallel + 1, Math.round(p.nodes * p.edgeFactor)), seed: p.seed, selfLoops: p.loops, parallel: p.parallel, algorithm: p.algorithm }), direction: p.direction, seed: p.seed }));

  it('ELK: two fresh engines and instances, and one reused, agree to the byte (durationMs excluded)', async () => {
    await fc.assert(
      fc.asyncProperty(requestArb, async (req) => {
        const reused = freshElk();
        const [a, b, c, d] = [await run(req, freshElk()), await run(req, freshElk()), await run(req, reused), await run(req, reused)];
        const text = (r: typeof a) => JSON.stringify(withoutTiming(r));
        expect(text(b)).toBe(text(a));
        expect(text(c)).toBe(text(a));
        expect(text(d)).toBe(text(a));
        expect(layoutProblems(req, a)).toEqual([]);
      }),
      { numRuns: 60 },
    );
  }, 120_000);

  it('the fallback: the same, and always valid, whatever the algorithm asked for', async () => {
    await fc.assert(
      fc.asyncProperty(requestArb, async (req) => {
        const [a, b] = [await run(req, fallback()), await run(req, fallback())];
        expect(JSON.stringify(withoutTiming(b))).toBe(JSON.stringify(withoutTiming(a)));
        expect(layoutProblems(req, a)).toEqual([]);
      }),
      { numRuns: 150 },
    );
  });

  it('a request that only differs in requestId has the same positions and the same cacheKey; any real change moves the key', async () => {
    const base = randomRequest({ nodes: 10, edges: 14, seed: 1 });
    const a = await run(base);
    const b = await run({ ...base, requestId: 'other' });
    expect(b.cacheKey).toBe(a.cacheKey);
    expect(b.positions).toEqual(a.positions);
    const first = base.edges[0];
    if (first === undefined) throw new Error('no edge');
    const changes: LayoutRequest[] = [
      { ...base, seed: 2 },
      { ...base, direction: 'DOWN' },
      { ...base, algorithm: 'stress' },
      { ...base, spacing: { ...base.spacing, layer: 61 } },
      { ...base, nodes: base.nodes.map((n, i) => (i === 0 ? { ...n, width: n.width + 1 } : n)) },
      { ...base, nodes: base.nodes.map((n, i) => (i === 0 ? { ...n, layerHint: 1 } : n)) },
      { ...base, nodes: base.nodes.map((n, i) => (i === 0 ? { ...n, orderHint: 1 } : n)) },
      { ...base, nodes: base.nodes.map((n, i) => (i === 0 ? { ...n, pinned: { x: 1, y: 1 } } : n)) },
      { ...base, edges: base.edges.map((e, i) => (i === 0 ? { ...e, to: e.from === 'n00000' ? 'n00001' : 'n00000' } : e)) },
      { ...base, edges: base.edges.map((e, i) => (i === 0 ? { ...e, priority: 4 } : e)) },
      { ...base, previous: { n00000: { x: 1, y: 2 } } },
    ];
    const keys = new Set((await Promise.all(changes.map((c) => run(c)))).map((r) => r.cacheKey));
    keys.add(a.cacheKey);
    expect(keys.size).toBe(changes.length + 1);
  });
});
