import { describe, expect, it } from 'vitest';
import type { LayoutEdgeInput, LayoutNodeInput, LayoutRequest, LayoutResult, Point } from '../contracts';
import { checkRequest } from '../validate';
import { layoutGrid, ARC_OFFSETS, PORT_GAP } from './index';
import { clipBetween, pointAt, polylineHits, sampleQuadratic, segmentHits } from './geometry';
import { SLIDES } from './chips';
import { layoutCacheKey } from '../cache-key';
import { COLUMN_GAP_FACTOR, ROW_GAP_FACTOR } from './arrange';

const SPACING = { node: 24, layer: 96, edge: 12 };
const node = (id: string, cell: { column: number; row: number } | undefined, width = 100, height = 40): LayoutNodeInput => ({ id, width, height, ...(cell === undefined ? {} : { cell }) });
const edge = (id: string, from: string, to: string, label?: { width: number; height: number }): LayoutEdgeInput => ({ id, from, to, ...(label === undefined ? {} : { label }) });

function request(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[] = [], over: Partial<LayoutRequest> = {}): LayoutRequest {
  return {
    requestId: 'r',
    algorithm: 'grid',
    direction: 'RIGHT',
    nodes: [...nodes].sort((a, b) => (a.id < b.id ? -1 : 1)),
    edges: [...edges].sort((a, b) => (a.id < b.id ? -1 : 1)),
    spacing: SPACING,
    seed: 1,
    ...over,
  };
}

const run = (r: LayoutRequest): LayoutResult => layoutGrid(r, () => 0);
const rectOf = (r: LayoutRequest, result: LayoutResult, id: string) => {
  const n = r.nodes.find((x) => x.id === id) as LayoutNodeInput;
  const at = result.positions[id] as Point;
  return { x: at.x, y: at.y, width: n.width, height: n.height };
};

describe('cells, sizes and gaps', () => {
  it('a column is as wide as its widest box and a row as tall as its tallest, with the gap between', () => {
    const r = request([node('a', { column: 0, row: 0 }, 100, 40), node('b', { column: 1, row: 0 }, 60, 80), node('c', { column: 0, row: 1 }, 140, 40), node('d', { column: 1, row: 1 }, 60, 40)]);
    const out = run(r);
    const across = SPACING.layer * COLUMN_GAP_FACTOR;
    const down = SPACING.layer * ROW_GAP_FACTOR;
    // column 0 is 140 wide (c), column 1 starts 140 + across; row 0 is 80 tall (b), row 1 starts 80 + down
    expect(rectOf(r, out, 'c')).toEqual({ x: 0, y: 80 + down, width: 140, height: 40 });
    expect(rectOf(r, out, 'a')).toEqual({ x: 20, y: 20, width: 100, height: 40 });
    expect(rectOf(r, out, 'b')).toEqual({ x: 140 + across, y: 0, width: 60, height: 80 });
    expect(rectOf(r, out, 'd')).toEqual({ x: 140 + across, y: 80 + down, width: 60, height: 40 });
    expect(out.engine).toBe('grid');
    expect(out.bounds).toEqual({ width: 140 + across + 60, height: 80 + down + 40 });
  });

  it('empty rows and columns take no room: cells are counted in use, in order', () => {
    const r = request([node('a', { column: 0, row: 0 }), node('b', { column: 5, row: 7 })]);
    const out = run(r);
    expect(rectOf(r, out, 'b')).toEqual({ x: 100 + SPACING.layer * COLUMN_GAP_FACTOR, y: 40 + SPACING.layer * ROW_GAP_FACTOR, width: 100, height: 40 });
  });

  it('a box without a cell goes one row below the grid, from column 0, in id order', () => {
    const r = request([node('a', { column: 0, row: 0 }), node('b', { column: 1, row: 2 }), node('u', undefined), node('v', undefined)]);
    const out = run(r);
    const u = rectOf(r, out, 'u');
    const b = rectOf(r, out, 'b');
    const a = rectOf(r, out, 'a');
    expect(u.x).toBe(a.x);
    expect(u.y).toBeGreaterThan(b.y + b.height);
    expect(rectOf(r, out, 'v').x).toBe(b.x);
    expect(rectOf(r, out, 'v').y).toBe(u.y);
  });

  it('boxes that share a cell are stacked in it, and the result says so', () => {
    const r = request([node('a', { column: 0, row: 0 }), node('b', { column: 0, row: 0 })]);
    const out = run(r);
    const a = rectOf(r, out, 'a');
    const b = rectOf(r, out, 'b');
    expect(b.y).toBe(a.y + a.height + SPACING.node);
    expect(out.notes).toEqual(['1 cell holds more than one box: the boxes are stacked in the cell']);
  });

  it('is deterministic: the same request gives the same answer, whatever the clock says', () => {
    const r = request(
      [node('a', { column: 0, row: 0 }), node('b', { column: 2, row: 0 }), node('c', { column: 1, row: 0 })],
      [edge('e1', 'a', 'b', { width: 30, height: 20 }), edge('e2', 'b', 'a', { width: 30, height: 20 })],
    );
    const first = run(r);
    const second = layoutGrid(r, () => 99);
    expect({ ...second, durationMs: 0 }).toEqual({ ...first, durationMs: 0 });
    expect(first.cacheKey).toBe(second.cacheKey);
  });

  it('the request is valid for the shared request checks (cell is a small integer pair)', () => {
    expect(checkRequest(request([node('a', { column: 0, row: 0 })]))).toBeUndefined();
    expect(checkRequest(request([node('a', { column: 64, row: 0 })]))?.code).toBe('BAD_REQUEST');
    expect(checkRequest(request([node('a', { column: 0.5, row: 0 })]))?.code).toBe('BAD_REQUEST');
    expect(checkRequest(request([node('a', { column: 0, row: -1 })]))?.code).toBe('BAD_REQUEST');
  });
});

describe('the cache key', () => {
  it('changes with a cell, and is the same for the same request', () => {
    const at = (column: number) => request([node('a', { column, row: 0 }), node('b', { column: 1, row: 1 })]);
    expect(layoutCacheKey(at(0))).toBe(layoutCacheKey(at(0)));
    expect(layoutCacheKey(at(0))).not.toBe(layoutCacheKey(at(2)));
    expect(run(at(0)).cacheKey).toBe(layoutCacheKey(at(0)));
  });
});

describe('edges', () => {
  it('a line between neighbours is straight, from border to border', () => {
    const r = request([node('a', { column: 0, row: 0 }), node('b', { column: 1, row: 0 })], [edge('e', 'a', 'b')]);
    const out = run(r);
    const route = out.edgeRoutes['e'] as Point[];
    const a = rectOf(r, out, 'a');
    const b = rectOf(r, out, 'b');
    expect(route).toHaveLength(2);
    expect(route[0]).toEqual({ x: a.x + a.width, y: a.y + a.height / 2 });
    expect(route[1]).toEqual({ x: b.x, y: b.y + b.height / 2 });
  });

  it('an arrow and its reverse are two parallel lines PORT_GAP apart', () => {
    const r = request([node('a', { column: 0, row: 0 }), node('b', { column: 1, row: 0 })], [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')]);
    const out = run(r);
    const one = out.edgeRoutes['e1'] as Point[];
    const two = out.edgeRoutes['e2'] as Point[];
    expect(one).toHaveLength(2);
    expect(two).toHaveLength(2);
    expect(Math.abs((one[0] as Point).y - (two[0] as Point).y)).toBeCloseTo(PORT_GAP, 6);
    expect((one[0] as Point).x).toBeCloseTo((two[1] as Point).x, 6);
    // the forward line runs left to right, the reverse one right to left
    expect((one[1] as Point).x).toBeGreaterThan((one[0] as Point).x);
    expect((two[1] as Point).x).toBeLessThan((two[0] as Point).x);
  });

  it('a line that would cross a box is an arc: the smallest offset that clears every box', () => {
    const r = request([node('a', { column: 0, row: 0 }), node('m', { column: 1, row: 0 }), node('b', { column: 2, row: 0 })], [edge('e', 'a', 'b')]);
    const out = run(r);
    const route = out.edgeRoutes['e'] as Point[];
    expect(route.length).toBeGreaterThan(2);
    const m = rectOf(r, out, 'm');
    expect(polylineHits(route, m)).toBe(false);
    // the middle of the curve is the offset away from the chord: the first of 40, 80, 120, 160 that clears the 40 px high box
    const chordY = (route[0] as Point).y;
    const bow = Math.max(...route.map((p) => Math.abs(p.y - chordY)));
    expect(ARC_OFFSETS).toContain(Math.round(bow));
    expect(Math.round(bow)).toBe(40);
    expect(out.notes).toEqual([]);
  });

  it('a taller blocker needs a larger offset', () => {
    const r = request([node('a', { column: 0, row: 0 }), node('m', { column: 1, row: 0 }, 100, 140), node('b', { column: 2, row: 0 })], [edge('e', 'a', 'b')]);
    const out = run(r);
    const route = out.edgeRoutes['e'] as Point[];
    const chordY = (route[0] as Point).y;
    expect(polylineHits(route, rectOf(r, out, 'm'))).toBe(false);
    expect(Math.round(Math.max(...route.map((p) => Math.abs(p.y - chordY))))).toBe(80);
  });

  it('when no arc clears the boxes the line stays straight and is counted in the notes', () => {
    const r = request([node('a', { column: 0, row: 0 }), node('m', { column: 1, row: 0 }, 100, 900), node('b', { column: 2, row: 0 })], [edge('e', 'a', 'b')]);
    const out = run(r);
    expect(out.edgeRoutes['e']).toHaveLength(2);
    expect(out.notes).toEqual(['1 arrow crosses a box: no arc of 40 to 160 px clears the boxes, so the line stays straight']);
  });

  it('chooses the same arc for the same layout (either side: the first side is the parallel side)', () => {
    const r = request([node('a', { column: 0, row: 0 }), node('m', { column: 1, row: 0 }), node('b', { column: 2, row: 0 })], [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')]);
    const out = run(r);
    const one = out.edgeRoutes['e1'] as Point[];
    const two = out.edgeRoutes['e2'] as Point[];
    const side = (route: Point[]): number => Math.sign((route[Math.floor(route.length / 2)] as Point).y - (route[0] as Point).y);
    expect(side(one)).not.toBe(side(two));
  });

  it('an unrelated edge never ends up inside a box it does not touch (a grid of 3 x 3 with every pair)', () => {
    const nodes: LayoutNodeInput[] = [];
    for (let c = 0; c < 3; c += 1) for (let rw = 0; rw < 3; rw += 1) nodes.push(node(`n${c}${rw}`, { column: c, row: rw }));
    const edges: LayoutEdgeInput[] = [];
    for (const a of nodes) for (const b of nodes) if (a.id < b.id) edges.push(edge(`${a.id}>${b.id}`, a.id, b.id));
    const r = request(nodes, edges);
    const out = run(r);
    for (const e of r.edges) {
      const route = out.edgeRoutes[e.id] as Point[];
      for (const n of r.nodes) {
        if (n.id === e.from || n.id === e.to) continue;
        if (out.notes.some((x) => x.includes('crosses') || x.includes('cross '))) continue;
        expect(polylineHits(route, rectOf(r, out, n.id)), `${e.id} through ${n.id}`).toBe(false);
      }
    }
  });
});

describe('count chips', () => {
  const label = { width: 30, height: 20 };

  it('a chip is at the middle of its line', () => {
    const r = request([node('a', { column: 0, row: 0 }), node('b', { column: 1, row: 0 })], [edge('e', 'a', 'b', label)]);
    const out = run(r);
    const route = out.edgeRoutes['e'] as Point[];
    const middle = pointAt(route, 0.5);
    const at = out.labelPositions?.['e'] as Point;
    expect(at).toEqual({ x: middle.x - 15, y: middle.y - 10 });
  });

  it('a chip that would overlap another chip slides along its line to the first free place of 0.5, 0.4, 0.6, 0.3, 0.7', () => {
    const r = request([node('a', { column: 0, row: 0 }), node('b', { column: 1, row: 0 })], [edge('e1', 'a', 'b', label), edge('e2', 'b', 'a', label)]);
    const out = run(r);
    const route2 = out.edgeRoutes['e2'] as Point[];
    const at = out.labelPositions?.['e2'] as Point;
    const centre = { x: at.x + 15, y: at.y + 10 };
    const found = SLIDES.find((f) => {
      const p = pointAt(route2, f);
      return Math.abs(p.x - centre.x) < 1e-6 && Math.abs(p.y - centre.y) < 1e-6;
    });
    // 0.4 and 0.6 are still too close to the first chip on a line of this length: the first free place is 0.3
    expect(found).toBe(0.3);
    const one = out.labelPositions?.['e1'] as Point;
    const separated = Math.abs(one.x - at.x) >= 30 + 4 || Math.abs(one.y - at.y) >= 20 + 4;
    expect(separated).toBe(true);
  });

  it('a chip that cannot find a free place stays at the middle and is counted', () => {
    // a chip as big as the whole gap between two boxes overlaps a box wherever it sits
    const big = { width: 400, height: 300 };
    const r = request([node('a', { column: 0, row: 0 }), node('b', { column: 1, row: 0 })], [edge('e', 'a', 'b', big)]);
    const out = run(r);
    const route = out.edgeRoutes['e'] as Point[];
    const middle = pointAt(route, 0.5);
    expect(out.labelPositions?.['e']).toEqual({ x: middle.x - 200, y: middle.y - 150 });
    expect(out.notes).toEqual(['1 count chip overlaps a box or another chip: no place along its line is free']);
  });

  it('every coordinate is at least 0 even when an arc bows past the first row', () => {
    const r = request([node('a', { column: 0, row: 0 }), node('m', { column: 1, row: 0 }), node('b', { column: 2, row: 0 })], [edge('e', 'a', 'b', label)]);
    const out = run(r);
    for (const p of out.edgeRoutes['e'] as Point[]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
    }
    for (const id of ['a', 'm', 'b']) expect((out.positions[id] as Point).y).toBeGreaterThanOrEqual(0);
    expect(out.bounds.height).toBeGreaterThan(40);
  });
});

describe('hints the grid does not use', () => {
  it('are named in the notes', () => {
    const r = request([{ ...node('a', { column: 0, row: 0 }), layerHint: 1 }, node('b', { column: 1, row: 0 })], [{ ...edge('e', 'a', 'b'), priority: 1 }], { previous: { a: { x: 1, y: 1 } } });
    expect(run(r).notes).toEqual(['the grid layout does not use layerHint, previous, priority']);
  });
});

describe('geometry', () => {
  const box = { x: 10, y: 10, width: 20, height: 20 };
  it('a segment touching the border does not hit the open rectangle; one through it does', () => {
    expect(segmentHits({ x: 0, y: 10 }, { x: 40, y: 10 }, box)).toBe(false);
    expect(segmentHits({ x: 0, y: 20 }, { x: 40, y: 20 }, box)).toBe(true);
    expect(segmentHits({ x: 0, y: 0 }, { x: 5, y: 40 }, box)).toBe(false);
  });
  it('clips a line between the borders of two boxes, undefined when it misses one', () => {
    const left = { x: 0, y: 0, width: 10, height: 10 };
    const right = { x: 30, y: 0, width: 10, height: 10 };
    expect(clipBetween({ x: 5, y: 5 }, { x: 35, y: 5 }, left, right)).toEqual([{ x: 10, y: 5 }, { x: 30, y: 5 }]);
    expect(clipBetween({ x: 5, y: 50 }, { x: 35, y: 50 }, left, right)).toBeUndefined();
  });
  it('samples a quadratic curve with its end points and its middle half way to the control point', () => {
    const points = sampleQuadratic({ x: 0, y: 0 }, { x: 50, y: 80 }, { x: 100, y: 0 }, 4);
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[4]).toEqual({ x: 100, y: 0 });
    expect(points[2]).toEqual({ x: 50, y: 40 });
  });
});
