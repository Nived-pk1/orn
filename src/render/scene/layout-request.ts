/**
 * buildLayoutRequest (step 5.3): a projection and its node sizes become the layout worker's request. Pure and deterministic:
 * one layout node per projection node; one layout edge per drawn path (a bundle's id, or the single edge's own id; membership
 * and overflow edges are paths too); self-loops are left OUT (decision Q4: the scene draws them beside their node); both lists
 * sorted by id; a fixed seed. The caps of the layout contract are answered as a value, never by cutting the graph.
 * The navigator overview is laid out on the GRID (step 5.5c; hubs without a cell are automatic, see `isArranged`); the cells go
 * into the request and no previous positions are sent (the grid has no use for them). Otherwise, and for every other view, as before.
 */
import type { GraphNode, Projection } from '@/core/graph/contracts';
import { MAX_LAYOUT_EDGES, MAX_LAYOUT_NODES, type LayoutAlgorithm, type LayoutDirection, type LayoutEdgeInput, type LayoutNodeInput, type LayoutRequest, type Point } from '@/layout/contracts';
import type { NodeSizes } from './contracts';
import type { LabelSizes } from './label-sizes';
import { drawnPaths } from './paths';

export const LAYOUT_SEED = 1;
export const DEFAULT_SPACING: LayoutRequest['spacing'] = { node: 24, layer: 96, edge: 12 };

export interface LayoutRequestOptions {
  /** Default: the direction of the view (the precursor explorer runs right to left, every other view left to right). */
  readonly direction?: LayoutDirection;
  readonly algorithm?: LayoutAlgorithm;
  readonly spacing?: LayoutRequest['spacing'];
  /** Positions of the last layout; only those of nodes still in the projection are sent (ordering hints, never pins). */
  readonly previous?: Readonly<Record<string, Point>>;
  /** Room for the text on each drawn path (`labelSizes`); a path without an entry asks for none. */
  readonly labelSizes?: LabelSizes;
  /** Default: derived from the projection key, so the same inputs give the same request. */
  readonly requestId?: string;
}

export type LayoutRequestResult =
  | { readonly ok: true; readonly request: LayoutRequest }
  | { readonly ok: false; readonly code: 'TOO_LARGE' | 'MISSING_SIZE' | 'DUPLICATE_ID'; readonly message: string };

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * True when the projection is the navigator overview of anchored hubs (and the Unclassified hub): the grid layout draws it. A hub
 * with an authored cell keeps it; a hub without one is sent as `autoCell` and the layout worker gives it an automatic cell (derived,
 * never written back). The Unclassified hub has no anchor and goes below the grid. Any other node (a member, an overflow node, a
 * focus) means the layered layout, as before.
 */
export function isArranged(projection: Projection): boolean {
  if (projection.view !== 'navigator') return false;
  return projection.nodes.some((node: GraphNode) => node.role === 'anchor') && projection.nodes.every((node) => node.role === 'anchor' || node.role === 'unclassified');
}

export const directionOfView = (view: Projection['view']): LayoutDirection => (view === 'precursor_explorer' ? 'LEFT' : 'RIGHT');

export function buildLayoutRequest(projection: Projection, sizes: NodeSizes, options: LayoutRequestOptions = {}): LayoutRequestResult {
  const paths = drawnPaths(projection).filter((path) => !path.loop);
  if (projection.nodes.length > MAX_LAYOUT_NODES) return { ok: false, code: 'TOO_LARGE', message: `${projection.nodes.length} nodes; layout is limited to ${MAX_LAYOUT_NODES}` };
  if (paths.length > MAX_LAYOUT_EDGES) return { ok: false, code: 'TOO_LARGE', message: `${paths.length} drawn paths; layout is limited to ${MAX_LAYOUT_EDGES}` };
  const arranged = options.algorithm === undefined ? isArranged(projection) : options.algorithm === 'grid';
  const nodes: LayoutNodeInput[] = [];
  for (const node of projection.nodes) {
    const size = sizes.get(node.id);
    if (size === undefined) return { ok: false, code: 'MISSING_SIZE', message: `node "${node.id}" has no size` };
    nodes.push({ id: node.id, width: size.width, height: size.height, ...(arranged && node.arrangement?.cell !== undefined ? { cell: { column: node.arrangement.cell.column, row: node.arrangement.cell.row } } : arranged && node.role === 'anchor' ? { autoCell: true as const } : {}) });
  }
  nodes.sort((a, b) => compare(a.id, b.id));
  for (let i = 1; i < nodes.length; i += 1) {
    if ((nodes[i - 1] as LayoutNodeInput).id === (nodes[i] as LayoutNodeInput).id) return { ok: false, code: 'DUPLICATE_ID', message: `node "${(nodes[i] as LayoutNodeInput).id}" appears twice` };
  }
  const edges: LayoutEdgeInput[] = paths.map((path) => {
    const label = options.labelSizes?.get(path.id);
    return { id: path.id, from: path.from, to: path.to, ...(label === undefined ? {} : { label: { width: label.width, height: label.height } }) };
  });
  const present = new Set(nodes.map((node) => node.id));
  const previous: Record<string, Point> = {};
  for (const id of Object.keys(options.previous ?? {}).sort(compare)) {
    const point = options.previous?.[id];
    if (point !== undefined && present.has(id)) previous[id] = { x: point.x, y: point.y };
  }
  return {
    ok: true,
    request: {
      requestId: options.requestId ?? `layout:${projection.key}`,
      algorithm: options.algorithm ?? (arranged ? 'grid' : 'layered'),
      direction: options.direction ?? directionOfView(projection.view),
      nodes,
      edges,
      spacing: options.spacing ?? DEFAULT_SPACING,
      ...(Object.keys(previous).length === 0 || arranged ? {} : { previous }),
      seed: LAYOUT_SEED,
    },
  };
}
