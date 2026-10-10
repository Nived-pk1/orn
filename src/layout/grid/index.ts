/**
 * The grid layout (step 5.5c; ADR-037): the navigator overview as a curated arrangement. Every box has a cell (column, row) from
 * the data; the layout only measures and places. Pure and deterministic: no ELK, no randomness, no clock but the injected one
 * (for `durationMs` only). It runs in the layout worker, with the other layouts (`src/workers/layout/handlers.ts`).
 * Whatever it could not do is in `notes` (never silent): an arrow that crosses a box although no arc clears it, a count chip with
 * no free place, boxes that share a cell, hints it does not use.
 */
import type { LayoutRequest, LayoutResult, Point } from '../contracts';
import { layoutCacheKey } from '../cache-key';
import { arrange } from './arrange';
import { placeChips } from './chips';
import type { Rect } from './geometry';
import { assignPorts, PORT_GAP } from './ports';
import { ARC_OFFSETS, routeEdge } from './route';

export { ARC_OFFSETS, ARC_SAMPLES, CLEARANCE } from './route';
export { CORNER_CLEAR, PORT_GAP } from './ports';
export { CHIP_MARGIN, SLIDES } from './chips';

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function ignoredHints(request: LayoutRequest): string[] {
  const names: string[] = [];
  if (request.nodes.some((node) => node.layerHint !== undefined)) names.push('layerHint');
  if (request.nodes.some((node) => node.orderHint !== undefined)) names.push('orderHint');
  if (request.nodes.some((node) => node.pinned !== undefined)) names.push('pinned');
  if (request.previous !== undefined && Object.keys(request.previous).length > 0) names.push('previous');
  if (request.edges.some((edge) => edge.priority !== undefined)) names.push('priority');
  return names.length === 0 ? [] : [`the grid layout does not use ${names.join(', ')}`];
}

export interface GridOptions {
  /** Notes of the caller (the automatic arrangement), added to the layout's own. */
  readonly notes?: readonly string[];
  /** The key of the request the caller was asked (the cells were filled in after it). */
  readonly cacheKey?: string;
}

export function layoutGrid(request: LayoutRequest, durationMs: () => number, options: GridOptions = {}): LayoutResult {
  const { boxes, sharedCells } = arrange(request);
  const ports = assignPorts(request.edges, boxes);
  const routes = new Map<string, readonly Point[]>();
  let blocked = 0;
  for (const edge of request.edges) {
    const routed = routeEdge(edge, boxes, ports.ends.get(edge.id));
    if (routed === undefined) continue;
    routes.set(edge.id, routed.route);
    if (routed.kind === 'blocked') blocked += 1;
  }
  const chips = placeChips(request.edges, routes, boxes);
  // an arc may bow over the top or left edge: shift everything so that every coordinate is at least 0
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  const reach = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const rect of boxes.values()) {
    reach(rect.x, rect.y);
    reach(rect.x + rect.width, rect.y + rect.height);
  }
  for (const route of routes.values()) for (const p of route) reach(p.x, p.y);
  for (const edge of request.edges) {
    const at = chips.positions[edge.id];
    if (at !== undefined && edge.label !== undefined) {
      reach(at.x, at.y);
      reach(at.x + edge.label.width, at.y + edge.label.height);
    }
  }
  const shift = (p: Point): Point => ({ x: p.x - minX, y: p.y - minY });
  const positions: Record<string, Point> = {};
  for (const node of request.nodes) positions[node.id] = shift(boxes.get(node.id) as Rect);
  const edgeRoutes: Record<string, readonly Point[]> = {};
  for (const [id, route] of routes) edgeRoutes[id] = route.map(shift);
  const labelPositions: Record<string, Point> = {};
  for (const [id, at] of Object.entries(chips.positions)) labelPositions[id] = shift(at);
  const notes = [
    ...(options.notes ?? []),
    ...ignoredHints(request),
    ...(blocked === 0 ? [] : [`${count(blocked, 'arrow crosses', 'arrows cross')} a box: no arc of ${ARC_OFFSETS[0]} to ${ARC_OFFSETS[ARC_OFFSETS.length - 1]} px clears the boxes, so the line stays straight`]),
    ...(chips.kept === 0 ? [] : [`${count(chips.kept, 'count chip overlaps', 'count chips overlap')} a box or another chip: no place along its line is free`]),
    ...(ports.crowded === 0 ? [] : [`${count(ports.crowded, 'side holds', 'sides hold')} more arrows than fit ${PORT_GAP} px apart clear of the corners: the arrows keep ${PORT_GAP} px apart and reach into the corner`]),
    ...(sharedCells === 0 ? [] : [`${count(sharedCells, 'cell holds', 'cells hold')} more than one box: the boxes are stacked in the cell`]),
  ];
  return {
    requestId: request.requestId,
    engine: 'grid',
    notes: notes.sort(),
    positions,
    edgeRoutes,
    labelPositions,
    bounds: { width: maxX - minX, height: maxY - minY },
    durationMs: durationMs(),
    cacheKey: options.cacheKey ?? layoutCacheKey(request),
  };
}
