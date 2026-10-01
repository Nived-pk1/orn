/**
 * Real projections of the demo and the design tier (navigator, reaction explorer, precursor explorer; dense and hub_explosion
 * shapes) turned into layout requests with FIXED node sizes (src/test-support/layout-projections.ts; the real Scene mapping is
 * Phase 5), laid out by the real layout handlers over real ELK, and by the fallback: valid every time (every node and edge answered,
 * no overlapping boxes), identical on a second run from fresh instances, every request and result structured-clone safe.
 * ELK that throws on a shape (radial's "no two nodes on one spot") is answered by the fallback with `elk_error`: still valid.
 */
import { describe, expect, it } from 'vitest';
import { createElkEngine, loadElk } from '@/layout/elk';
import { createFallbackEngine } from '@/layout';
import type { LayoutAlgorithm, LayoutRequest, LayoutResult } from '@/layout/contracts';
import { layoutProblems, projectionRequest, withoutTiming } from '@/test-support/layout-kit';
import { demoLayoutRequests, designLayoutRequests } from '@/test-support/layout-projections';
import { createLayoutHandlers } from '@/workers/layout/handlers';

const clock = () => performance.now();
const make = await loadElk();
const signal = new AbortController().signal;
const ctx = { signal, progress: () => undefined };
const all = [...demoLayoutRequests(), ...designLayoutRequests()];
/** Stress is all-pairs (measured: 100 nodes about 2.3 s, 150 about 11 s): only the small projections are laid out with it here. */
const STRESS_LIMIT = 60;

const layout = (request: LayoutRequest): Promise<LayoutResult> => createLayoutHandlers(createElkEngine({ make, clock }), clock).layout(structuredClone(request), ctx);

describe('the projections, as layout requests', () => {
  it('cover the demo and the design tier, three views each, within the traversal limits', () => {
    expect(all.length).toBeGreaterThanOrEqual(12);
    for (const { name, request } of all) {
      expect(request.nodes.length, name).toBeLessThanOrEqual(400);
      expect(request.edges.length, name).toBeLessThanOrEqual(800);
      structuredClone(request);
    }
    expect(all.filter((item) => item.name.includes('navigator')).length).toBeGreaterThanOrEqual(4);
    expect(all.filter((item) => item.name.includes('reaction explorer')).length).toBeGreaterThanOrEqual(3);
    expect(all.filter((item) => item.name.includes('precursor explorer')).length).toBeGreaterThanOrEqual(3);
  });
});

describe('real ELK through the layout handlers', () => {
  for (const algorithm of ['layered', 'radial', 'stress'] as const satisfies readonly LayoutAlgorithm[]) {
    for (const { name, request } of all) {
      if (algorithm === 'stress' && request.nodes.length > STRESS_LIMIT) continue;
      it(`${algorithm}: ${name}`, async () => {
        const req = { ...request, algorithm };
        const result = await layout(req);
        expect(layoutProblems(req, result)).toEqual([]);
        if (algorithm === 'layered') expect(result.engine).toBe('elk'); // layered never falls back on these shapes
        if (result.engine === 'fallback') expect(result.fallbackReason).toBe('elk_error');
        structuredClone(result);
      }, 60_000);
    }
  }

  it('the same projection request twice, from fresh instances, gives the same positions and routes (layered and radial)', async () => {
    for (const { name, request } of all.filter((item) => item.request.edges.length <= 100)) {
      for (const algorithm of ['layered', 'radial'] as const) {
        const req = { ...request, algorithm };
        expect(JSON.stringify(withoutTiming(await layout(req))), `${algorithm} ${name}`).toBe(JSON.stringify(withoutTiming(await layout(req))));
      }
    }
  }, 120_000);
});

describe('the fallback on the same projections', () => {
  it('valid, identical on a second run, and fast', async () => {
    const engine = createFallbackEngine({ reason: 'timeout', clock });
    for (const { name, request } of all) {
      const began = performance.now();
      const first = await engine.layout(structuredClone(request), signal);
      expect(performance.now() - began, name).toBeLessThan(250);
      expect(layoutProblems(request, first), name).toEqual([]);
      expect(JSON.stringify(withoutTiming(await engine.layout(structuredClone(request), signal))), name).toBe(JSON.stringify(withoutTiming(first)));
    }
  });
});

describe('bundled requests (one edge per bundle, never the raw parallel edges)', () => {
  it('carry one edge per bundle plus the edges in no bundle, and every raw edge is accounted for', () => {
    let sawBundle = false;
    for (const { name, projection } of all) {
      const raw = projectionRequest(projection);
      const bundled = projectionRequest(projection, { edges: 'bundled' });
      const inBundles = new Set(projection.bundles.flatMap((bundle) => bundle.edgeIds));
      sawBundle ||= projection.bundles.length > 0;
      expect(bundled.edges.length, name).toBe(raw.edges.length - inBundles.size + projection.bundles.length);
      expect(bundled.nodes, name).toEqual(raw.nodes);
      for (const edge of bundled.edges) expect(inBundles.has(edge.id), name).toBe(false);
      // no two edges of the request join the same ordered pair
      const pairs = bundled.edges.map((edge) => `${edge.from}|${edge.to}`);
      expect(new Set(pairs).size, name).toBe(pairs.length);
      const sorted = [...bundled.edges].sort((a, b) => (a.id < b.id ? -1 : 1));
      expect(bundled.edges, name).toEqual(sorted);
    }
    expect(sawBundle).toBe(true);
  });

  it('are laid out validly by real ELK (layered) and are never larger than the raw request', async () => {
    for (const { name, projection } of all) {
      const bundled = projectionRequest(projection, { edges: 'bundled' });
      expect(layoutProblems(bundled, await layout(bundled)), name).toEqual([]);
      expect(bundled.edges.length).toBeLessThanOrEqual(projection.edges.length);
    }
  }, 120_000);
});
