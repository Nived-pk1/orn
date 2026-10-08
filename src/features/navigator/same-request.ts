/**
 * Whether two layout requests ask the same question (step 5.5a, item d): every field except `requestId` and `previous`. `previous`
 * is a hint taken from the last result, so it differs on the first rebuild after a layout even when nothing else changed; ignoring it
 * lets an unchanged graph reuse its last layout instead of asking again. A plain structural comparison: no hash, no key.
 */
import type { LayoutRequest } from '@/layout/contracts';

export function sameRequest(a: LayoutRequest, b: LayoutRequest): boolean {
  if (a.algorithm !== b.algorithm || a.direction !== b.direction || a.seed !== b.seed) return false;
  if (a.spacing.node !== b.spacing.node || a.spacing.layer !== b.spacing.layer || a.spacing.edge !== b.spacing.edge) return false;
  if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) return false;
  for (let i = 0; i < a.nodes.length; i += 1) {
    const x = a.nodes[i];
    const y = b.nodes[i];
    if (x === undefined || y === undefined || x.id !== y.id || x.width !== y.width || x.height !== y.height) return false;
    if (x.layerHint !== y.layerHint || x.orderHint !== y.orderHint || x.pinned?.x !== y.pinned?.x || x.pinned?.y !== y.pinned?.y) return false;
  }
  for (let i = 0; i < a.edges.length; i += 1) {
    const x = a.edges[i];
    const y = b.edges[i];
    if (x === undefined || y === undefined || x.id !== y.id || x.from !== y.from || x.to !== y.to || x.priority !== y.priority) return false;
    if (x.label?.width !== y.label?.width || x.label?.height !== y.label?.height) return false;
  }
  return true;
}
