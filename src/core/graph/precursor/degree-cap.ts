/**
 * Degree cap and overflow (docs/GRAPH_SEMANTICS.md §11): a node shown with more than `DEFAULT_DEGREE_CAP`
 * qualifying neighbours in one direction keeps the best-ranked ones and collapses the rest into one
 * "+N more" virtual overflow node (ADV-012 projection part, ADV-052). Ranking: exam scope, then
 * selectivity, then name, then edge ID — deterministic, so the same state always caps the same way (P-10).
 */
import { DEFAULT_DEGREE_CAP, type GraphEdge, type ProjectionContext } from '../contracts';
import { graphEdgeId } from '../ids';
import type { Step, TraversalDirection } from '../traversal';

const SCOPE_RANK: Readonly<Record<string, number>> = { official: 0, prerequisite: 1, enrichment: 2, unmapped: 3, outside: 4 };
const SELECTIVITY_RANK: Readonly<Record<string, number>> = { exclusive: 0, major: 1, unspecified: 2, mixture_component: 3, minor: 4, trace: 5 };

function nameOf(ctx: ProjectionContext, id: string): string {
  const record = ctx.indexes.get(id);
  if (record === undefined) return '';
  if (record.kind === 'reaction') return record.name;
  if ('names' in record) return record.names.canonical;
  return '';
}

type RankKey = readonly [number, number, string, string];

function rankKey(ctx: ProjectionContext, step: Step): RankKey {
  const edge = step.data as GraphEdge;
  const neighbour = ctx.indexes.get(step.to);
  const scope = ctx.scopeOf({ kind: neighbour?.kind ?? 'reaction', id: step.to });
  return [SCOPE_RANK[scope] ?? 9, SELECTIVITY_RANK[edge.selectivity ?? 'unspecified'] ?? 9, nameOf(ctx, step.to), edge.id];
}

function compareKeys(a: RankKey, b: RankKey): number {
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] as string | number;
    const y = b[i] as string | number;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** Stable virtual node ID for the overflow at `nodeId` in `direction`; a dead end (no further neighbours). */
export function overflowNodeId(nodeId: string, direction: TraversalDirection): string {
  return `virtual:overflow:${direction}:${nodeId}`;
}

/**
 * Caps `steps` at `DEFAULT_DEGREE_CAP`, recording the collapsed count in `overflowCounts` keyed by the
 * overflow node's ID (read back when building that node's `GraphNode.hidden`). Below the cap, unchanged.
 */
export function capDegree(
  ctx: ProjectionContext,
  nodeId: string,
  direction: TraversalDirection,
  steps: readonly Step[],
  overflowCounts: Map<string, number>,
): readonly Step[] {
  if (steps.length <= DEFAULT_DEGREE_CAP) return steps;
  const ranked = [...steps].sort((a, b) => compareKeys(rankKey(ctx, a), rankKey(ctx, b)));
  const kept = ranked.slice(0, DEFAULT_DEGREE_CAP);
  const hidden = ranked.slice(DEFAULT_DEGREE_CAP);
  const overflowId = overflowNodeId(nodeId, direction);
  overflowCounts.set(overflowId, hidden.length);
  // Identity is (view, from, to, semantic) only: one overflow node per (nodeId, direction), so no
  // reactionId/participantId/productId applies — graphEdgeId's generic hash still makes the ID the hash
  // of its own identity, which the projection harness checks for every edge (INV-26).
  const identity = { view: 'precursor_explorer', from: overflowId, to: nodeId, semantic: 'overflow' as const };
  const edgeId = graphEdgeId(identity);
  const overflowEdge: GraphEdge = {
    id: edgeId,
    from: overflowId,
    to: nodeId,
    semantic: 'overflow',
    conditionVariantIds: [],
    inferred: false,
    layoutDirection: 'reversed',
  };
  return [...kept, { edgeId, to: overflowId, data: overflowEdge }];
}
