/**
 * Coordinates for the fallback layout (step 4.4): positions from the node sizes and the spacing, straight routes. Layers are
 * placed one after another along the flow axis (RIGHT/LEFT: x; DOWN/UP: y), each as thick as its largest node and `spacing.layer`
 * apart; inside a layer the nodes are stacked in order `spacing.node` apart, each layer centred on the widest one. LEFT and UP are
 * the mirror image of RIGHT and DOWN. No two boxes can overlap: nodes of a layer are disjoint along the cross axis, layers are
 * disjoint along the flow axis.
 */
import type { LayoutDirection, LayoutNodeInput, LayoutRequest, Point } from '../contracts';
import { boundsOf, straightRoute, type Box } from '../geometry';

export interface Placement {
  readonly boxes: ReadonlyMap<string, Box>;
  readonly positions: Record<string, Point>;
  readonly edgeRoutes: Record<string, readonly Point[]>;
  readonly bounds: { readonly width: number; readonly height: number };
}

const horizontal = (direction: LayoutDirection): boolean => direction === 'RIGHT' || direction === 'LEFT';
const reversed = (direction: LayoutDirection): boolean => direction === 'LEFT' || direction === 'UP';
/** `value + 0` turns a possible -0 into 0, so two runs never differ by a sign bit. */
const clean = (value: number): number => value + 0;

export function place(request: LayoutRequest, layers: readonly (readonly number[])[]): Placement {
  const nodes: readonly LayoutNodeInput[] = request.nodes;
  const { direction, spacing } = request;
  const flowSize = (v: number): number => (horizontal(direction) ? (nodes[v] as LayoutNodeInput).width : (nodes[v] as LayoutNodeInput).height);
  const crossSize = (v: number): number => (horizontal(direction) ? (nodes[v] as LayoutNodeInput).height : (nodes[v] as LayoutNodeInput).width);

  const thickness = layers.map((members) => Math.max(...members.map(flowSize)));
  const extent = layers.map((members) => members.reduce((sum, v) => sum + crossSize(v), 0) + spacing.node * (members.length - 1));
  const widest = Math.max(0, ...extent);
  const start: number[] = [];
  let cursor = 0;
  thickness.forEach((size, l) => {
    start.push(cursor);
    cursor += size + (l < thickness.length - 1 ? spacing.layer : 0);
  });
  const total = cursor;

  const boxes = new Map<string, Box>();
  layers.forEach((members, l) => {
    let cross = (widest - (extent[l] as number)) / 2;
    for (const v of members) {
      const node = nodes[v] as LayoutNodeInput;
      let flow = (start[l] as number) + ((thickness[l] as number) - flowSize(v)) / 2;
      if (reversed(direction)) flow = total - flow - flowSize(v);
      boxes.set(node.id, horizontal(direction) ? { x: clean(flow), y: clean(cross), width: node.width, height: node.height } : { x: clean(cross), y: clean(flow), width: node.width, height: node.height });
      cross += crossSize(v) + spacing.node;
    }
  });

  const positions: Record<string, Point> = {};
  for (const node of nodes) {
    const box = boxes.get(node.id) as Box;
    positions[node.id] = { x: box.x, y: box.y };
  }
  const edgeRoutes: Record<string, readonly Point[]> = {};
  for (const edge of request.edges) edgeRoutes[edge.id] = straightRoute(boxes.get(edge.from) as Box, boxes.get(edge.to) as Box, spacing.edge);
  return { boxes, positions, edgeRoutes, bounds: boundsOf(boxes.values()) };
}
