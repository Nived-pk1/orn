/**
 * Reference implementation of the navigator projection (docs/IMPLEMENTATION_PLAN.md §2 step 2.9): the
 * pre-2.9 algorithm, which scanned every reaction in the state and resolved hubs fresh on every call.
 * Kept here, test-only, as the oracle for the differential test proving the index-backed
 * `navigatorProjection.build` (`src/core/graph/navigator/build.ts`) produces byte-identical output —
 * `tests/property/navigator-differential.test.ts`. Never imported by production code
 * (`no-test-code-in-production`, `.dependency-cruiser.cjs`).
 */
import { graphEdgeId } from '@/core/graph/ids';
import { bundleEdges, flagsOf, projectionKey, sortEdges, sortNodes, sortedUnique } from '@/core/graph/kit';
import type { GraphEdge, GraphNode, Projection, ProjectionContext, ProjectionRequest, Truncation } from '@/core/graph/contracts';
import { UNCLASSIFIED_HUB_ID } from '@/core/graph/navigator/hubs';
import { mainProducts, primarySubstrate, reactionFilter } from '@/core/graph/navigator/select';
import { HubResolver, hubTargets, type HubBasis } from '@/core/indexes/navigator-rollup';
import { compareStrings } from '@/core/indexes/table';
import type { ReactionId, RecordRef } from '@/core/schema';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';

const VIEW = 'navigator' as const;

const NODE_KIND: Readonly<Record<string, GraphNode['kind']>> = {
  species: 'species',
  class: 'class',
  reagent: 'reagent',
  concept: 'concept',
  named_reaction: 'named_reaction',
};

/** Adapts `ReadonlyIndexes` (a method-shaped `anchors()`) to `HubBasis` (a property-shaped `anchors`). */
function toHubBasis(indexes: ReadonlyIndexes): HubBasis {
  return { anchors: indexes.anchors(), get: (id) => indexes.get(id), displayOf: (ref) => indexes.displayOf(ref) };
}

/**
 * The navigator build as it worked before step 2.9's incremental roll-up index: for every reaction in
 * the state, resolve its carried substrate and main products' hubs from scratch, then apply the same
 * request-scoped filter, admission and truncation rules `build.ts` still uses. O(total reactions) by
 * design — this is the thing step 2.9 replaced, not a second implementation of its algorithm.
 */
export function navigatorReferenceBuild(ctx: ProjectionContext, request: ProjectionRequest): Projection {
  const { limits } = request;
  const targets = hubTargets(toHubBasis(ctx.indexes));
  const resolver = new HubResolver(toHubBasis(ctx.indexes), targets);
  const hubOf = (ref: RecordRef) => resolver.resolve(ref);
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

  // Same explicit, stable order `build.ts` now sorts by before truncation (docs/PROGRESS.md step 2.9) —
  // required for byte-for-byte parity under a tight maxEdges, not just for an untruncated result.
  candidates.sort(
    (a, b) => compareStrings(a.reactionId ?? '', b.reactionId ?? '') || compareStrings(a.outcomeId ?? '', b.outcomeId ?? '') || compareStrings(a.productId ?? '', b.productId ?? ''),
  );
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
