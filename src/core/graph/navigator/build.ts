/**
 * Navigator projection (docs/GRAPH_SEMANTICS.md §3, §4, §11, §12): hubs plus labelled arrows from the hub of
 * the carried substrate to the hub of each main product, one arrow per (reaction, outcome, main product),
 * never merged by endpoints (INV-26). Reactions that reach no anchored hub are listed in
 * `unanchoredReactionIds` (and still drawn on the Unclassified hub); nothing is dropped silently.
 *
 * Step 2.9 reads the precomputed roll-up (`ctx.indexes.navigatorRollup()`) instead of scanning every
 * reaction. Step 5.4c (decision Q3, PROGRESS.md "Amendments") builds the overview per ordered node PAIR:
 *  - a pair's total is its number of candidates after the request's filters (arrows are counted, never
 *    merged); pairs between admitted nodes are ordered by (total descending, from, to) and the first
 *    `limits.maxEdges` of them are admitted: maxEdges bounds drawn PATHS, not raw arrows;
 *  - every admitted pair materialises its best-ranked arrow, then the spare edge budget is given out to the
 *    smallest pairs first (`pairs.ts`), so small pairs are complete and a small dataset keeps every edge;
 *  - every admitted pair with two or more arrows is a bundle that knows its FULL total;
 *  - a pair from a hub to itself is an ordinary pair with from === to (drawn later as a loop);
 *  - `hidden` on a node and `Truncation.hiddenPairs/hiddenEdges` are exact: the candidates of the pairs that
 *    are NOT admitted. Truncation is null when every pair is admitted, even if not every arrow is drawn;
 *  - an expanded hub shows its members (`expansion.ts`); nothing is dropped: the totals of the admitted pairs
 *    plus the hidden candidates equal the filtered candidates, for every request.
 * Exam scope and name are NOT ranking keys here (a scope lookup per candidate would break the 16 ms row);
 * the full, sorted list of a pair is read from the roll-up index on demand (step 5.5b).
 * `request.focus` and `expansion.collapsedEdgeIds` are ignored for now (Phase 7). The main-thread time
 * budget is not enforced because `ProjectionContext` has no injected clock.
 */
import type { NavigatorCandidate } from '../../indexes/contracts';
import { compareStrings } from '../../indexes/table';
import { hashParts } from '../../hash';
import type { EdgeBundle, GraphEdge, GraphNode, Projection, ProjectionContext, ProjectionDefinition, ProjectionRequest, Truncation } from '../contracts';
import { projectionKey, sortEdges, sortNodes, sortedUnique } from '../kit';
import { arrowOf, movesArrows, NO_EXPANSION, planExpansion } from './expansion';
import { UNCLASSIFIED_HUB_ID } from './hubs';
import { expansionParts, hubNode, toEdge, unclassifiedNode, VIEW } from './nodes';
import { byAdmission, groupPairs, materialise, type Pair } from './pairs';
import { isUnfiltered, reactionFilter } from './select';
import { READS_KINDS } from './reads';

type Counts = Map<string, { outgoing: number; incoming: number }>;

function addHidden(counts: Counts, id: string, key: 'outgoing' | 'incoming', n: number): void {
  const entry = counts.get(id) ?? { outgoing: 0, incoming: 0 };
  entry[key] += n;
  counts.set(id, entry);
}

function build(ctx: ProjectionContext, request: ProjectionRequest): Projection {
  const { limits } = request;
  const rollup = ctx.indexes.navigatorRollup();
  const passes = reactionFilter(ctx, request.filters);
  const unfiltered = isUnfiltered(request.filters);
  const accept = (c: NavigatorCandidate): boolean => {
    const reaction = ctx.state.records.reaction[c.reactionId];
    return reaction !== undefined && passes(reaction);
  };
  const aborted = limits.signal?.aborted === true;

  // Unfiltered requests read the roll-up's pair table. A filtered one scans the candidates of every hub, because
  // the filters are per reaction and the table holds unfiltered counts (the full scan is the fallback, not a second rule).
  const candidates: NavigatorCandidate[] = [];
  if (!unfiltered && !aborted) {
    for (const hubId of [...rollup.hubs.map((hub) => hub.id), UNCLASSIFIED_HUB_ID]) {
      for (const candidate of rollup.candidatesFrom(hubId)) if (accept(candidate)) candidates.push(candidate);
    }
  }
  const unanchored = rollup.unanchoredReactionIds.filter((id) => {
    const reaction = ctx.state.records.reaction[id];
    return reaction !== undefined && passes(reaction);
  });

  // Hubs: every real hub up to maxNodes (hubs are shown even without arrows), plus Unclassified when an arrow needs it.
  const needsUnclassified = aborted
    ? false
    : unfiltered
      ? rollup.candidatesFrom(UNCLASSIFIED_HUB_ID).length > 0 || rollup.candidatesTo(UNCLASSIFIED_HUB_ID).length > 0
      : candidates.some((c) => c.fromHub === UNCLASSIFIED_HUB_ID || c.toHub === UNCLASSIFIED_HUB_ID);
  const realHubs = [...rollup.hubs].sort((a, b) => compareStrings(a.id, b.id));
  const slots = Math.max(0, limits.maxNodes - (needsUnclassified ? 1 : 0));
  const admittedHubs = new Set<string>(realHubs.slice(0, slots).map((ref) => ref.id));
  if (needsUnclassified && limits.maxNodes > 0) admittedHubs.add(UNCLASSIFIED_HUB_ID);
  const hiddenHubs = realHubs.length - Math.min(realHubs.length, slots);

  const plan =
    aborted || request.expansion.expanded.length === 0
      ? NO_EXPANSION
      : planExpansion(rollup, request, unfiltered ? () => true : accept, admittedHubs, { nodes: limits.maxNodes - admittedHubs.size, edges: limits.maxEdges });
  const shown = new Set<string>(admittedHubs);
  let structural = 0;
  for (const expansion of plan.hubs.values()) {
    for (const member of expansion.members) shown.add(member.id);
    structural += expansion.members.length + (expansion.overflow === null ? 0 : 1);
  }

  // Every pair, and whether they come ordered by (total descending, from, to) already.
  let pairs: readonly Pair[] = [];
  let ordered = false;
  if (aborted) ordered = true;
  else if (unfiltered) {
    const table = rollup.pairs();
    if (plan.hubs.size === 0) {
      pairs = table;
      ordered = true;
    } else {
      const moving = table.filter((pair) => movesArrows(plan, pair));
      const regrouped = groupPairs(moving.flatMap((pair) => pair.candidates).map((c) => arrowOf(plan, c)));
      pairs = [...table.filter((pair) => !movesArrows(plan, pair)), ...regrouped];
    }
  } else {
    pairs = groupPairs(candidates.map((c) => (plan.hubs.size === 0 ? { from: c.fromHub, to: c.toHub, candidate: c } : arrowOf(plan, c))));
  }
  const between = pairs.filter((pair) => shown.has(pair.from) && shown.has(pair.to));
  if (!ordered) between.sort(byAdmission);
  const edgeBudget = Math.max(0, limits.maxEdges - structural);
  const admitted = between.slice(0, edgeBudget);
  const notAdmitted = [...pairs.filter((pair) => !shown.has(pair.from) || !shown.has(pair.to)), ...between.slice(edgeBudget)];

  const hidden: Counts = new Map();
  let hiddenEdges = 0;
  for (const pair of notAdmitted) {
    const n = pair.candidates.length;
    hiddenEdges += n;
    if (shown.has(pair.from)) addHidden(hidden, pair.from, 'outgoing', n);
    if (shown.has(pair.to)) addHidden(hidden, pair.to, 'incoming', n);
  }

  const edges: GraphEdge[] = [];
  const bundles: EdgeBundle[] = [];
  for (const [pair, drawn] of materialise(admitted, edgeBudget)) {
    const pairEdges = drawn.map((candidate) => toEdge(candidate, pair.from, pair.to));
    edges.push(...pairEdges);
    if (pair.candidates.length >= 2) {
      bundles.push({ id: `bnd_${hashParts(['bundle', pair.from, pair.to])}`, from: pair.from, to: pair.to, edgeIds: pairEdges.map((e) => e.id).sort(), total: pair.candidates.length });
    }
  }

  const nodes: GraphNode[] = realHubs.filter((ref) => admittedHubs.has(ref.id)).map((ref) => hubNode(ctx, ref, hidden.get(ref.id)));
  if (admittedHubs.has(UNCLASSIFIED_HUB_ID)) nodes.push(unclassifiedNode(hidden.get(UNCLASSIFIED_HUB_ID)));
  for (const expansion of plan.hubs.values()) {
    const parts = expansionParts(ctx, expansion, (id) => hidden.get(id));
    nodes.push(...parts.nodes);
    edges.push(...parts.edges);
  }

  let truncation: Truncation | null = null;
  const counts = { hiddenPairs: notAdmitted.length, hiddenEdges };
  if (hiddenHubs > 0 || plan.unappliedBy === 'max_nodes') truncation = { reason: 'max_nodes', hiddenNodeEstimate: hiddenHubs + plan.unappliedMembers, ...counts };
  else if (notAdmitted.length > 0 || plan.unappliedBy === 'max_edges') truncation = { reason: 'max_edges', hiddenNodeEstimate: plan.unappliedMembers, ...counts };
  else if (aborted) truncation = { reason: 'aborted', hiddenNodeEstimate: 0, ...counts };

  return {
    view: VIEW,
    revision: ctx.indexes.revision,
    key: projectionKey(request, ctx.indexes.revision),
    nodes: sortNodes(nodes),
    edges: sortEdges(edges),
    bundles: bundles.sort((a, b) => compareStrings(a.id, b.id)),
    unanchoredReactionIds: sortedUnique(unanchored),
    truncation,
  };
}

export const navigatorProjection: ProjectionDefinition = {
  view: VIEW,
  description: 'Hubs (navigator anchors) with one labelled arrow per reaction outcome product, bundled per hub pair with full totals; hub expansion shows members; Unclassified and Unanchored are explicit.',
  readsKinds: READS_KINDS,
  build,
};
