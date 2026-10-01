/**
 * The ELK adapter without ELK (step 4.4): what the request becomes (options per algorithm, hints, notes), the radial spanning
 * tree, the overlap spreading, and the engine's failure modes over a fake ELK. Real ELK is in tests/integration/layout-elk.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { LayoutEngineUnavailable } from '../errors';
import { layoutProblems, request } from '@/test-support/layout-kit';
import { createFakeElk } from '@/test-support/layout-fakes';
import { createElkEngine } from './engine';
import { mapRequest } from './map-request';
import { radialPlan } from './radial-tree';
import { MAX_SPREAD, spread, spreadFactor } from './spread';

const clock = () => 0;
const signal = new AbortController().signal;
const box = (x: number, y: number, width = 100, height = 40) => ({ x, y, width, height });

describe('mapRequest', () => {
  it('layered: the direction, the spacings, the seed, zero padding; edges and children as given', () => {
    const input = mapRequest(request({ nodes: ['a', 'b'], edges: [['a', 'b']], direction: 'DOWN', seed: 77 }));
    expect(input.graph.layoutOptions).toMatchObject({
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.randomSeed': '77',
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
      'elk.spacing.nodeNode': '20',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.spacing.edgeEdge': '10',
    });
    expect(input.graph.children.map((c) => [c.id, c.width, c.height])).toEqual([['a', 120, 40], ['b', 120, 40]]);
    expect(input.graph.edges).toEqual([{ id: 'e00000', sources: ['a'], targets: ['b'] }]);
    expect(input.notes).toEqual([]);
  });

  it('layerHint becomes ELK partitions; orderHint becomes model order with the children listed in hint order', () => {
    const hinted = mapRequest(request({ nodes: [{ id: 'a', layerHint: 2 }, 'b'] }));
    expect(hinted.graph.layoutOptions['elk.partitioning.activate']).toBe('true');
    expect(hinted.graph.children[0]?.layoutOptions).toEqual({ 'elk.partitioning.partition': '2' });
    expect(hinted.graph.children[1]?.layoutOptions).toBeUndefined();
    const ordered = mapRequest(request({ nodes: [{ id: 'a', orderHint: 3 }, { id: 'b', orderHint: 1 }, { id: 'c' }, { id: 'd', orderHint: 2 }] }));
    expect(ordered.graph.layoutOptions['elk.layered.considerModelOrder.strategy']).toBe('PREFER_NODES');
    expect(ordered.graph.children.map((c) => c.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(mapRequest(request({ nodes: ['a', 'b'] })).graph.layoutOptions['elk.layered.considerModelOrder.strategy']).toBeUndefined();
  });

  it('previous becomes interactive crossing minimisation with positions; a node without one takes the mean of its positioned neighbours, else the far end', () => {
    const input = mapRequest(request({ nodes: ['a', 'b', 'c', 'lone'], edges: [['a', 'b'], ['a', 'c']], previous: { a: { x: 0, y: 10 }, b: { x: 100, y: 50 } } }));
    expect(input.graph.layoutOptions['elk.layered.crossingMinimization.strategy']).toBe('INTERACTIVE');
    const at = Object.fromEntries(input.graph.children.map((c) => [c.id, [c.x, c.y]]));
    expect(at).toEqual({ a: [0, 10], b: [100, 50], c: [0, 10], lone: [100, 50] });
  });

  it('edge priority becomes the layered direction priority', () => {
    const input = mapRequest(request({ nodes: ['a', 'b'], edges: [{ id: 'e1', from: 'a', to: 'b', priority: 5 }] }));
    expect(input.graph.edges[0]?.layoutOptions).toEqual({ 'elk.layered.priority.direction': '5' });
  });

  it('radial and stress lengths are measured between centres: the layer spacing plus the largest node dimension', () => {
    const nodes = [{ id: 'a', width: 200, height: 40 }, { id: 'b', width: 50, height: 300 }];
    expect(mapRequest(request({ nodes, algorithm: 'radial' })).graph.layoutOptions).toMatchObject({ 'elk.algorithm': 'org.eclipse.elk.radial', 'elk.radial.radius': '360' });
    expect(mapRequest(request({ nodes, algorithm: 'stress' })).graph.layoutOptions).toMatchObject({ 'elk.algorithm': 'org.eclipse.elk.stress', 'elk.stress.desiredEdgeLength': '360' });
    expect(mapRequest(request({ nodes: [], algorithm: 'stress' })).graph.layoutOptions['elk.stress.desiredEdgeLength']).toBe('60');
  });

  it('radial gets a spanning tree (parent to child), a virtual centre only for several components, and notes for what it left out', () => {
    const one = mapRequest(request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c'], ['c', 'a']], algorithm: 'radial' }));
    expect(one.graph.edges.map((e) => `${e.sources[0]}>${e.targets[0]}`)).toEqual(['a>b', 'a>c']);
    expect(one.virtualIds.size).toBe(0);
    expect(one.notes).toEqual(['1 edge(s) outside the spanning tree are drawn straight (a radial layout needs a tree)']);
    const many = mapRequest(request({ nodes: ['a', 'b', 'x', 'y'], edges: [['a', 'b'], ['x', 'y']], algorithm: 'radial' }));
    expect(many.virtualIds.size).toBe(3);
    expect(many.graph.children.filter((c) => many.virtualIds.has(c.id))).toHaveLength(1);
    expect(many.graph.children.find((c) => many.virtualIds.has(c.id))).toMatchObject({ width: 0, height: 0 });
    expect(many.notes).toEqual(['2 components were joined under a virtual centre node for the radial layout']);
  });

  it('pinned, hints and priority an algorithm cannot honour are listed, with counts', () => {
    const nodes = [{ id: 'a', pinned: { x: 1, y: 1 }, layerHint: 1, orderHint: 1 }, { id: 'b', pinned: { x: 2, y: 2 } }];
    const edges = [{ id: 'e1', from: 'a', to: 'b', priority: 1 }];
    expect(mapRequest(request({ nodes, edges, algorithm: 'layered' })).notes).toEqual(['pinned positions of 2 node(s) are ignored: ELK layered cannot fix positions']);
    expect(mapRequest(request({ nodes, edges, algorithm: 'stress' })).notes).toEqual([
      'pinned positions of 2 node(s) are ignored: ELK stress cannot fix positions',
      'layerHint of 1 node(s) is ignored by the stress layout',
      'orderHint of 1 node(s) is ignored by the stress layout',
      'edge priority is ignored by the stress layout',
    ]);
  });
});

describe('radialPlan', () => {
  it('breadth-first spanning tree per component; the root is the lowest layerHint, else the most connected, ties by id', () => {
    const hub = radialPlan(request({ nodes: ['a', 'b', 'c', 'd'], edges: [['a', 'b'], ['c', 'b'], ['d', 'b']], algorithm: 'radial' }));
    expect(hub.roots).toEqual(['b']);
    expect(hub.tree.map((t) => `${t.parent}>${t.child}`)).toEqual(['b>a', 'b>c', 'b>d']);
    const hinted = radialPlan(request({ nodes: ['a', 'b', { id: 'c', layerHint: 0 }], edges: [['a', 'b'], ['b', 'c']], algorithm: 'radial' }));
    expect(hinted.roots).toEqual(['c']);
    const tie = radialPlan(request({ nodes: ['p', 'q'], edges: [['p', 'q']], algorithm: 'radial' }));
    expect(tie.roots).toEqual(['p']);
  });

  it('every edge not in the tree is listed: parallel, opposite, loops, cross edges', () => {
    const plan = radialPlan(request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['a', 'b'], ['b', 'a'], ['b', 'c'], ['c', 'a'], ['c', 'c']], algorithm: 'radial' }));
    expect(plan.tree).toHaveLength(2);
    expect(plan.nonTreeEdgeIds.length + plan.tree.length).toBe(6);
  });

  it('isolated nodes are components of their own; the empty graph has no roots', () => {
    expect(radialPlan(request({ nodes: ['a', 'b'], algorithm: 'radial' })).roots).toEqual(['a', 'b']);
    expect(radialPlan(request({ nodes: [], algorithm: 'radial' }))).toEqual({ tree: [], roots: [], nonTreeEdgeIds: [] });
  });
});

describe('spreading', () => {
  it('factor 1 when nothing overlaps; the smallest factor that separates the closest pair otherwise', () => {
    expect(spreadFactor(new Map([['a', box(0, 0)], ['b', box(200, 0)]]), 20)).toBe(1);
    // centres 60 apart on x, boxes 100 wide plus a gap of 20: needs 120 / 60 = 2 on x
    expect(spreadFactor(new Map([['a', box(0, 0)], ['b', box(60, 0)]]), 20)).toBe(2);
    // apart enough on y already
    expect(spreadFactor(new Map([['a', box(0, 0)], ['b', box(10, 100)]]), 20)).toBe(1);
  });

  it('coincident centres, and a factor over the limit, throw (the worker then answers with the fallback)', () => {
    expect(() => spreadFactor(new Map([['a', box(0, 0)], ['b', box(0, 0)]]), 20)).toThrow('same spot');
    expect(() => spreadFactor(new Map([['a', box(0, 0)], ['b', box(1, 1)]]), 20)).toThrow("60.0 times") // min(120 / 1, 60 / 1);
    expect(MAX_SPREAD).toBe(20);
  });

  it('spreading scales the centres and puts the drawing back at the origin; nothing overlaps afterwards', () => {
    const boxes = new Map([['a', box(0, 0)], ['b', box(60, 10)], ['c', box(30, 30)]]);
    const factor = spreadFactor(boxes, 10);
    const moved = spread(boxes, factor);
    expect(Math.min(...[...moved.values()].map((b) => b.x))).toBe(0);
    expect(Math.min(...[...moved.values()].map((b) => b.y))).toBe(0);
    expect(spreadFactor(moved, 10)).toBe(1);
    expect(spread(new Map(), 2).size).toBe(0);
  });
});

describe('the engine over a fake ELK', () => {
  it('maps a result: positions, one route per edge, bounds over everything drawn, a fresh ELK instance per layout', async () => {
    const elk = createFakeElk();
    const engine = createElkEngine({ make: elk.make, clock });
    const req = request({ nodes: ['a', 'b'], edges: [['a', 'b']] });
    const result = await engine.layout(req, signal);
    await engine.layout(req, signal);
    expect(layoutProblems(req, result)).toEqual([]);
    expect(result).toMatchObject({ engine: 'elk', notes: [] });
    expect(elk.made).toBe(2);
    expect(result.bounds.height).toBeGreaterThanOrEqual(140);
  });

  it('a cancelled signal is an AbortError before and after the call; ELK is not asked when it was cancelled before', async () => {
    const elk = createFakeElk();
    const engine = createElkEngine({ make: elk.make, clock });
    const done = new AbortController();
    done.abort();
    await expect(engine.layout(request({ nodes: ['a'] }), done.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(elk.made).toBe(0);
    const late = new AbortController();
    let release: () => void = () => undefined;
    elk.gate = new Promise<void>((resolve) => void (release = resolve));
    const pending = engine.layout(request({ nodes: ['a'] }), late.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    late.abort();
    release();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('ELK failing to load is LayoutEngineUnavailable; ELK throwing propagates as it is; a node ELK did not place is an error', async () => {
    const elk = createFakeElk();
    const engine = createElkEngine({ make: elk.make, clock });
    elk.makeFailure = new Error('no module');
    await expect(engine.layout(request({ nodes: ['a'] }), signal)).rejects.toBeInstanceOf(LayoutEngineUnavailable);
    elk.makeFailure = undefined;
    elk.failure = new Error('boom');
    await expect(engine.layout(request({ nodes: ['a'] }), signal)).rejects.toThrow('boom');
    const forgetful = createElkEngine({ make: () => ({ layout: async (graph) => ({ ...graph, children: [] }) }), clock });
    await expect(forgetful.layout(request({ nodes: ['a'] }), signal)).rejects.toThrow('ELK did not place node "a"');
  });

  it('an edge ELK did not route is drawn straight and counted; a virtual node of a radial layout is never in the answer', async () => {
    const stingy = createElkEngine({ make: () => ({ layout: async (graph) => ({ ...graph, children: graph.children.map((c, i) => ({ ...c, x: 0, y: i * 200 })), edges: [] }) }), clock });
    const req = request({ nodes: ['a', 'b'], edges: [['a', 'b']] });
    const result = await stingy.layout(req, signal);
    expect(result.notes).toEqual(['1 edge(s) had no route from ELK and are drawn straight']);
    expect(result.edgeRoutes.e00000).toHaveLength(2);
    const elk = createFakeElk();
    const radial = await createElkEngine({ make: elk.make, clock }).layout(request({ nodes: ['a', 'b', 'x'], edges: [['a', 'b']], algorithm: 'radial' }), signal);
    expect(Object.keys(radial.positions).sort()).toEqual(['a', 'b', 'x']);
  });
});
