/**
 * ELK's answer to a `LayoutResult` (step 4.4): top-left positions of the request's nodes (a virtual node is dropped), one route
 * per request edge (ELK's own sections, or a straight route from the shared helper for an edge ELK did not route: non-tree edges
 * of a radial layout, a stress self-loop), and bounds computed over everything that is drawn. A node ELK did not place is an ELK
 * failure (the caller falls back), never a guess.
 */
import type { LayoutRequest, LayoutResult, Point } from '../contracts';
import { boundsOf, straightRoute, type Box } from '../geometry';
import { layoutCacheKey } from '../cache-key';
import { spread, spreadFactor } from './spread';
import type { ElkGraph, ElkSection } from './types';

const clean = (value: number): number => value + 0;
const point = (p: { readonly x: number; readonly y: number }): Point => ({ x: clean(p.x), y: clean(p.y) });

function routeOf(sections: readonly ElkSection[]): Point[] {
  return sections.flatMap((section) => [point(section.startPoint), ...(section.bendPoints ?? []).map(point), point(section.endPoint)]);
}

export function mapResult(request: LayoutRequest, answer: ElkGraph, notes: readonly string[], durationMs: number): LayoutResult {
  const placed = new Map(answer.children.map((child) => [child.id, child] as const));
  let boxes = new Map<string, Box>();
  for (const node of request.nodes) {
    const child = placed.get(node.id);
    if (child === undefined || !Number.isFinite(child.x) || !Number.isFinite(child.y)) throw new Error(`ELK did not place node "${node.id}"`);
    boxes.set(node.id, { x: clean(child.x as number), y: clean(child.y as number), width: node.width, height: node.height });
  }
  const extra: string[] = [];
  let respread = false;
  if (request.algorithm !== 'layered') {
    const factor = spreadFactor(boxes, request.spacing.node);
    if (factor > 1) {
      boxes = spread(boxes, factor);
      respread = true;
      extra.push(`positions were spread by a factor of ${factor.toFixed(2)} to separate overlapping nodes (${request.algorithm} ignores node sizes); every edge is drawn straight`);
    }
  }
  const positions: Record<string, Point> = {};
  for (const [id, box] of boxes) positions[id] = { x: box.x, y: box.y };
  const routed = new Map(answer.edges.map((edge) => [edge.id, edge] as const));
  const edgeRoutes: Record<string, readonly Point[]> = {};
  let straight = 0;
  for (const edge of request.edges) {
    const sections = routed.get(edge.id)?.sections;
    if (!respread && sections !== undefined && sections.length > 0) edgeRoutes[edge.id] = routeOf(sections);
    else {
      edgeRoutes[edge.id] = straightRoute(boxes.get(edge.from) as Box, boxes.get(edge.to) as Box, request.spacing.edge);
      if (!respread) straight += 1;
    }
  }
  const reach: Box[] = [...boxes.values()];
  for (const route of Object.values(edgeRoutes)) for (const p of route) reach.push({ x: p.x, y: p.y, width: 0, height: 0 });
  if (request.algorithm !== 'radial' && straight > 0) extra.push(`${straight} edge(s) had no route from ELK and are drawn straight`);
  return {
    requestId: request.requestId,
    engine: 'elk',
    notes: [...notes, ...extra].sort(),
    positions,
    edgeRoutes,
    bounds: boundsOf(reach),
    durationMs,
    cacheKey: layoutCacheKey(request),
  };
}
