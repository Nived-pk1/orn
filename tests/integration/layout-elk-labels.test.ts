/**
 * Edge labels and orthogonal routing over REAL elkjs (step 5.5a, items a and c): a labelled edge gets a label box that overlaps no
 * node and no other label, lies inside the bounds, and the layered routes have right angles only. The fallback places no label and
 * says so; the cache key and the validator know the label size.
 */
import { describe, expect, it } from 'vitest';
import { createElkEngine, loadElk } from '@/layout/elk';
import { createFallbackEngine, layoutCacheKey, checkRequest } from '@/layout';
import type { LayoutEdgeInput, LayoutRequest, LayoutResult } from '@/layout/contracts';
import { randomRequest, request } from '@/test-support/layout-kit';

const clock = () => performance.now();
const make = await loadElk();
const signal = new AbortController().signal;
const elk = () => createElkEngine({ make, clock });

const labelled = (base: LayoutRequest, width = 90, height = 28): LayoutRequest => ({ ...base, edges: base.edges.map((e): LayoutEdgeInput => ({ ...e, label: { width, height } })) });

interface Rect { x: number; y: number; width: number; height: number }
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const labelRects = (req: LayoutRequest, result: LayoutResult): Rect[] =>
  req.edges.flatMap((e) => (e.label === undefined || result.labelPositions?.[e.id] === undefined ? [] : [{ ...(result.labelPositions[e.id] as { x: number; y: number }), ...e.label }]));

describe('edge labels (real ELK)', () => {
  const shapes: [string, LayoutRequest][] = [
    ['a chain', request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']] })],
    ['a fan', request({ nodes: ['a', 'b', 'c', 'd'], edges: [['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'd']] })],
    ['a dense random graph', randomRequest({ nodes: 20, edges: 40, seed: 5 })],
  ];
  for (const [name, base] of shapes) {
    it(`${name}: every label is placed, overlaps no node and no other label, and lies inside the bounds`, async () => {
      const req = labelled({ ...base, edges: base.edges.filter((e) => e.from !== e.to) });
      const result = await elk().layout(structuredClone(req), signal);
      const rects = labelRects(req, result);
      expect(rects).toHaveLength(req.edges.length);
      const nodes: Rect[] = req.nodes.map((n) => ({ ...(result.positions[n.id] as { x: number; y: number }), width: n.width, height: n.height }));
      for (const [i, rect] of rects.entries()) {
        expect(nodes.filter((n) => overlap(n, rect))).toEqual([]);
        expect(rects.filter((other, j) => j > i && overlap(other, rect))).toEqual([]);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(result.bounds.width + 1e-6);
        expect(rect.y + rect.height).toBeLessThanOrEqual(result.bounds.height + 1e-6);
      }
    });
  }

  it('routes are orthogonal: every segment is horizontal or vertical', async () => {
    const req = labelled(randomRequest({ nodes: 20, edges: 40, seed: 5 }));
    const result = await elk().layout(structuredClone({ ...req, edges: req.edges.filter((e) => e.from !== e.to) }), signal);
    for (const route of Object.values(result.edgeRoutes)) {
      for (let i = 1; i < route.length; i += 1) {
        const a = route[i - 1] as { x: number; y: number };
        const b = route[i] as { x: number; y: number };
        expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6).toBe(true);
      }
    }
  });

  it('an edge without a label gets no label position, and a request without labels has none at all', async () => {
    const base = request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']] });
    const half: LayoutRequest = { ...base, edges: [{ ...(base.edges[0] as LayoutEdgeInput), label: { width: 60, height: 20 } }, base.edges[1] as LayoutEdgeInput] };
    const result = await elk().layout(structuredClone(half), signal);
    expect(Object.keys(result.labelPositions ?? {})).toEqual([(half.edges[0] as LayoutEdgeInput).id]);
    const none = await elk().layout(structuredClone(base), signal);
    expect(none.labelPositions).toBeUndefined();
  });

  it('is deterministic', async () => {
    const req = labelled(randomRequest({ nodes: 12, edges: 20, seed: 9 }));
    const clean = { ...req, edges: req.edges.filter((e) => e.from !== e.to) };
    const a = await elk().layout(structuredClone(clean), signal);
    const b = await elk().layout(structuredClone(clean), signal);
    expect({ ...a, durationMs: 0 }).toEqual({ ...b, durationMs: 0 });
  });

  it('the fallback places no label and says so; labels are part of the cache key; a bad label is refused', async () => {
    const base = request({ nodes: ['a', 'b'], edges: [['a', 'b']] });
    const req = labelled(base);
    const result = await createFallbackEngine({ reason: 'elk_error', clock }).layout(structuredClone(req), signal);
    expect(result.labelPositions).toBeUndefined();
    expect(result.notes.some((n) => n.includes('edge labels are not placed'))).toBe(true);
    expect(layoutCacheKey(req)).not.toBe(layoutCacheKey(base));
    expect(layoutCacheKey(req)).not.toBe(layoutCacheKey(labelled(base, 91)));
    expect(checkRequest({ ...req, edges: [{ ...(req.edges[0] as LayoutEdgeInput), label: { width: 0, height: 5 } }] })?.code).toBe('BAD_REQUEST');
    expect(checkRequest(req)).toBeUndefined();
  });
});
