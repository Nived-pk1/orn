/**
 * Automatic arrangement (step 5.5d follow-up). A hub with no authored cell (`autoCell`) gets one from the layered drawing of the
 * hubs: column = its layer, row = its rank inside the layer (top to bottom, then id). Layers are found from the boxes themselves:
 * boxes whose x ranges overlap are in one layer (a layered drawing keeps different layers apart). A box with an authored cell keeps
 * it; an automatic cell already taken moves down to the next free row of its column. Pure and deterministic. The cells exist for
 * the drawing only: they are never written back to the data (INV-11).
 */
import type { LayoutNodeInput, LayoutRequest, Point } from '../contracts';

export interface AutoArrangement {
  readonly request: LayoutRequest;
  /** How many boxes got an automatic cell, and how many of those moved to a free row because their cell was taken. */
  readonly assigned: number;
  readonly moved: number;
}

/** The most automatic rows one column holds before the arrangement continues in the next column to the right. */
export const MAX_AUTO_ROWS = 8;

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The nodes that ask for an automatic cell. */
export const autoNodesOf = (request: LayoutRequest): LayoutNodeInput[] => request.nodes.filter((node) => node.autoCell === true && node.cell === undefined);

/** The layered request for the automatic hubs alone: no labels, no cells, no hints. */
export function layeredRequestOf(request: LayoutRequest): LayoutRequest {
  const auto = autoNodesOf(request);
  const ids = new Set(auto.map((node) => node.id));
  return {
    requestId: `${request.requestId}#auto`,
    algorithm: 'layered',
    direction: request.direction,
    nodes: auto.map((node) => ({ id: node.id, width: node.width, height: node.height })),
    edges: request.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)).map((edge) => ({ id: edge.id, from: edge.from, to: edge.to })),
    spacing: request.spacing,
    seed: request.seed,
  };
}

export function snapToCells(request: LayoutRequest, layered: Readonly<Record<string, Point>>): AutoArrangement {
  const auto = autoNodesOf(request).filter((node) => layered[node.id] !== undefined);
  const spans = auto
    .map((node) => ({ node, x0: (layered[node.id] as Point).x, x1: (layered[node.id] as Point).x + node.width, y: (layered[node.id] as Point).y + node.height / 2 }))
    .sort((a, b) => a.x0 - b.x0 || compare(a.node.id, b.node.id));
  const layers: (typeof spans)[] = [];
  let reach = -Infinity;
  for (const span of spans) {
    if (layers.length === 0 || span.x0 >= reach) {
      layers.push([span]);
      reach = span.x1;
    } else {
      (layers[layers.length - 1] as typeof spans).push(span);
      reach = Math.max(reach, span.x1);
    }
  }
  const taken = new Set<string>();
  for (const node of request.nodes) if (node.cell !== undefined) taken.add(`${node.cell.column}:${node.cell.row}`);
  const cells = new Map<string, { column: number; row: number }>();
  let moved = 0;
  let nextColumn = 0;
  for (const layer of layers) {
    layer.sort((a, b) => a.y - b.y || compare(a.node.id, b.node.id));
    let column = nextColumn;
    let row = 0;
    for (const span of layer) {
      // A column holds at most MAX_AUTO_ROWS automatic rows: the rest continue in the next column to the right, same order.
      while (true) {
        if (row >= MAX_AUTO_ROWS) {
          column += 1;
          row = 0;
        }
        if (!taken.has(`${column}:${row}`)) break;
        row += 1;
        moved += 1;
      }
      taken.add(`${column}:${row}`);
      cells.set(span.node.id, { column, row });
      row += 1;
    }
    nextColumn = column + 1;
  }
  const nodes = request.nodes.map((node) => {
    const cell = cells.get(node.id);
    if (cell === undefined) return node;
    const { autoCell: _auto, ...rest } = node;
    return { ...rest, cell };
  });
  return { request: { ...request, nodes }, assigned: cells.size, moved };
}
