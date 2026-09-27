/**
 * Navigator projection (docs/GRAPH_SEMANTICS.md §3, §4, §11, §12): hubs plus one labelled arrow per
 * (reaction, outcome, main product) from the hub of the carried substrate to the hub of the product.
 * Arrows are never merged by endpoints (INV-26). Reactions that reach no anchored hub are listed in
 * `unanchoredReactionIds` (and still drawn on the Unclassified hub); nothing is dropped silently.
 *
 * Not built yet (later steps): hub expansion/focus, degree caps and overflow, edge bundling (2.5).
 * The main-thread time budget is not enforced here because `ProjectionContext` has no injected clock.
 */
import type { ReactionId } from '../../schema';
import type { GraphEdge, GraphNode, Projection, ProjectionContext, ProjectionDefinition, ProjectionRequest, Truncation } from '../contracts';
import { graphEdgeId } from '../ids';
import { bundleEdges, flagsOf, projectionKey, sortEdges, sortNodes, sortedUnique } from '../kit';
import { createHubResolver, hubTargets, UNCLASSIFIED_HUB_ID } from './hubs';
import { mainProducts, primarySubstrate, reactionFilter } from './select';

const VIEW = 'navigator' as const;

const NODE_KIND: Readonly<Record<string, GraphNode['kind']>> = {
  species: 'species',
  class: 'class',
  reagent: 'reagent',
  concept: 'concept',
  named_reaction: 'named_reaction',
};

function build(ctx: ProjectionContext, request: ProjectionRequest): Projection {
  const { limits } = request;
  const targets = hubTargets(ctx.indexes);
  const hubOf = createHubResolver(ctx.indexes, targets);
  const passes = reactionFilter(ctx, request.filters);

  const candidates: GraphEdge[] = [];
  const unanchored: ReactionId[] = [];
  let aborted = false;
  for (const id of Object.keys(ctx.state.records.reaction).sort()) {
    if (limits.signal?.aborted === true) {
      aborted = true;
      break;
    }
    const reaction = ctx.state.records.reaction[id];
    if (reaction === undefined || !passes(reaction)) continue;
    const substrate = primarySubstrate(ctx, reaction);
    const from = substrate === undefined ? undefined : hubOf(substrate.ref);
    let reached = false;
    if (substrate !== undefined && from !== undefined) {
      for (const { outcome, product } of mainProducts(ctx, reaction)) {
        const to = hubOf(product.ref);
        const identity = {
          view: VIEW,
          from: from.hubId,
          to: to.hubId,
          semantic: 'transforms_to',
          reactionId: reaction.id,
          outcomeId: outcome.id,
          productId: product.id,
          participantId: substrate.id,
        } as const;
        candidates.push({
          id: graphEdgeId(identity),
          from: identity.from,
          to: identity.to,
          semantic: identity.semantic,
          reactionId: reaction.id,
          outcomeId: outcome.id,
          productId: product.id,
          participantId: substrate.id,
          selectivity: outcome.selectivity,
          conditionVariantIds: outcome.conditionVariantIds,
          inferred: from.inferred || to.inferred,
          layoutDirection: 'forward',
        });
        reached ||= from.hub !== null || to.hub !== null;
      }
    }
    if (!reached) unanchored.push(reaction.id);
  }

  // Nodes: every real hub (hubs are shown even without arrows) plus Unclassified when an arrow needs it.
  const needsUnclassified = candidates.some((edge) => edge.from === UNCLASSIFIED_HUB_ID || edge.to === UNCLASSIFIED_HUB_ID);
  const realHubs = [...targets.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const slots = Math.max(0, limits.maxNodes - (needsUnclassified ? 1 : 0));
  const admitted = new Set<string>(realHubs.slice(0, slots).map((ref) => ref.id));
  if (needsUnclassified && limits.maxNodes > 0) admitted.add(UNCLASSIFIED_HUB_ID);
  const hiddenHubs = realHubs.length - Math.min(realHubs.length, slots);

  const counts = new Map<string, { outgoing: number; incoming: number }>();
  const count = (id: string, key: 'outgoing' | 'incoming'): void => {
    const entry = counts.get(id) ?? { outgoing: 0, incoming: 0 };
    entry[key] += 1;
    counts.set(id, entry);
  };
  const edges: GraphEdge[] = [];
  let edgesDropped = 0;
  for (const edge of candidates) {
    if (admitted.has(edge.from) && admitted.has(edge.to) && edges.length < limits.maxEdges) {
      edges.push(edge);
      continue;
    }
    edgesDropped += 1;
    if (admitted.has(edge.from)) count(edge.from, 'outgoing');
    if (admitted.has(edge.to)) count(edge.to, 'incoming');
  }

  const nodes: GraphNode[] = realHubs
    .filter((ref) => admitted.has(ref.id))
    .map((ref) => ({
      id: ref.id,
      kind: NODE_KIND[ref.kind] ?? 'virtual',
      record: ref,
      role: 'anchor',
      depth: 0,
      hidden: counts.get(ref.id) ?? { outgoing: 0, incoming: 0 },
      flags: flagsOf(ctx, ref),
    }));
  if (admitted.has(UNCLASSIFIED_HUB_ID)) {
    nodes.push({
      id: UNCLASSIFIED_HUB_ID,
      kind: 'virtual',
      role: 'unclassified',
      depth: 0,
      hidden: counts.get(UNCLASSIFIED_HUB_ID) ?? { outgoing: 0, incoming: 0 },
      flags: ['unanchored'],
    });
  }

  let truncation: Truncation | null = null;
  if (hiddenHubs > 0) truncation = { reason: 'max_nodes', hiddenNodeEstimate: hiddenHubs };
  else if (edgesDropped > 0) truncation = { reason: 'max_edges', hiddenNodeEstimate: 0 };
  else if (aborted) truncation = { reason: 'aborted', hiddenNodeEstimate: 0 };

  return {
    view: VIEW,
    revision: ctx.indexes.revision,
    key: projectionKey(request, ctx.indexes.revision),
    nodes: sortNodes(nodes),
    edges: sortEdges(edges),
    bundles: bundleEdges(edges),
    unanchoredReactionIds: sortedUnique(unanchored),
    truncation,
  };
}

export const navigatorProjection: ProjectionDefinition = {
  view: VIEW,
  description: 'Hubs (navigator anchors) with one labelled arrow per reaction outcome product; Unclassified and Unanchored are explicit.',
  build,
};
