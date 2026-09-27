/**
 * Precursor explorer projection (docs/GRAPH_SEMANTICS.md §5, §7): "what makes this" — bounded backward
 * BFS from a target substance or reaction, reversed layout, arrowheads still pointing forward (INV-22,
 * §9). Bundling (§11, ADV-002, ADV-007 widened) and the ⇌ badge rule (ADV-004, ADV-056) are applied once
 * traversal is done. Degree cap and overflow live in `degree-cap.ts` (ADV-012 projection part, ADV-052).
 */
import type { RecordRef } from '../../schema';
import type { GraphEdge, GraphNode, Projection, ProjectionContext, ProjectionDefinition, ProjectionRequest } from '../contracts';
import { bundleEdges, flagsOf, projectionKey, sortEdges, sortNodes } from '../kit';
import { seedIdsOf } from '../reaction-explorer/neighbours';
import { traverse } from '../traversal';
import { backwardNeighboursOf } from './neighbours';
import { tagReversiblePairs } from './reverse-of';

const VIEW = 'precursor_explorer' as const;

const NODE_KIND: Readonly<Record<string, GraphNode['kind']>> = { species: 'species', class: 'class', reagent: 'reagent', reaction: 'reaction' };

function overflowNode(id: string, depth: number, hiddenCount: number): GraphNode {
  return { id, kind: 'virtual', role: 'overflow', depth, hidden: { outgoing: 0, incoming: hiddenCount }, flags: [] };
}

function build(ctx: ProjectionContext, request: ProjectionRequest): Projection {
  const seeds = seedIdsOf(ctx, request.focus);
  const focusIds = new Set(seeds);
  const { neighbours, overflowCounts } = backwardNeighboursOf(ctx, request.conditionVariantId);
  const result = traverse({ seeds, direction: 'both', neighbours, limits: request.limits });

  const nodes: GraphNode[] = result.nodes.flatMap((v): GraphNode[] => {
    if (v.id.startsWith('virtual:overflow:')) return [overflowNode(v.id, v.depth, overflowCounts.get(v.id) ?? 0)];
    const record = ctx.indexes.get(v.id);
    const kind = record === undefined ? undefined : NODE_KIND[record.kind];
    if (record === undefined || kind === undefined) return [];
    const ref: RecordRef = { kind: record.kind, id: record.id };
    return [{ id: v.id, kind, record: ref, role: focusIds.has(v.id) ? 'focus' : 'member', depth: v.depth, hidden: v.hidden, flags: flagsOf(ctx, ref) }];
  });

  const edges = tagReversiblePairs(ctx, result.edges.map((e) => e.data as GraphEdge));

  return {
    view: VIEW,
    revision: ctx.indexes.revision,
    key: projectionKey(request, ctx.indexes.revision),
    nodes: sortNodes(nodes),
    edges: sortEdges(edges),
    bundles: bundleEdges(edges),
    unanchoredReactionIds: [],
    truncation: result.truncation,
  };
}

export const precursorExplorerProjection: ProjectionDefinition = {
  view: VIEW,
  description: 'Bounded backward BFS from a target substance or reaction: producers only, degree-capped, reversed layout, ⇌-tagged mirrored reverse_of pairs.',
  build,
};
