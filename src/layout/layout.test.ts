/** The pure parts shared by both engines and the service (step 4.4): request checks, the cache key, the LRU, straight routes. */
import { describe, expect, it } from 'vitest';
import { randomRequest, request } from '@/test-support/layout-kit';
import { layoutCacheKey } from './cache-key';
import { MAX_LAYOUT_EDGES, MAX_LAYOUT_NODES, type LayoutRequest } from './contracts';
import { boundsOf, straightRoute } from './geometry';
import { LruCache } from './lru';
import { checkRequest } from './validate';

const base = (): LayoutRequest => request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']] });

describe('checkRequest', () => {
  it('accepts a valid request, the empty one, and exactly the caps', () => {
    expect(checkRequest(base())).toBeUndefined();
    expect(checkRequest(request({ nodes: [] }))).toBeUndefined();
    expect(checkRequest(randomRequest({ nodes: MAX_LAYOUT_NODES, edges: MAX_LAYOUT_EDGES, seed: 1 }))).toBeUndefined();
  });

  it('caps: TOO_LARGE one over, for nodes and for edges', () => {
    expect(checkRequest(randomRequest({ nodes: MAX_LAYOUT_NODES + 1, edges: 1, seed: 1 }))).toMatchObject({ code: 'TOO_LARGE' });
    expect(checkRequest(randomRequest({ nodes: 10, edges: MAX_LAYOUT_EDGES + 1, seed: 1 }))).toMatchObject({ code: 'TOO_LARGE' });
  });

  it('sorted means strictly ascending by `<`: a swap, a duplicate and a reversed list are refused, never repaired', () => {
    const r = base();
    const [a, b, c] = r.nodes;
    for (const nodes of [[b, a, c], [a, a, b], [c, b, a]]) expect(checkRequest({ ...r, nodes: nodes as never }), JSON.stringify(nodes)).toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('sorted by id') });
    const [e1, e2] = r.edges;
    expect(checkRequest({ ...r, edges: [e2, e1] as never })).toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('edges must be sorted') });
    // upper case sorts before lower case: the order is the code unit order, not a locale's
    expect(checkRequest(request({ nodes: ['B', 'a'] }))).toBeUndefined();
    expect(checkRequest({ ...request({ nodes: ['B', 'a'] }), nodes: [{ id: 'a', width: 1, height: 1 }, { id: 'B', width: 1, height: 1 }] })).toMatchObject({ code: 'BAD_REQUEST' });
  });

  it.each<[string, (r: LayoutRequest) => unknown]>([
    ['an edge to a missing node', (r) => ({ ...r, edges: [{ id: 'e1', from: 'a', to: 'x' }] })],
    ['a missing nodes list', (r) => ({ ...r, nodes: undefined })],
    ['an empty node id', (r) => ({ ...r, nodes: [{ id: '', width: 1, height: 1 }] })],
    ['a NaN width', (r) => ({ ...r, nodes: [{ id: 'a', width: Number.NaN, height: 1 }] })],
    ['an infinite height', (r) => ({ ...r, nodes: [{ id: 'a', width: 1, height: Infinity }] })],
    ['a width below 1', (r) => ({ ...r, nodes: [{ id: 'a', width: 0.5, height: 1 }] })],
    ['a fractional layerHint', (r) => ({ ...r, nodes: [{ id: 'a', width: 1, height: 1, layerHint: 1.5 }] })],
    ['a NaN orderHint', (r) => ({ ...r, nodes: [{ id: 'a', width: 1, height: 1, orderHint: Number.NaN }] })],
    ['a pinned point with a string', (r) => ({ ...r, nodes: [{ id: 'a', width: 1, height: 1, pinned: { x: '1', y: 1 } }] })],
    ['a negative spacing', (r) => ({ ...r, spacing: { node: -1, layer: 1, edge: 1 } })],
    ['a seed of -1', (r) => ({ ...r, seed: -1 })],
    ['a seed over 32 bits', (r) => ({ ...r, seed: 2 ** 32 })],
    ['an unknown direction', (r) => ({ ...r, direction: 'NORTH' })],
    ['a previous position that is not a point', (r) => ({ ...r, previous: { a: { x: 1 } } })],
    ['an edge priority below 0', (r) => ({ ...r, edges: [{ id: 'e1', from: 'a', to: 'b', priority: -1 }] })],
  ])('BAD_REQUEST for %s', (_name, mutate) => {
    expect(checkRequest(mutate(base()) as LayoutRequest)?.code).toBe('BAD_REQUEST');
  });
});

describe('layoutCacheKey', () => {
  it('is stable, ignores requestId and the order previous was written in, and moves with everything else that matters', () => {
    const r = base();
    const key = layoutCacheKey(r);
    expect(layoutCacheKey({ ...r, requestId: 'other' })).toBe(key);
    expect(layoutCacheKey(structuredClone(r))).toBe(key);
    expect(layoutCacheKey({ ...r, previous: { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } } })).toBe(layoutCacheKey({ ...r, previous: { b: { x: 3, y: 4 }, a: { x: 1, y: 2 } } }));
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });

  it('a change of any kind gives a different key (algorithm, direction, spacing, seed, sizes, hints, pins, edge ends, priority, previous)', () => {
    const r = base();
    const keys = new Set([
      layoutCacheKey(r),
      layoutCacheKey({ ...r, algorithm: 'radial' }),
      layoutCacheKey({ ...r, direction: 'LEFT' }),
      layoutCacheKey({ ...r, spacing: { ...r.spacing, node: r.spacing.node + 1 } }),
      layoutCacheKey({ ...r, spacing: { ...r.spacing, edge: r.spacing.edge + 1 } }),
      layoutCacheKey({ ...r, seed: 2 }),
      layoutCacheKey({ ...r, nodes: r.nodes.map((n, i) => (i === 1 ? { ...n, height: n.height + 1 } : n)) }),
      layoutCacheKey({ ...r, nodes: r.nodes.map((n, i) => (i === 1 ? { ...n, layerHint: 0 } : n)) }),
      layoutCacheKey({ ...r, nodes: r.nodes.map((n, i) => (i === 1 ? { ...n, orderHint: 0 } : n)) }),
      layoutCacheKey({ ...r, nodes: r.nodes.map((n, i) => (i === 1 ? { ...n, pinned: { x: 0, y: 0 } } : n)) }),
      layoutCacheKey({ ...r, edges: r.edges.map((e, i) => (i === 0 ? { ...e, to: 'c' } : e)) }),
      layoutCacheKey({ ...r, edges: r.edges.map((e, i) => (i === 0 ? { ...e, priority: 0 } : e)) }),
      layoutCacheKey({ ...r, previous: { a: { x: 0, y: 0 } } }),
      layoutCacheKey({ ...r, nodes: [...r.nodes, { id: 'd', width: 120, height: 40 }] }),
    ]);
    expect(keys.size).toBe(14);
  });

  it('a value that is absent is not a value that is zero (no hint against a hint of 0)', () => {
    const r = base();
    expect(layoutCacheKey({ ...r, nodes: r.nodes.map((n, i) => (i === 0 ? { ...n, layerHint: 0 } : n)) })).not.toBe(layoutCacheKey(r));
  });
});

describe('LruCache', () => {
  it('keeps the most recently used, evicts the oldest, and never exceeds its capacity', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // a is now the most recent
    cache.set('c', 3);
    expect([cache.get('a'), cache.get('b'), cache.get('c'), cache.size]).toEqual([1, undefined, 3, 2]);
    cache.set('a', 10); // replacing does not grow it
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(() => new LruCache(0)).toThrow(RangeError);
  });
});

describe('straight routes and bounds', () => {
  const box = (x: number, y: number, width = 100, height = 40) => ({ x, y, width, height });

  it('leaves each box at its border, on the line between the centres', () => {
    const [start, end] = straightRoute(box(0, 0), box(300, 0), 10);
    expect(start).toEqual({ x: 100, y: 20 });
    expect(end).toEqual({ x: 300, y: 20 });
    const [down0, down1] = straightRoute(box(0, 0), box(0, 200), 10);
    expect([down0, down1]).toEqual([{ x: 50, y: 40 }, { x: 50, y: 200 }]);
  });

  it('a diagonal leaves through the side the line crosses first; touching or coincident centres give a point, not NaN', () => {
    const [s, e] = straightRoute(box(0, 0, 100, 100), box(500, 500, 100, 100), 10);
    expect(s).toEqual({ x: 100, y: 100 });
    expect(e).toEqual({ x: 500, y: 500 });
    const same = straightRoute(box(0, 0), box(0, 0), 10);
    expect(same.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('a self-loop is four points outside the right side', () => {
    const b = box(10, 10);
    expect(straightRoute(b, b, 8)).toEqual([{ x: 110, y: 20 }, { x: 118, y: 20 }, { x: 118, y: 40 }, { x: 110, y: 40 }]);
  });

  it('bounds contain every box; none is zero by two', () => {
    expect(boundsOf([box(0, 0), box(200, 100, 50, 50)])).toEqual({ width: 250, height: 150 });
    expect(boundsOf([])).toEqual({ width: 0, height: 0 });
  });
});
