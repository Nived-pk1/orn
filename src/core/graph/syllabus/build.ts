/**
 * Syllabus projection (docs/GRAPH_SEMANTICS.md §7): the version-independent topic tree plus the records
 * mapped to each topic (ADV-057: a cross-chapter record is mapped directly to more than one topic, so it
 * appears once under each — never merged, never picked). Scope is the closure of ancestors + descendants
 * of the focused topic(s) (or of every root topic, with no focus) — computed once via the hierarchy index,
 * never a bidirectional walk: climbing to an ancestor must never re-expand that ancestor's *other*
 * children, or every query would silently become "the whole tree" (caught by the projection harness the
 * first time this view ran: two membership edges for one cross-mapped reaction collided under INV-26,
 * because climbing up from either topic and back down reached the other topic's mapping too).
 *
 * Records mapped to a topic are `recordsInTopic(topicId, { transitive: false })` — a record shows under
 * its own topic only; rolling up through a descendant is the tree's job, not double-counted. A membership
 * edge never carries `reactionId`: it is a classification, not a participation or production, so INV-26
 * (endpoint-independent by design for real participations/productions) does not apply to it — the reaction
 * is still recoverable from `edge.from`. "Derived scope badges" reuse the shared `outside_scope` node flag
 * (`flagsOf`, already backed by `ctx.scopeOf`). A mapped record is a dead end, same as every other view.
 * Bounded like `navigator`: candidates are computed, then a sorted prefix is admitted (INV-22).
 */
import type { RecordRef, Topic } from '../../schema';
import type { GraphEdge, GraphNode, Projection, ProjectionContext, ProjectionDefinition, ProjectionRequest, Truncation } from '../contracts';
import { graphEdgeId } from '../ids';
import { bundleEdges, flagsOf, projectionKey, sortEdges, sortNodes } from '../kit';

const VIEW = 'syllabus' as const;
const NODE_KIND: Readonly<Record<string, GraphNode['kind']>> = {
  topic: 'topic',
  species: 'species',
  class: 'class',
  reagent: 'reagent',
  reaction: 'reaction',
  concept: 'concept',
  named_reaction: 'named_reaction',
  mechanism: 'mechanism',
};

function membershipEdge(from: string, to: string): GraphEdge {
  const identity = { view: VIEW, from, to, semantic: 'membership' as const };
  return { id: graphEdgeId(identity), from, to, semantic: 'membership', conditionVariantIds: [], inferred: false, layoutDirection: 'forward' };
}

/** Root topics (no `parentId`), used as seeds when the request names none. Bounded: topics are a small, curated table. */
function rootTopicIds(ctx: ProjectionContext): string[] {
  return Object.values(ctx.state.records.topic)
    .filter((t) => t.parentId === undefined)
    .map((t) => t.id)
    .sort();
}

/** Ancestors + descendants of every seed, plus the seeds themselves — never a step further sideways. */
function topicClosure(ctx: ProjectionContext, seeds: readonly string[]): Set<string> {
  const closure = new Set<string>(seeds);
  for (const id of seeds) {
    for (const a of ctx.indexes.ancestorsOf('topic', id)) closure.add(a);
    for (const d of ctx.indexes.descendantsOf('topic', id)) closure.add(d);
  }
  return closure;
}

function candidateEdges(ctx: ProjectionContext, closure: ReadonlySet<string>): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const topicId of closure) {
    const topic = ctx.indexes.get(topicId) as Topic | undefined;
    if (topic?.kind !== 'topic') continue;
    if (topic.parentId !== undefined && closure.has(topic.parentId)) edges.push(membershipEdge(topicId, topic.parentId));
    for (const record of ctx.indexes.recordsInTopic(topic.id, { transitive: false })) edges.push(membershipEdge(record.id, topicId));
  }
  return edges;
}

/** Hop count from the nearest seed, over the admitted edges treated as undirected (topic tree + attachments). */
function computeDepths(seeds: readonly string[], admitted: ReadonlySet<string>, edges: readonly GraphEdge[]): Map<string, number> {
  const adjacency = new Map<string, string[]>();
  const link = (a: string, b: string): void => {
    const list = adjacency.get(a);
    if (list === undefined) adjacency.set(a, [b]);
    else list.push(b);
  };
  for (const e of edges) {
    link(e.from, e.to);
    link(e.to, e.from);
  }
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const s of seeds) {
    if (admitted.has(s) && !depth.has(s)) {
      depth.set(s, 0);
      queue.push(s);
    }
  }
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i] as string;
    const d = depth.get(id) as number;
    for (const next of adjacency.get(id) ?? []) {
      if (!depth.has(next)) {
        depth.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  return depth;
}

function build(ctx: ProjectionContext, request: ProjectionRequest): Projection {
  const { limits } = request;
  const focused = request.focus.filter((ref) => ctx.indexes.get(ref.id)?.kind === 'topic').map((ref) => ref.id);
  const seeds = focused.length > 0 ? focused : rootTopicIds(ctx);
  const focusIds = new Set(focused);

  const closure = topicClosure(ctx, seeds);
  const candidates = candidateEdges(ctx, closure);
  const candidateNodeIds = [...new Set([...closure, ...candidates.flatMap((e) => [e.from, e.to])])].sort();

  const admittedNodes = new Set(candidateNodeIds.slice(0, limits.maxNodes));
  const hiddenNodes = candidateNodeIds.length - admittedNodes.size;

  const sortedCandidateEdges = [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const admittedEdges: GraphEdge[] = [];
  let hiddenEdges = 0;
  for (const edge of sortedCandidateEdges) {
    if (!admittedNodes.has(edge.from) || !admittedNodes.has(edge.to)) continue;
    if (admittedEdges.length < limits.maxEdges) admittedEdges.push(edge);
    else hiddenEdges += 1;
  }

  const depths = computeDepths(seeds, admittedNodes, admittedEdges);
  const nodes: GraphNode[] = [...admittedNodes].flatMap((id): GraphNode[] => {
    const record = ctx.indexes.get(id);
    const kind = record === undefined ? undefined : NODE_KIND[record.kind];
    if (record === undefined || kind === undefined) return [];
    const ref: RecordRef = { kind: record.kind, id: record.id };
    return [{ id, kind, record: ref, role: focusIds.has(id) ? 'focus' : 'member', depth: depths.get(id) ?? 0, hidden: { outgoing: 0, incoming: 0 }, flags: flagsOf(ctx, ref) }];
  });

  let truncation: Truncation | null = null;
  if (hiddenNodes > 0) truncation = { reason: 'max_nodes', hiddenNodeEstimate: hiddenNodes };
  else if (hiddenEdges > 0) truncation = { reason: 'max_edges', hiddenNodeEstimate: 0 };

  return {
    view: VIEW,
    revision: ctx.indexes.revision,
    key: projectionKey(request, ctx.indexes.revision),
    nodes: sortNodes(nodes),
    edges: sortEdges(admittedEdges),
    bundles: bundleEdges(admittedEdges),
    unanchoredReactionIds: [],
    truncation,
  };
}

export const syllabusProjection: ProjectionDefinition = {
  view: VIEW,
  description: 'The topic tree (ancestors + descendants of the focus) plus records mapped directly to each topic; a cross-chapter record appears once under every topic it maps to.',
  build,
};
