import { describe, expect, it } from 'vitest';
import type { LayoutEdgeInput, LayoutNodeInput, LayoutRequest, LayoutResult, Point } from '../contracts';
import { layoutGrid } from './index';
import { assignPorts, CORNER_CLEAR, PORT_GAP, sideFacing } from './ports';
import type { Rect } from './geometry';

const SPACING = { node: 24, layer: 96, edge: 12 };
const node = (id: string, column: number, row: number, width = 120, height = 56): LayoutNodeInput => ({ id, width, height, cell: { column, row } });
const edge = (id: string, from: string, to: string): LayoutEdgeInput => ({ id, from, to });
/** A very wide box in a column between a and the targets, so that the targets lie far to the right. */
const spacer = node('zz', 4, 9, 2000, 10);
const sorted = <T extends { id: string }>(list: T[]): T[] => [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
const request = (nodes: LayoutNodeInput[], edges: LayoutEdgeInput[]): LayoutRequest => ({ requestId: 'r', algorithm: 'grid', direction: 'RIGHT', nodes: sorted(nodes), edges: sorted(edges), spacing: SPACING, seed: 1 });
const run = (r: LayoutRequest): LayoutResult => layoutGrid(r, () => 0);
const rectOf = (r: LayoutRequest, out: LayoutResult, id: string): Rect => {
  const n = r.nodes.find((x) => x.id === id) as LayoutNodeInput;
  const at = out.positions[id] as Point;
  return { x: at.x, y: at.y, width: n.width, height: n.height };
};
const first = (out: LayoutResult, id: string): Point => (out.edgeRoutes[id] as Point[])[0] as Point;
const last = (out: LayoutResult, id: string): Point => {
  const route = out.edgeRoutes[id] as Point[];
  return route[route.length - 1] as Point;
};

describe('the side an arrow uses', () => {
  const at = (x: number, y: number): Rect => ({ x, y, width: 120, height: 56 });
  it('is the side facing the other box', () => {
    expect(sideFacing(at(0, 0), at(300, 0))).toBe('right');
    expect(sideFacing(at(300, 0), at(0, 0))).toBe('left');
    expect(sideFacing(at(0, 0), at(0, 200))).toBe('bottom');
    expect(sideFacing(at(0, 200), at(0, 0))).toBe('top');
  });
  it('is vertical when the other box lies more below than aside, in proportion to the sizes', () => {
    // 322 across and 200 down: 200 / (56 + 56) beats 322 / (120 + 120)
    expect(sideFacing(at(0, 200), at(322, 0))).toBe('top');
  });
  it('an arrow leaves one box and enters the other on the facing sides', () => {
    const r = request([node('a', 0, 0), node('b', 1, 1)], [edge('e', 'a', 'b')]);
    const out = run(r);
    const a = rectOf(r, out, 'a');
    const b = rectOf(r, out, 'b');
    expect(first(out, 'e').y).toBeCloseTo(a.y + a.height, 6);
    expect(last(out, 'e').y).toBeCloseTo(b.y, 6);
  });
});

describe('spreading the end points along a side', () => {
  it('arrows to three boxes above are spread evenly along the top, ordered by where the other boxes lie, so they do not cross', () => {
    const r = request(
      [node('hub', 1, 1, 240, 56), node('l', 0, 0), node('m', 1, 0), node('r', 2, 0)],
      [edge('e1', 'hub', 'r'), edge('e2', 'hub', 'l'), edge('e3', 'hub', 'm')],
    );
    const out = run(r);
    const xs = ['e2', 'e3', 'e1'].map((id) => first(out, id).x);
    expect(xs[0]).toBeLessThan(xs[1] as number);
    expect(xs[1]).toBeLessThan(xs[2] as number);
    const hub = rectOf(r, out, 'hub');
    const usable = hub.width - 2 * CORNER_CLEAR;
    expect((xs[1] as number) - (xs[0] as number)).toBeCloseTo((xs[2] as number) - (xs[1] as number), 6);
    expect(xs[0]).toBeCloseTo(hub.x + CORNER_CLEAR + usable / 4, 6);
  });

  it('end points on one side are at least 12 px apart and 10 px from the corners, even on a short side', () => {
    const others = ['p', 'q', 'r', 's'].map((id, i) => node(id, 8, i));
    const r = request([node('a', 0, 1), spacer, ...others], others.map((o, i) => edge(`e${i}`, 'a', o.id)));
    const out = run(r);
    const a = rectOf(r, out, 'a');
    const ys = r.edges.map((e) => first(out, e.id).y).sort((x, y) => x - y);
    for (let i = 1; i < ys.length; i += 1) expect((ys[i] as number) - (ys[i - 1] as number)).toBeGreaterThanOrEqual(PORT_GAP - 1e-9);
    expect(ys[0]).toBeGreaterThanOrEqual(a.y + CORNER_CLEAR - 1e-9);
    expect(ys[3]).toBeLessThanOrEqual(a.y + a.height - CORNER_CLEAR + 1e-9);
    expect(out.notes).toEqual([]);
  });

  it('five arrows on a 56 px side keep 12 px apart, reach into the corners and say so', () => {
    const others = ['p', 'q', 'r', 's', 't'].map((id, i) => node(id, 8, i));
    const r = request([node('a', 0, 2), spacer, ...others], others.map((o, i) => edge(`e${i}`, 'a', o.id)));
    const out = run(r);
    const ys = r.edges.map((e) => first(out, e.id).y).sort((x, y) => x - y);
    for (let i = 1; i < ys.length; i += 1) expect((ys[i] as number) - (ys[i - 1] as number)).toBeGreaterThanOrEqual(PORT_GAP - 1e-9);
    expect(out.notes.some((n) => n.includes('more arrows than fit 12 px apart'))).toBe(true);
  });

  it('an arrow and its reverse run 12 px apart at both ends, in the same order (they do not cross)', () => {
    const r = request([node('a', 0, 0), node('b', 2, 0)], [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')]);
    const out = run(r);
    expect(Math.abs(first(out, 'e1').y - first(out, 'e2').y)).toBeCloseTo(PORT_GAP, 6);
    expect(Math.abs(last(out, 'e1').y - last(out, 'e2').y)).toBeCloseTo(PORT_GAP, 6);
    // e1 is above e2 at the start of e1 (a's side) and at its end (b's side): the lines are parallel
    expect(Math.sign(first(out, 'e1').y - first(out, 'e2').y)).toBe(Math.sign(last(out, 'e1').y - last(out, 'e2').y));
  });

  it('a pair that is bowed around a box bows apart', () => {
    const r = request([node('a', 0, 0), node('m', 1, 0), node('b', 2, 0)], [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')]);
    const out = run(r);
    const mid = (id: string): Point => (out.edgeRoutes[id] as Point[])[Math.floor((out.edgeRoutes[id] as Point[]).length / 2)] as Point;
    expect(Math.sign(mid('e1').y - first(out, 'e1').y)).not.toBe(Math.sign(mid('e2').y - first(out, 'e2').y));
  });

  it('is deterministic and does not depend on the order edges are given in', () => {
    const nodes = [node('a', 0, 0), node('b', 1, 0), node('c', 0, 1), node('d', 1, 1)];
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'a'), edge('e3', 'a', 'd'), edge('e4', 'c', 'a'), edge('e5', 'b', 'c')];
    const one = run(request(nodes, edges));
    const two = run(request([...nodes].reverse(), [...edges].reverse()));
    expect(two.edgeRoutes).toEqual(one.edgeRoutes);
    expect(two.positions).toEqual(one.positions);
  });
});

describe('assignPorts', () => {
  it('skips a self-loop and an edge with an unknown box', () => {
    const boxes = new Map<string, Rect>([['a', { x: 0, y: 0, width: 10, height: 10 }]]);
    expect(assignPorts([edge('e', 'a', 'a'), edge('f', 'a', 'z')], boxes).ends.size).toBe(0);
  });
});
