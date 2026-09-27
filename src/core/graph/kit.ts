/**
 * Helpers shared by projections: the cache key, ordering, node flags and the drawn-as-node rule.
 * Nothing here knows about a particular view.
 */
import { hashParts } from '../hash';
import type { RecordRef } from '../schema';
import type { GraphEdge, GraphNode, NodeFlag, ProjectionContext, ProjectionRequest } from './contracts';

const byId = <T extends { readonly id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Nodes sorted by ID (projections are byte-identical for the same input, P-10). */
export const sortNodes = (nodes: readonly GraphNode[]): GraphNode[] => [...nodes].sort(byId);
export const sortEdges = (edges: readonly GraphEdge[]): GraphEdge[] => [...edges].sort(byId);

/** Sorted, deduplicated copy. */
export const sortedUnique = <T extends string>(values: Iterable<T>): T[] => [...new Set(values)].sort();

/** Everything in a request that changes the result, in a fixed key order. The AbortSignal never does. */
function requestParts(request: ProjectionRequest): string[] {
  const { filters, limits, expansion } = request;
  return [
    request.view,
    ...request.focus.map((ref) => `${ref.kind}:${ref.id}`),
    '|expanded',
    ...expansion.expanded.map((e) => `${e.nodeId}:${e.direction}`),
    '|collapsed',
    ...expansion.collapsedEdgeIds,
    '|filters',
    filters.examId ?? '',
    filters.examVersionId ?? '',
    `s${filters.scopes.join(',')}`,
    `t${filters.topicIds.join(',')}`,
    `f${filters.reagentFamilies.join(',')}`,
    filters.text ?? '',
    '|limits',
    String(limits.maxDepth),
    String(limits.maxNodes),
    String(limits.maxEdges),
    String(limits.timeBudgetMs),
    '|variant',
    request.conditionVariantId ?? '',
  ];
}

/**
 * Cache key: hash of the request and the index revision. Any commit changes the revision, so the key is
 * conservative: a cache keyed on it never serves a stale view. (Finer, per-dependency keys are a
 * later optimisation; they may only ever make the key change less often when nothing relevant changed.)
 */
export function projectionKey(request: ProjectionRequest, revision: number): string {
  return `prj_${hashParts([...requestParts(request), `rev${revision}`])}`;
}

/** A record is drawn as a node unless its `entity_display` says otherwise (GRAPH_SEMANTICS.md §3; water). */
export const drawnAsNode = (ctx: ProjectionContext, ref: RecordRef): boolean => ctx.indexes.displayOf(ref)?.showAsNode !== 'never';

/** Flags common to any node backed by a real record: caveats, review status, out-of-scope, no structure. */
export function flagsOf(ctx: ProjectionContext, ref: RecordRef): NodeFlag[] {
  const flags: NodeFlag[] = [];
  const record = ctx.indexes.get(ref.id);
  if (ctx.indexes.caveatsFor(ref).length > 0) flags.push('has_caveat');
  if ((record as { review?: { status?: string } } | undefined)?.review?.status === 'review_required') flags.push('review_required');
  if (ctx.scopeOf(ref) === 'outside') flags.push('outside_scope');
  if (record?.kind === 'species' && record.structure === undefined) flags.push('no_structure');
  return flags;
}
