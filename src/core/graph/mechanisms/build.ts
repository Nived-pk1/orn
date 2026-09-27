/**
 * Mechanisms projection (docs/GRAPH_SEMANTICS.md §7): "mechanism → outcomes → reactions". Seeds are
 * mechanism record(s); `uses_mechanism` edges (ADR-029) connect each reaction that uses the mechanism —
 * at reaction level (`reaction.mechanismIds`, no `outcomeId`) and/or per outcome (`outcome.mechanism`,
 * with `outcomeId` — ADV-055: a reaction with two outcomes linking different variants of the same
 * mechanism gets two distinct edges, each resolvable back to its own variant via `outcomeId`). The
 * mechanism's own variants/steps ("pathway") are nested data, read directly off the record, never nodes.
 * A reaction is a dead end here, same as `reagent_explorer`/`named_reactions`.
 *
 * A reaction-level edge (no `outcomeId`) never carries `reactionId` either: `mechanismIds` can list more
 * than one mechanism, so it is a classification, not a single resolvable production — INV-26 does not
 * apply to it (the reaction is still `edge.from`). An outcome-level edge keeps `reactionId` because
 * `outcomeId` already makes it unique: one outcome names at most one mechanism.
 */
import type { Mechanism, OutcomeId, ReactionId, RecordRef } from '../../schema';
import type { GraphEdge, GraphNode, Projection, ProjectionContext, ProjectionDefinition, ProjectionRequest } from '../contracts';
import { graphEdgeId } from '../ids';
import { bundleEdges, flagsOf, projectionKey, sortEdges, sortNodes } from '../kit';
import { traverse, type Step, type TraversalDirection } from '../traversal';

const VIEW = 'mechanisms' as const;
const NODE_KIND: Readonly<Record<string, GraphNode['kind']>> = { mechanism: 'mechanism', reaction: 'reaction' };

function usesMechanismEdge(reactionId: ReactionId, mechanismId: string, outcomeId?: OutcomeId): GraphEdge {
  const identity = { view: VIEW, from: reactionId, to: mechanismId, semantic: 'uses_mechanism' as const, ...(outcomeId === undefined ? {} : { reactionId, outcomeId }) };
  return { id: graphEdgeId(identity), from: reactionId, to: mechanismId, semantic: 'uses_mechanism', ...(outcomeId === undefined ? {} : { reactionId, outcomeId }), conditionVariantIds: [], inferred: false, layoutDirection: 'forward' };
}

function fromMechanism(ctx: ProjectionContext, mechanism: Mechanism): Step[] {
  return ctx.indexes.reactionsByMechanism(mechanism.id).flatMap((reactionId): Step[] => {
    const reaction = ctx.indexes.get(reactionId);
    if (reaction?.kind !== 'reaction') return [];
    const edges: GraphEdge[] = [];
    if (reaction.mechanismIds.includes(mechanism.id)) edges.push(usesMechanismEdge(reactionId, mechanism.id));
    for (const outcome of reaction.outcomes) {
      if (outcome.mechanism?.mechanismId === mechanism.id) edges.push(usesMechanismEdge(reactionId, mechanism.id, outcome.id));
    }
    return edges.map((edge) => ({ edgeId: edge.id, to: edge.from, data: edge }));
  });
}

function neighboursOf(ctx: ProjectionContext) {
  return (nodeId: string, direction: TraversalDirection): readonly Step[] => {
    const record = ctx.indexes.get(nodeId);
    if (record?.kind !== 'mechanism' || direction !== 'in') return [];
    return fromMechanism(ctx, record);
  };
}

function build(ctx: ProjectionContext, request: ProjectionRequest): Projection {
  const seeds = request.focus.filter((ref) => ctx.indexes.get(ref.id)?.kind === 'mechanism').map((ref) => ref.id);
  const focusIds = new Set(seeds);
  const result = traverse({ seeds, direction: 'in', neighbours: neighboursOf(ctx), limits: request.limits });

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

export const mechanismsProjection: ProjectionDefinition = {
  view: VIEW,
  description: 'One hop from a focus mechanism: reactions/outcomes that use it, one uses_mechanism edge per link (reaction-level and/or per outcome).',
  build,
};
