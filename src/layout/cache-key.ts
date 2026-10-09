/**
 * The cache key of a request (contract: `LayoutResult.cacheKey`): a hash of everything that changes the answer, nothing that does
 * not (`requestId`). Pure and deterministic; the same function runs on main (cache lookup) and in the worker (the result's key).
 * `previous` is hashed in sorted-key order, so the order its keys were written in never matters.
 */
import { hashParts } from '@/core/hash';
import type { LayoutRequest } from './contracts';

const num = (value: number | undefined): string => (value === undefined ? '-' : String(value));

export function layoutCacheKey(request: LayoutRequest): string {
  const { spacing } = request;
  const previous = request.previous === undefined ? [] : Object.keys(request.previous).sort().map((id) => `${id}=${request.previous?.[id]?.x},${request.previous?.[id]?.y}`);
  return hashParts([
    'layout/3',
    request.algorithm,
    request.direction,
    `${spacing.node},${spacing.layer},${spacing.edge}`,
    String(request.seed),
    request.nodes.map((n) => `${n.id}:${n.width}x${n.height}:${num(n.layerHint)}:${num(n.orderHint)}:${n.pinned === undefined ? '-' : `${n.pinned.x},${n.pinned.y}`}:${n.cell === undefined ? '-' : `${n.cell.column},${n.cell.row}`}`).join('\n'),
    request.edges.map((e) => `${e.id}:${e.from}>${e.to}:${num(e.priority)}:${e.label === undefined ? '-' : `${e.label.width}x${e.label.height}`}`).join('\n'),
    previous.join('\n'),
  ]);
}
