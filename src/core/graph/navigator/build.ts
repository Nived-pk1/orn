/**
 * Navigator projection (docs/GRAPH_SEMANTICS.md §3, §4, §11, §12): hubs plus one labelled arrow per
 * (reaction, outcome, main product) from the hub of the carried substrate to the hub of the product.
 * Arrows are never merged by endpoints (INV-26). Reactions that reach no anchored hub are listed in
 * `unanchoredReactionIds` (and still drawn on the Unclassified hub); nothing is dropped silently.
 *
 * Step 2.9: reads the precomputed navigator roll-up (`ctx.indexes.navigatorRollup()`,
 * `core/indexes/navigator-rollup.ts`) instead of scanning every reaction in the state — cost is
 * proportional to hubs and output, not to total reactions (docs/PROGRESS.md step 2.9). Hub resolution and
 * "what does this reaction carry" selection are computed once per touched reaction as the state changes,
 * not once per build call; only the request-scoped filter pass and the maxNodes/maxEdges admission below
 * still run every call, exactly as before.
 *
 * Step 2.11: gathered candidates stay as `NavigatorCandidate` (not the full `GraphEdge`) through sorting and
 * admission — `toEdge` (which hashes `graphEdgeId`) now runs only on the candidates that are actually
 * admitted, not on every candidate gathered. On a dense/unfiltered request most gathered candidates are
 * dropped at the `maxEdges` truncation, so this removed the single largest cost in a profile of this
 * function (docs/PROGRESS.md step 2.11: ~60% of build time on a design-tier, 60-anchor `dense` state, with
 * 7,492 candidates gathered against 800 admitted).
 *
 * Not built yet (later steps): hub expansion/focus, degree caps and overflow, edge bundling (2.5).
 * The main-thread time budget is not enforced here because `ProjectionContext` has no injected clock.
 */
import type { NavigatorCandidate } from '../../indexes/contracts';
import { compareStrings } from '../../indexes/table';
import type { GraphEdge, GraphNode, Projection, ProjectionContext, ProjectionDefinition, ProjectionRequest, Truncation } from '../contracts';
import { graphEdgeId } from '../ids';
import { bundleEdges, flagsOf, projectionKey, sortEdges, sortNodes, sortedUnique } from '../kit';
import { UNCLASSIFIED_HUB_ID } from './hubs';
import { reactionFilter } from './select';

const VIEW = 'navigator' as const;

const NODE_KIND: Readonly<Record<string, GraphNode['kind']>> = {
  species: 'species',
  class: 'class',
  reagent: 'reagent',
  concept: 'concept',
  named_reaction: 'named_reaction',
};

function toEdge(candidate: NavigatorCandidate): GraphEdge {
  const identity = {
    view: VIEW,
    from: candidate.fromHub,
    to: candidate.toHub,
    semantic: 'transforms_to',
    reactionId: candidate.reactionId,
    outcomeId: candidate.outcomeId,
    productId: candidate.productId,
    participantId: candidate.participantId,
  } as const;
  return {
    id: graphEdgeId(identity),
    from: identity.from,
    to: identity.to,
    semantic: identity.semantic,
    reactionId: candidate.reactionId,
    outcomeId: candidate.outcomeId,
    productId: candidate.productId,
    participantId: candidate.participantId,
    selectivity: candidate.selectivity,
    conditionVariantIds: candidate.conditionVariantIds,
    inferred: candidate.inferred,
    layoutDirection: 'forward',
  };
}

function build(ctx: ProjectionContext, request: ProjectionRequest): Projection {
  const { limits } = request;
  const rollup = ctx.indexes.navigatorRollup();
  const passes = reactionFilter(ctx, request.filters);

  // Kept as `NavigatorCandidate` (not yet `toEdge`-converted) through sorting and admission: converting
  // means computing `graphEdgeId`'s hash, and on a dense/unfiltered state most gathered candidates never
  // survive truncation (docs/PROGRESS.md step 2.11 profile: 7,492 candidates gathered, 800 admitted at
  // maxEdges — hashing all 7,492 up front was ~60% of this function's own time, almost all of it wasted on
  // candidates about to be dropped). `NavigatorCandidate` already carries every field the sort/admission
  // logic below needs (reactionId/outcomeId/productId, fromHub/toHub), so nothing here needs the full
  // `GraphEdge` shape until a candidate is actually admitted.
  const candidates: NavigatorCandidate[] = [];
  let aborted = false;
  const hubIds = [...rollup.hubs.map((hub) => hub.id), UNCLASSIFIED_HUB_ID];
  for (const hubId of hubIds) {
    if (limits.signal?.aborted === true) {
      aborted = true;
      break;
    }
    for (const candidate of rollup.candidatesFrom(hubId)) {
      const reaction = ctx.state.records.reaction[candidate.reactionId];
      if (reaction === undefined || !passes(reaction)) continue;
      candidates.push(candidate);
    }
  }
  // Truncation (below) admits candidates in this order until maxEdges is reached, so the order itself is
  // part of the result whenever it truncates. Sorted by (reaction, outcome, product) — not by which hub a
  // candidate is filed under — so the choice of which edges survive never depends on iterating hubs
  // instead of reactions (docs/PROGRESS.md step 2.9; `navigator-reference.ts` sorts the same way).
  candidates.sort((a, b) => compareStrings(a.reactionId, b.reactionId) || compareStrings(a.outcomeId, b.outcomeId) || compareStrings(a.productId, b.productId));
  const unanchored = rollup.unanchoredReactionIds.filter((id) => {
    const reaction = ctx.state.records.reaction[id];
    return reaction !== undefined && passes(reaction);
  });

  // Nodes: every real hub (hubs are shown even without arrows) plus Unclassified when an arrow needs it.
  const needsUnclassified = candidates.some((candidate) => candidate.fromHub === UNCLASSIFIED_HUB_ID || candidate.toHub === UNCLASSIFIED_HUB_ID);
  const realHubs = [...rollup.hubs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
  for (const candidate of candidates) {
    if (admitted.has(candidate.fromHub) && admitted.has(candidate.toHub) && edges.length < limits.maxEdges) {
      edges.push(toEdge(candidate));
      continue;
    }
    edgesDropped += 1;
    if (admitted.has(candidate.fromHub)) count(candidate.fromHub, 'outgoing');
    if (admitted.has(candidate.toHub)) count(candidate.toHub, 'incoming');
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
