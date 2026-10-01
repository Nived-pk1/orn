/**
 * The in-house fallback layout (ADR-007, step 4.4): a deterministic layered drawing when ELK throws, is unavailable, or runs past
 * its limit. Longest-path layering after cycle breaking, barycentric ordering (`SWEEPS` fixed sweeps), straight routes. Pure: no
 * clock but the injected one (for `durationMs` only), no randomness (`seed` is accepted and unused). Whatever the request asked
 * for and this layout cannot do is listed in `notes`: the algorithm (it is always layered), `pinned`, `previous`, edge `priority`.
 */
import type { FallbackReason, LayoutEngine, LayoutRequest, LayoutResult } from '../contracts';
import { layoutCacheKey } from '../cache-key';
import { boundsOf, type Box } from '../geometry';
import { buildGraph } from './graph';
import { breakCycles, layerNodes } from './layering';
import { orderLayers } from './ordering';
import { place } from './place';

export { SWEEPS } from './ordering';

export function fallbackNotes(request: LayoutRequest): string[] {
  const notes: string[] = [];
  if (request.algorithm !== 'layered') notes.push(`the fallback layout is always layered; ${request.algorithm} was requested`);
  const pinned = request.nodes.filter((node) => node.pinned !== undefined).length;
  if (pinned > 0) notes.push(`pinned positions of ${pinned} node(s) are not honoured by the fallback layout`);
  if (request.previous !== undefined && Object.keys(request.previous).length > 0) notes.push('previous positions are not used by the fallback layout');
  if (request.edges.some((edge) => edge.priority !== undefined)) notes.push('edge priority is not used by the fallback layout');
  return notes;
}

export function layoutFallback(request: LayoutRequest, reason: FallbackReason, durationMs: () => number): LayoutResult {
  const graph = buildGraph(request);
  const layer = layerNodes(breakCycles(graph), request.nodes);
  const placed = place(request, orderLayers(graph, layer, request.nodes));
  const reach: Box[] = [...placed.boxes.values()];
  for (const route of Object.values(placed.edgeRoutes)) for (const p of route) reach.push({ x: p.x, y: p.y, width: 0, height: 0 });
  return {
    requestId: request.requestId,
    engine: 'fallback',
    fallbackReason: reason,
    notes: fallbackNotes(request).sort(),
    positions: placed.positions,
    edgeRoutes: placed.edgeRoutes,
    bounds: boundsOf(reach),
    durationMs: durationMs(),
    cacheKey: layoutCacheKey(request),
  };
}

/** The fallback as a `LayoutEngine`; every answer carries `reason`. `clock` is milliseconds (monotonic) and only times the call. */
export function createFallbackEngine(options: { readonly reason: FallbackReason; readonly clock: () => number }): LayoutEngine {
  return {
    layout(request, signal) {
      if (signal.aborted) return Promise.reject(new DOMException('layout cancelled', 'AbortError'));
      const began = options.clock();
      return Promise.resolve(layoutFallback(request, options.reason, () => options.clock() - began));
    },
  };
}
