/**
 * Request checks (step 4.4), the same for both engines and for the main-side service: a request is refused as a value, never
 * repaired. `TOO_LARGE`: over the node or edge cap. `BAD_REQUEST`: not sorted by id (strictly ascending, so also no duplicates),
 * an edge to a node that is not in the request, a size, spacing, seed, hint or position that is not a finite number of the right
 * kind, an unknown algorithm or direction.
 */
import { MAX_LAYOUT_EDGES, MAX_LAYOUT_NODES, type LayoutRequest } from './contracts';

export type RequestProblem = { readonly code: 'BAD_REQUEST' | 'TOO_LARGE'; readonly message: string };

const ALGORITHMS: readonly string[] = ['layered', 'radial', 'stress'];
const DIRECTIONS: readonly string[] = ['RIGHT', 'LEFT', 'DOWN', 'UP'];
/** Sizes and coordinates above this are not a drawing; it also keeps every sum finite. */
const MAX_COORDINATE = 1_000_000;
const MAX_HINT = 10_000;

const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, min: number, max: number): value is number => finite(value, min, max) && Number.isInteger(value);
const bad = (message: string): RequestProblem => ({ code: 'BAD_REQUEST', message });
const point = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && finite((value as { x?: unknown }).x, -MAX_COORDINATE, MAX_COORDINATE) && finite((value as { y?: unknown }).y, -MAX_COORDINATE, MAX_COORDINATE);

export function checkRequest(request: LayoutRequest): RequestProblem | undefined {
  if (typeof request !== 'object' || request === null || !Array.isArray(request.nodes) || !Array.isArray(request.edges)) return bad('the request needs a nodes list and an edges list');
  if (request.nodes.length > MAX_LAYOUT_NODES) return { code: 'TOO_LARGE', message: `${request.nodes.length} nodes; layout is limited to ${MAX_LAYOUT_NODES}` };
  if (request.edges.length > MAX_LAYOUT_EDGES) return { code: 'TOO_LARGE', message: `${request.edges.length} edges; layout is limited to ${MAX_LAYOUT_EDGES}` };
  if (typeof request.requestId !== 'string') return bad('requestId must be a string');
  if (!ALGORITHMS.includes(request.algorithm)) return bad('unknown algorithm');
  if (!DIRECTIONS.includes(request.direction)) return bad('unknown direction');
  const spacing = request.spacing as Partial<LayoutRequest['spacing']> | undefined;
  if (!finite(spacing?.node, 0, MAX_COORDINATE) || !finite(spacing?.layer, 0, MAX_COORDINATE) || !finite(spacing?.edge, 0, MAX_COORDINATE)) {
    return bad('spacing needs finite node, layer and edge values of at least 0');
  }
  if (!integer(request.seed, 0, 0xffffffff)) return bad('seed must be an unsigned 32-bit integer');
  const ids = new Set<string>();
  let last: string | undefined;
  for (const node of request.nodes) {
    if (typeof node?.id !== 'string' || node.id.length === 0) return bad('every node needs an id');
    if (last !== undefined && !(last < node.id)) return bad(`nodes must be sorted by id, without duplicates: "${node.id}" follows "${last}"`);
    last = node.id;
    ids.add(node.id);
    if (!finite(node.width, 1, MAX_COORDINATE) || !finite(node.height, 1, MAX_COORDINATE)) return bad(`node "${node.id}" needs a finite width and height of at least 1`);
    if (node.layerHint !== undefined && !integer(node.layerHint, 0, MAX_HINT)) return bad(`node "${node.id}": layerHint must be an integer from 0 to ${MAX_HINT}`);
    if (node.orderHint !== undefined && !finite(node.orderHint, -MAX_COORDINATE, MAX_COORDINATE)) return bad(`node "${node.id}": orderHint must be a finite number`);
    if (node.pinned !== undefined && !point(node.pinned)) return bad(`node "${node.id}": pinned must be a finite point`);
  }
  last = undefined;
  for (const edge of request.edges) {
    if (typeof edge?.id !== 'string' || edge.id.length === 0) return bad('every edge needs an id');
    if (last !== undefined && !(last < edge.id)) return bad(`edges must be sorted by id, without duplicates: "${edge.id}" follows "${last}"`);
    last = edge.id;
    if (!ids.has(edge.from) || !ids.has(edge.to)) return bad(`edge "${edge.id}" names a node that is not in the request`);
    if (edge.priority !== undefined && !integer(edge.priority, 0, MAX_HINT)) return bad(`edge "${edge.id}": priority must be an integer from 0 to ${MAX_HINT}`);
  }
  if (request.previous !== undefined) {
    if (typeof request.previous !== 'object' || request.previous === null) return bad('previous must be an object of points');
    for (const [id, value] of Object.entries(request.previous)) if (!point(value)) return bad(`previous["${id}"] must be a finite point`);
  }
  return undefined;
}
