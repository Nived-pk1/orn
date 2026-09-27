/**
 * Reaction explorer projection (docs/GRAPH_SEMANTICS.md §7): the canonical bipartite graph around a
 * focus substance or reaction — consumes/produces edges, never rolled up to hubs. Bounded BFS both
 * directions (§9, INV-22); spectators and `showAsNode: never` substances are never nodes or edges
 * (ADV-027, ADV-053); intermediates are never read here (ADV-054); repeated participations of the same
 * substance stay distinct edges (ADV-051, INV-26); an optional condition-variant filter narrows
 * participants and outcomes to those that hold under it (ADV-008).
 */
import type { RecordRef } from '../../schema';
import type { GraphEdge, GraphNode, Projection, ProjectionContext, ProjectionDefinition, ProjectionRequest } from '../contracts';
import { bundleEdges, flagsOf, projectionKey, sortEdges, sortNodes } from '../kit';
import { traverse } from '../traversal';
import { neighboursOf, seedIdsOf } from './neighbours';

const VIEW = 'reaction_explorer' as const;

const NODE_KIND: Readonly<Record<string, GraphNode['kind']>> = { species: 'species', class: 'class', reagent: 'reagent', reaction: 'reaction' };

function build(ctx: ProjectionContext, request: ProjectionRequest): Projection {
  const seeds = seedIdsOf(ctx, request.focus);
  const focusIds = new Set(seeds);
  const result = traverse({ seeds, direction: 'both', neighbours: neighboursOf(ctx, request.conditionVariantId), limits: request.limits });

  const nodes: GraphNode[] = result.nodes.flatMap((v): GraphNode[] => {
    const record = ctx.indexes.get(v.id);
    const kind = record === undefined ? undefined : NODE_KIND[record.kind];
    if (record === undefined || kind === undefined) return [];
    const ref: RecordRef = { kind: record.kind, id: record.id };
    return [{ id: v.id, kind, record: ref, role: focusIds.has(v.id) ? 'focus' : 'member', depth: v.depth, hidden: v.hidden, flags: flagsOf(ctx, ref) }];
  });

  const edges = result.edges.map((e) => e.data as GraphEdge);

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

export const reactionExplorerProjection: ProjectionDefinition = {
  view: VIEW,
  description: 'Bounded bipartite BFS from a focus substance or reaction: consumes/produces edges, condition-variant filterable.',
  build,
};
