/**
 * Deterministic graph IDs (docs/GRAPH_SEMANTICS.md §10). An edge ID hashes every field that distinguishes
 * an edge, so two participations of the same substance in the same reaction stay two edges (INV-26).
 */
import { hashParts } from '../hash';
import type { GraphEdge } from './contracts';

export const EDGE_ID_PREFIX = 'edg';

export type EdgeIdentity = Pick<
  GraphEdge,
  'from' | 'to' | 'semantic' | 'reactionId' | 'outcomeId' | 'productId' | 'participantId' | 'relationshipId'
> & { readonly view: string };

/** `edg_` + hash(view, from, to, semantic, reactionId, outcomeId, productId, participantId, relationshipId). */
export function graphEdgeId(edge: EdgeIdentity): string {
  return `${EDGE_ID_PREFIX}_${hashParts([
    edge.view,
    edge.from,
    edge.to,
    edge.semantic,
    edge.reactionId,
    edge.outcomeId,
    edge.productId,
    edge.participantId,
    edge.relationshipId,
  ])}`;
}
