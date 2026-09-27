/**
 * Reagent explorer projection (docs/GRAPH_SEMANTICS.md §7): one hop, "reagent → participations →
 * reactions". Seeds are reagent record(s); a reagent's reactions are found via its own participations
 * (so repeated participations of the same reagent in one reaction stay distinct edges, INV-26), filtered
 * like every other view (scope/topic/reagent-family/text — GRAPH_SEMANTICS.md §2). Spectator participations
 * never qualify, matching every other bipartite view. Reactions are a dead end here: this view does not
 * chase their other participants or products (that is `reaction_explorer`'s job).
 */
import type { ParticipantId, Reaction, RecordRef } from '../../schema';
import type { GraphEdge, GraphNode, Projection, ProjectionContext, ProjectionDefinition, ProjectionRequest } from '../contracts';
import { graphEdgeId } from '../ids';
import { bundleEdges, flagsOf, projectionKey, sortEdges, sortNodes } from '../kit';
import { reactionFilter } from '../navigator/select';
import { traverse, type Step, type TraversalDirection } from '../traversal';

const VIEW = 'reagent_explorer' as const;
const NODE_KIND: Readonly<Record<string, GraphNode['kind']>> = { reagent: 'reagent', reaction: 'reaction' };

function usesReagentEdge(reaction: Reaction, participantId: ParticipantId, reagentId: string): GraphEdge {
  const identity = { view: VIEW, from: reaction.id, to: reagentId, semantic: 'uses_reagent' as const, reactionId: reaction.id, participantId };
  return { id: graphEdgeId(identity), from: identity.from, to: identity.to, semantic: identity.semantic, reactionId: reaction.id, participantId, conditionVariantIds: [], inferred: false, layoutDirection: 'forward' };
}

function neighboursOf(ctx: ProjectionContext, request: ProjectionRequest) {
  const passes = reactionFilter(ctx, request.filters);
  return (nodeId: string, direction: TraversalDirection): readonly Step[] => {
    const record = ctx.indexes.get(nodeId);
    if (record?.kind !== 'reagent' || direction !== 'in') return [];
    return ctx.indexes
      .participationsOf({ kind: 'reagent', id: nodeId })
      .filter((p) => p.role !== 'spectator')
      .flatMap((p): Step[] => {
        const reaction = ctx.indexes.get(p.reactionId);
        if (reaction?.kind !== 'reaction' || !passes(reaction)) return [];
        const edge = usesReagentEdge(reaction, p.participantId, nodeId);
        return [{ edgeId: edge.id, to: edge.from, data: edge }];
      });
  };
}

function build(ctx: ProjectionContext, request: ProjectionRequest): Projection {
  const seeds = request.focus.filter((ref) => ctx.indexes.get(ref.id)?.kind === 'reagent').map((ref) => ref.id);
  const focusIds = new Set(seeds);
  const result = traverse({ seeds, direction: 'in', neighbours: neighboursOf(ctx, request), limits: request.limits });

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

export const reagentExplorerProjection: ProjectionDefinition = {
  view: VIEW,
  description: 'One hop from a focus reagent: reactions that use it (uses_reagent edges), filtered like every other view.',
  build,
};
