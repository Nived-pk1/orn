import { describe, expect, it } from 'vitest';
import type { LayoutEdgeInput, LayoutNodeInput, LayoutRequest, LayoutResult, Point } from '../contracts';
import { layoutGrid } from './index';
import { assignPorts, CORNER_CLEAR, PORT_GAP, shareSlots, sideFacing } from './ports';
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

  it('five arrows on a 56 px side share slots, all stay on the side clear of the corners, and it says so (B1)', () => {
    const others = ['p', 'q', 'r', 's', 't'].map((id, i) => node(id, 8, i));
    const r = request([node('a', 0, 2), spacer, ...others], others.map((o, i) => edge(`e${i}`, 'a', o.id)));
    const out = run(r);
    const box = rectOf(r, out, 'a');
    const ys = r.edges.map((e) => first(out, e.id).y).sort((x, y) => x - y);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(box.y + CORNER_CLEAR - 1e-9);
      expect(y).toBeLessThanOrEqual(box.y + box.height - CORNER_CLEAR + 1e-9);
    }
    expect(new Set(ys).size).toBeLessThan(5); // some share a slot
    for (let i = 1; i < ys.length; i += 1) if (ys[i] !== ys[i - 1]) expect((ys[i] as number) - (ys[i - 1] as number)).toBeGreaterThanOrEqual(PORT_GAP - 1e-9);
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

describe('sharing end slots on a side that holds more arrows than fit (step 8.2b-fix, B1)', () => {
  it('arrows that fit get a slot each, PORT_GAP or more apart, inside the usable length', () => {
    const slots = shareSlots(100, 4);
    expect(slots).toHaveLength(4);
    expect(new Set(slots).size).toBe(4);
    for (let i = 1; i < slots.length; i += 1) expect((slots[i] as number) - (slots[i - 1] as number)).toBeGreaterThanOrEqual(PORT_GAP);
    expect(Math.min(...slots)).toBeGreaterThanOrEqual(CORNER_CLEAR);
    expect(Math.max(...slots)).toBeLessThanOrEqual(100 - CORNER_CLEAR);
  });
  it('more arrows than fit: every end stays on the side inside the usable length, the slots are spread evenly and arrows share', () => {
    const slots = shareSlots(100, 30);
    expect(slots).toHaveLength(30);
    expect(Math.min(...slots)).toBeGreaterThanOrEqual(CORNER_CLEAR);
    expect(Math.max(...slots)).toBeLessThanOrEqual(100 - CORNER_CLEAR);
    const distinct = [...new Set(slots)];
    expect(distinct.length).toBe(Math.floor((100 - 2 * CORNER_CLEAR) / PORT_GAP) + 1);
    for (let i = 1; i < distinct.length; i += 1) expect((distinct[i] as number) - (distinct[i - 1] as number)).toBeGreaterThanOrEqual(PORT_GAP - 1e-9);
    expect(slots).toEqual([...slots].sort((a, b) => a - b)); // arrows keep their order, so they still do not cross near the box
  });
  it('one arrow sits in the middle of the side', () => {
    expect(shareSlots(100, 1)).toEqual([50]);
  });
  it('no arrows: no slots; a side with no usable length puts every arrow in its middle', () => {
    expect(shareSlots(100, 0)).toEqual([]);
    expect(shareSlots(0, 3)).toEqual([0, 0, 0]);
    expect(shareSlots(2 * CORNER_CLEAR, 3)).toEqual([CORNER_CLEAR, CORNER_CLEAR, CORNER_CLEAR]);
  });
  it('in a layout with many arrows into one box every end lies on a side of the box', () => {
    const targets = Array.from({ length: 24 }, (_, i) => node(`t${String(i).padStart(2, '0')}`, i % 6, 1 + Math.floor(i / 6)));
    const req = request([node('u', 2, 0, 160, 40), ...targets], targets.map((t) => edge(`e-${t.id}`, t.id, 'u')));
    const out = run(req);
    const u = rectOf(req, out, 'u');
    for (const t of targets) {
      const p = last(out, `e-${t.id}`);
      const onVertical = (Math.abs(p.x - u.x) < 1e-6 || Math.abs(p.x - (u.x + u.width)) < 1e-6) && p.y >= u.y - 1e-6 && p.y <= u.y + u.height + 1e-6;
      const onHorizontal = (Math.abs(p.y - u.y) < 1e-6 || Math.abs(p.y - (u.y + u.height)) < 1e-6) && p.x >= u.x - 1e-6 && p.x <= u.x + u.width + 1e-6;
      expect(onVertical || onHorizontal, `${t.id} ends at ${p.x},${p.y} outside box ${JSON.stringify(u)}`).toBe(true);
    }
  });
});

describe('the box scale in the layout (step 8.2b-fix, C1, C2)', () => {
  it('spread boxes are laid out scaled about their centres, and the arrow ends on the SCALED box', () => {
    const r = request([node('a', 0, 0), node('b', 3, 0)], [edge('e1', 'a', 'b')]);
    const out = layoutGrid({ ...r, growBoxes: true }, () => 0);
    const s = out.boxScale as number;
    expect(s).toBeGreaterThan(1);
    expect(s).toBeLessThanOrEqual(1.8);
    const a = out.positions.a as Point;
    const b = out.positions.b as Point;
    const wa = 120 * s;
    const wb = 120 * s;
    // the arrow leaves the right side of the scaled a and enters the left side of the scaled b
    expect(first(out, 'e1').x).toBeCloseTo(a.x + wa, 6);
    expect(last(out, 'e1').x).toBeCloseTo(b.x, 6);
    expect(wb).toBeGreaterThan(120);
  });
  it('the centres do not move: the distance between two centres is the same as without the scale', () => {
    const r = request([node('a', 0, 0), node('b', 3, 0)], []);
    const out = layoutGrid({ ...r, growBoxes: true }, () => 0);
    const s = out.boxScale as number;
    const dx = (out.positions.b as Point).x + (120 * s) / 2 - ((out.positions.a as Point).x + (120 * s) / 2);
    // the unscaled layout: empty columns take no room, so the two centres are one column (120) and one gap (192) apart
    expect(dx).toBeCloseTo(120 + 192, 6);
  });
  it('a crowded layout is not scaled (boxScale absent)', () => {
    const r = { ...request([node('a', 0, 0), node('b', 1, 0)], [edge('e1', 'a', 'b')]), spacing: { node: 24, layer: 4, edge: 12 } };
    expect(layoutGrid({ ...r, growBoxes: true }, () => 0).boxScale).toBeUndefined();
    expect(run(request([node('a', 0, 0), node('b', 3, 0)], [])).boxScale).toBeUndefined(); // not asked for: never scaled
  });
});
