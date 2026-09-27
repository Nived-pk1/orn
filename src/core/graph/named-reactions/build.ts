/**
 * Named-reactions projection (docs/GRAPH_SEMANTICS.md §7): the family DAG (`parentIds`, e.g. Friedel–Crafts
 * → Friedel–Crafts acylation) plus the reactions that instantiate each family member (`namedReactionIds`).
 * Both parent-child and reaction-membership edges reuse the `membership` semantic (GRAPH_SEMANTICS.md §1's
 * "class membership" convention: specific → general). A reaction is a dead end here — its own participants
 * and products are `reaction_explorer`'s job, not this view's. A membership edge never carries `reactionId`:
 * it is a classification, not a participation or production (a reaction may name several families), so
 * INV-26 does not apply to it — the reaction is still recoverable from `edge.from`.
 */
import type { NamedReaction, RecordRef } from '../../schema';
import type { GraphEdge, GraphNode, Projection, ProjectionContext, ProjectionDefinition, ProjectionRequest } from '../contracts';
import { graphEdgeId } from '../ids';
import { bundleEdges, flagsOf, projectionKey, referencing, sortEdges, sortNodes } from '../kit';
import { traverse, type Step, type TraversalDirection } from '../traversal';

const VIEW = 'named_reactions' as const;
const NODE_KIND: Readonly<Record<string, GraphNode['kind']>> = { named_reaction: 'named_reaction', reaction: 'reaction' };

function membershipEdge(from: string, to: string): GraphEdge {
  const identity = { view: VIEW, from, to, semantic: 'membership' as const };
  return { id: graphEdgeId(identity), from, to, semantic: 'membership', conditionVariantIds: [], inferred: false, layoutDirection: 'forward' };
}

function fromNamedReaction(ctx: ProjectionContext, named: NamedReaction, direction: TraversalDirection): Step[] {
  if (direction === 'out') {
    return named.parentIds.map((parentId): Step => {
      const edge = membershipEdge(named.id, parentId);
      return { edgeId: edge.id, to: edge.to, data: edge };
    });
  }
  const self: RecordRef = { kind: 'named_reaction', id: named.id };
  const children = referencing(ctx.indexes, self, 'parentIds[]', 'named_reaction').map((c): Step => {
    const edge = membershipEdge(c.id, named.id);
    return { edgeId: edge.id, to: edge.from, data: edge };
  });
  const reactions = referencing(ctx.indexes, self, 'namedReactionIds[]', 'reaction').map((r): Step => {
    const edge = membershipEdge(r.id, named.id);
    return { edgeId: edge.id, to: edge.from, data: edge };
  });
  return [...children, ...reactions];
}

function neighboursOf(ctx: ProjectionContext) {
  return (nodeId: string, direction: TraversalDirection): readonly Step[] => {
    const record = ctx.indexes.get(nodeId);
    if (record?.kind !== 'named_reaction') return [];
    return fromNamedReaction(ctx, record, direction);
  };
}

function build(ctx: ProjectionContext, request: ProjectionRequest): Projection {
  const seeds = request.focus.filter((ref) => ctx.indexes.get(ref.id)?.kind === 'named_reaction').map((ref) => ref.id);
  const focusIds = new Set(seeds);
  const result = traverse({ seeds, direction: 'both', neighbours: neighboursOf(ctx), limits: request.limits });

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

export const namedReactionsProjection: ProjectionDefinition = {
  view: VIEW,
  description: 'Family DAG (parentIds) plus the reactions that instantiate each family member (namedReactionIds), both as membership edges.',
  build,
};
