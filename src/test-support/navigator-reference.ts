/**
 * Reference implementation of the navigator projection (docs/IMPLEMENTATION_PLAN.md §2 steps 2.9 and 5.4c):
 * an independent FULL SCAN of every reaction in the state with hub resolution computed from scratch, no
 * roll-up index and no code of `src/core/graph/navigator/{pairs,expansion,nodes,build}.ts`. It states the
 * step 5.4c semantics (per-pair overview, full totals, hub expansion, exact hidden counts) in the most direct
 * way, so the differential test (`tests/property/navigator-differential.test.ts`) can compare the index-backed
 * build with it. Test-only; never imported by production code (`no-test-code-in-production`).
 */
import { graphEdgeId } from '@/core/graph/ids';
import { flagsOf, projectionKey, sortEdges, sortNodes, sortedUnique } from '@/core/graph/kit';
import { DEFAULT_DEGREE_CAP } from '@/core/graph/contracts';
import type { EdgeBundle, GraphEdge, GraphNode, NodeReactionCounts, Projection, ProjectionContext, ProjectionRequest, Truncation } from '@/core/graph/contracts';
import { UNCLASSIFIED_HUB_ID } from '@/core/graph/navigator/hubs';
import { arrangementsOf } from '@/core/graph/navigator/nodes';
import { mainProducts, primarySubstrate, reactionFilter } from '@/core/graph/navigator/select';
import { hashParts } from '@/core/hash';
import { HubResolver, hubTargets, type HubBasis } from '@/core/indexes/navigator-rollup';
import type { Outcome, Participant, Product, Reaction, ReactionId, RecordRef } from '@/core/schema';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';

const VIEW = 'navigator' as const;
const KIND_OF: Readonly<Record<string, GraphNode['kind']>> = { species: 'species', class: 'class', reagent: 'reagent', concept: 'concept', named_reaction: 'named_reaction' };
const SELECTIVITY_ORDER = ['exclusive', 'major', 'mixture_component', 'unspecified', 'minor', 'trace'];

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function toHubBasis(indexes: ReadonlyIndexes): HubBasis {
  return { anchors: indexes.anchors(), get: (id) => indexes.get(id), displayOf: (ref) => indexes.displayOf(ref) };
}

interface Arrow {
  readonly reaction: Reaction;
  readonly outcomeId: Outcome['id'];
  readonly productId: Product['id'];
  readonly participantId: Participant['id'];
  readonly selectivity: Outcome['selectivity'];
  readonly variants: GraphEdge['conditionVariantIds'];
  readonly inferred: boolean;
  readonly fromHub: string;
  readonly toHub: string;
  readonly substrate: RecordRef;
  readonly product: RecordRef;
}

const rankOf = (a: Arrow): number => {
  const at = SELECTIVITY_ORDER.indexOf(a.selectivity);
  return at < 0 ? SELECTIVITY_ORDER.length : at;
};
const byRank = (a: Arrow, b: Arrow): number =>
  rankOf(a) - rankOf(b) || cmp(a.reaction.id, b.reaction.id) || cmp(a.outcomeId, b.outcomeId) || cmp(a.productId, b.productId);

interface Pair {
  from: string;
  to: string;
  arrows: Arrow[];
}

export function navigatorReferenceBuild(ctx: ProjectionContext, request: ProjectionRequest): Projection {
  const { limits } = request;
  const targets = hubTargets(toHubBasis(ctx.indexes));
  const resolver = new HubResolver(toHubBasis(ctx.indexes), targets);
  const passes = reactionFilter(ctx, request.filters);

  // 1. Scan every reaction.
  const arrows: Arrow[] = [];
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
    let reached = false;
    if (substrate !== undefined) {
      const from = resolver.resolve(substrate.ref);
      for (const { outcome, product } of mainProducts(ctx, reaction)) {
        const to = resolver.resolve(product.ref);
        arrows.push({
          reaction, outcomeId: outcome.id, productId: product.id, participantId: substrate.id, selectivity: outcome.selectivity,
          variants: outcome.conditionVariantIds, inferred: from.inferred || to.inferred, fromHub: from.hubId, toHub: to.hubId,
          substrate: substrate.ref, product: product.ref,
        });
        reached ||= from.hub !== null || to.hub !== null;
      }
    }
    if (!reached) unanchored.push(reaction.id);
  }

  // 2. Hubs.
  const needsUnclassified = arrows.some((a) => a.fromHub === UNCLASSIFIED_HUB_ID || a.toHub === UNCLASSIFIED_HUB_ID);
  const realHubs = [...targets.values()].sort((a, b) => cmp(a.id, b.id));
  const slots = Math.max(0, limits.maxNodes - (needsUnclassified ? 1 : 0));
  const hubIds = new Set<string>(realHubs.slice(0, slots).map((ref) => ref.id));
  if (needsUnclassified && limits.maxNodes > 0) hubIds.add(UNCLASSIFIED_HUB_ID);
  const hiddenHubs = realHubs.length - Math.min(realHubs.length, slots);

  // 3. Expansion, hub by hub in ID order, until the node or the edge budget would be exceeded.
  const wanted = new Map<string, Set<'out' | 'in'>>();
  for (const entry of request.expansion.expanded) {
    if (!hubIds.has(entry.nodeId)) continue;
    const set = wanted.get(entry.nodeId) ?? new Set<'out' | 'in'>();
    if (entry.direction === 'out' || entry.direction === 'both') set.add('out');
    if (entry.direction === 'in' || entry.direction === 'both') set.add('in');
    wanted.set(entry.nodeId, set);
  }
  const shownOut = new Map<string, Set<string>>();
  const shownIn = new Map<string, Set<string>>();
  const memberRefs = new Map<string, RecordRef>();
  const overflowOf = new Map<string, { members: number; outgoing: number; incoming: number }>();
  const membersOf = new Map<string, string[]>();
  let nodesLeft = limits.maxNodes - hubIds.size;
  let edgesLeft = limits.maxEdges;
  let structural = 0;
  let unappliedMembers = 0;
  let unappliedBy: 'max_nodes' | 'max_edges' | null = null;
  for (const hub of [...wanted.keys()].sort()) {
    const sides = wanted.get(hub) as Set<'out' | 'in'>;
    const count = (side: 'out' | 'in'): [string, number, RecordRef][] => {
      const counts = new Map<string, [number, RecordRef]>();
      if (!sides.has(side)) return [];
      for (const a of arrows) {
        const own = side === 'out' ? a.fromHub : a.toHub;
        const ref = side === 'out' ? a.substrate : a.product;
        if (own !== hub || ref.id === hub) continue;
        counts.set(ref.id, [(counts.get(ref.id)?.[0] ?? 0) + 1, ref]);
      }
      return [...counts].map(([id, [n, ref]]): [string, number, RecordRef] => [id, n, ref]).sort((x, y) => y[1] - x[1] || cmp(x[0], y[0]));
    };
    const out = count('out');
    const inn = count('in');
    const keepOut = out.slice(0, DEFAULT_DEGREE_CAP);
    const keepIn = inn.slice(0, DEFAULT_DEGREE_CAP);
    const shown = new Set([...keepOut, ...keepIn].map((m) => m[0]));
    const left = new Set([...out.slice(DEFAULT_DEGREE_CAP), ...inn.slice(DEFAULT_DEGREE_CAP)].map((m) => m[0]));
    const cost = shown.size + (left.size > 0 ? 1 : 0);
    if (cost === 0) continue;
    if (unappliedBy !== null || cost > nodesLeft || cost > edgesLeft) {
      if (unappliedBy === null) unappliedBy = cost > nodesLeft ? 'max_nodes' : 'max_edges';
      unappliedMembers += new Set([...out, ...inn].map((m) => m[0])).size;
      continue;
    }
    nodesLeft -= cost;
    edgesLeft -= cost;
    structural += cost;
    shownOut.set(hub, new Set(keepOut.map((m) => m[0])));
    shownIn.set(hub, new Set(keepIn.map((m) => m[0])));
    for (const m of [...keepOut, ...keepIn]) memberRefs.set(m[0], m[2]);
    membersOf.set(hub, [...shown].sort());
    if (left.size > 0) {
      overflowOf.set(hub, {
        members: left.size,
        outgoing: out.slice(DEFAULT_DEGREE_CAP).reduce((s, m) => s + m[1], 0),
        incoming: inn.slice(DEFAULT_DEGREE_CAP).reduce((s, m) => s + m[1], 0),
      });
    }
  }
  const shownNodes = new Set<string>([...hubIds, ...memberRefs.keys()]);

  // 4. Pairs: where each arrow is drawn, how many arrows a pair has.
  const pairs = new Map<string, Pair>();
  for (const a of arrows) {
    const from = shownOut.get(a.fromHub)?.has(a.substrate.id) === true ? a.substrate.id : a.fromHub;
    const to = shownIn.get(a.toHub)?.has(a.product.id) === true ? a.product.id : a.toHub;
    const key = JSON.stringify([from, to]);
    const pair = pairs.get(key) ?? { from, to, arrows: [] };
    pair.arrows.push(a);
    pairs.set(key, pair);
  }
  const allPairs = [...pairs.values()];
  const between = allPairs.filter((p) => shownNodes.has(p.from) && shownNodes.has(p.to));
  between.sort((a, b) => b.arrows.length - a.arrows.length || cmp(a.from, b.from) || cmp(a.to, b.to));
  const budget = Math.max(0, limits.maxEdges - structural);
  const admitted = between.slice(0, budget);
  // 7.3a C3, stated again here on its own: in one set of reactions an example whose general (generic) reaction is also in the set is folded
  const cardsOf = (ids: Iterable<string>): { cards: number; folded: number } => {
    const set = new Set(ids);
    let folded = 0;
    for (const id of set) {
      const general = ctx.state.records.reaction[id as ReactionId]?.instanceOfId;
      if (general !== undefined && set.has(general) && ctx.state.records.reaction[general]?.scope === 'generic') folded += 1;
    }
    return { cards: set.size - folded, folded };
  };
  const rest = allPairs.filter((p) => !admitted.includes(p));

  // 5. Which arrows of an admitted pair are drawn.
  const ranked = new Map<Pair, Arrow[]>(admitted.map((p) => [p, [...p.arrows].sort(byRank)]));
  const taken = new Map<Pair, number>(admitted.map((p) => [p, 1]));
  let spare = budget - admitted.length;
  const smallestFirst = [...admitted].sort((a, b) => a.arrows.length - b.arrows.length || cmp(a.from, b.from) || cmp(a.to, b.to));
  for (const p of smallestFirst) {
    for (let i = 1; i < Math.min(p.arrows.length, DEFAULT_DEGREE_CAP) && spare > 0; i += 1) {
      taken.set(p, (taken.get(p) ?? 0) + 1);
      spare -= 1;
    }
  }

  // 6. Assemble.
  const hidden = new Map<string, { outgoing: number; incoming: number }>();
  const bump = (id: string, key: 'outgoing' | 'incoming', n: number): void => {
    const entry = hidden.get(id) ?? { outgoing: 0, incoming: 0 };
    entry[key] += n;
    hidden.set(id, entry);
  };
  for (const p of rest) {
    if (shownNodes.has(p.from)) bump(p.from, 'outgoing', p.arrows.length);
    if (shownNodes.has(p.to)) bump(p.to, 'incoming', p.arrows.length);
  }
  const edges: GraphEdge[] = [];
  const bundles: EdgeBundle[] = [];
  for (const p of admitted) {
    const drawn = (ranked.get(p) as Arrow[]).slice(0, taken.get(p));
    const ids: string[] = [];
    for (const a of drawn) {
      const identity = { view: VIEW, from: p.from, to: p.to, semantic: 'transforms_to', reactionId: a.reaction.id, outcomeId: a.outcomeId, productId: a.productId, participantId: a.participantId } as const;
      const id = graphEdgeId(identity);
      ids.push(id);
      edges.push({
        id, from: p.from, to: p.to, semantic: 'transforms_to', reactionId: a.reaction.id, outcomeId: a.outcomeId,
        productId: a.productId, participantId: a.participantId,
        selectivity: a.selectivity, conditionVariantIds: a.variants, inferred: a.inferred, layoutDirection: 'forward',
      });
    }
    if (p.arrows.length >= 2) bundles.push({ id: `bnd_${hashParts(['bundle', p.from, p.to])}`, from: p.from, to: p.to, edgeIds: ids.sort(), total: p.arrows.length, reactions: cardsOf(p.arrows.map((a) => a.reaction.id)).cards, ...(cardsOf(p.arrows.map((a) => a.reaction.id)).folded === 0 ? {} : { examples: cardsOf(p.arrows.map((a) => a.reaction.id)).folded }) });
  }

  // Step 7.2a: per node, the DISTINCT reactions of the drawn pairs that leave it, enter it and loop on it (stated again here, from the arrows).
  const leaving = new Map<string, Set<string>>();
  const entering = new Map<string, Set<string>>();
  const looping = new Map<string, Set<string>>();
  const into = (map: Map<string, Set<string>>, id: string): Set<string> => map.get(id) ?? map.set(id, new Set()).get(id) as Set<string>;
  for (const p of admitted) {
    for (const a of p.arrows) {
      if (p.from === p.to) into(looping, p.from).add(a.reaction.id);
      else {
        into(leaving, p.from).add(a.reaction.id);
        into(entering, p.to).add(a.reaction.id);
      }
    }
  }
  const countsOf = (id: string): { reactionCounts: NodeReactionCounts } | Record<string, never> => {
    if (!leaving.has(id) && !entering.has(id) && !looping.has(id)) return {};
    const out = leaving.get(id) ?? new Set<string>();
    const inn = entering.get(id) ?? new Set<string>();
    const loops = looping.get(id) ?? new Set<string>();
    const [o, i, l, oa, ia] = [cardsOf(out), cardsOf(inn), cardsOf(loops), cardsOf(new Set([...out, ...loops])), cardsOf(new Set([...inn, ...loops]))];
    const any = o.folded + i.folded + l.folded + oa.folded + ia.folded > 0;
    return { reactionCounts: { out: o.cards, in: i.cards, loops: l.cards, outAll: oa.cards, inAll: ia.cards, ...(any ? { outExamples: o.folded, inExamples: i.folded, loopExamples: l.folded } : {}) } };
  };

  // The arrangement (step 5.5c) is presentation, not hub resolution: the reference takes it from the same pure reading of the anchors.
  const arrangements = arrangementsOf(ctx);
  const nodes: GraphNode[] = realHubs
    .filter((ref) => hubIds.has(ref.id))
    .map((ref): GraphNode => ({ id: ref.id, kind: KIND_OF[ref.kind] ?? 'virtual', record: ref, role: 'anchor', depth: 0, hidden: hidden.get(ref.id) ?? { outgoing: 0, incoming: 0 }, flags: flagsOf(ctx, ref), ...(arrangements.has(ref.id) ? { arrangement: arrangements.get(ref.id) } : {}), ...countsOf(ref.id) }));
  if (hubIds.has(UNCLASSIFIED_HUB_ID)) {
    nodes.push({ id: UNCLASSIFIED_HUB_ID, kind: 'virtual', role: 'unclassified', depth: 0, hidden: hidden.get(UNCLASSIFIED_HUB_ID) ?? { outgoing: 0, incoming: 0 }, flags: ['unanchored'], ...countsOf(UNCLASSIFIED_HUB_ID) });
  }
  for (const [hub, ids] of membersOf) {
    for (const id of ids) {
      const ref = memberRefs.get(id) as RecordRef;
      nodes.push({ id, kind: KIND_OF[ref.kind] ?? 'virtual', record: ref, role: 'member', depth: 1, hidden: hidden.get(id) ?? { outgoing: 0, incoming: 0 }, flags: flagsOf(ctx, ref), ...countsOf(id) });
      edges.push({ id: graphEdgeId({ view: VIEW, from: id, to: hub, semantic: 'membership' }), from: id, to: hub, semantic: 'membership', conditionVariantIds: [], inferred: hub !== UNCLASSIFIED_HUB_ID, layoutDirection: 'forward' });
    }
    const overflow = overflowOf.get(hub);
    if (overflow !== undefined) {
      const id = `virtual:overflow:${hub}`;
      nodes.push({ id, kind: 'virtual', role: 'overflow', depth: 1, hidden: { outgoing: overflow.outgoing, incoming: overflow.incoming }, hiddenMembers: overflow.members, flags: [] });
      edges.push({ id: graphEdgeId({ view: VIEW, from: id, to: hub, semantic: 'overflow' }), from: id, to: hub, semantic: 'overflow', conditionVariantIds: [], inferred: false, layoutDirection: 'forward' });
    }
  }

  const hiddenEdges = rest.reduce((sum, p) => sum + p.arrows.length, 0);
  const extra = { hiddenPairs: rest.length, hiddenEdges };
  let truncation: Truncation | null = null;
  if (hiddenHubs > 0 || unappliedBy === 'max_nodes') truncation = { reason: 'max_nodes', hiddenNodeEstimate: hiddenHubs + unappliedMembers, ...extra };
  else if (rest.length > 0 || unappliedBy === 'max_edges') truncation = { reason: 'max_edges', hiddenNodeEstimate: unappliedMembers, ...extra };
  else if (aborted) truncation = { reason: 'aborted', hiddenNodeEstimate: 0, ...extra };

  return {
    view: VIEW,
    revision: ctx.indexes.revision,
    key: projectionKey(request, ctx.indexes.revision),
    nodes: sortNodes(nodes),
    edges: sortEdges(edges),
    bundles: bundles.sort((a, b) => cmp(a.id, b.id)),
    unanchoredReactionIds: sortedUnique(unanchored),
    truncation,
  };
}
