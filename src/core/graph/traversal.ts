/**
 * Bounded breadth-first traversal primitive (docs/GRAPH_SEMANTICS.md §9, INV-22).
 *
 * Iterative (no recursion), bounded by depth / nodes / edges / time / AbortSignal, deterministic (neighbours
 * are visited in (target, edge ID) order) and cycle-safe (a node is expanded once per direction). Parallel
 * edges are all kept (INV-26); cycles and self-loops produce edges but never revisit a node.
 * When any limit is hit the result carries a `Truncation`; nothing is ever cut silently.
 */
import type { Truncation, TraversalLimits } from './contracts';

export type TraversalDirection = 'out' | 'in';

/** One edge as seen from the node being expanded. `to` is the node on the other end. */
export interface Step {
  readonly edgeId: string;
  readonly to: string;
  /** Opaque payload for the caller (e.g. the edge record). */
  readonly data?: unknown;
}

export interface TraversalOptions {
  readonly seeds: readonly string[];
  /** Which way to expand: 'both' calls `neighbours` once per direction for each node. */
  readonly direction: TraversalDirection | 'both';
  /** Edges leaving (`out`) or entering (`in`) a node. Must be pure; the traversal sorts the result. */
  neighbours(nodeId: string, direction: TraversalDirection): Iterable<Step>;
  readonly limits: TraversalLimits;
  /** Injected clock in ms (core never reads the wall clock). Without it `timeBudgetMs` is not enforced. */
  readonly now?: () => number;
}

export interface VisitedNode {
  readonly id: string;
  /** Hops from the nearest seed. */
  readonly depth: number;
  /** Neighbours seen from this node but not admitted (limits), per direction. */
  readonly hidden: { readonly outgoing: number; readonly incoming: number };
}

export interface TraversedEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly direction: TraversalDirection;
  readonly data?: unknown;
}

export interface TraversalResult {
  /** In discovery order (breadth first, seeds first in the order given, duplicates removed). */
  readonly nodes: readonly VisitedNode[];
  readonly edges: readonly TraversedEdge[];
  /** Null only when the whole reachable region was returned. `hiddenNodeEstimate` is a lower bound. */
  readonly truncation: Truncation | null;
}

type Reason = Truncation['reason'];

const compareSteps = (a: Step, b: Step): number =>
  a.to < b.to ? -1 : a.to > b.to ? 1 : a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0;

export function traverse(options: TraversalOptions): TraversalResult {
  const { limits, now } = options;
  const startedAt = now?.();
  const directions: readonly TraversalDirection[] = options.direction === 'both' ? ['out', 'in'] : [options.direction];

  const depthOf = new Map<string, number>();
  const order: string[] = [];
  const hidden = new Map<string, { outgoing: number; incoming: number }>();
  const seenEdges = new Set<string>();
  const edges: TraversedEdge[] = [];
  const rejected = new Set<string>();
  let reason: Reason | null = null;
  const stop = (why: Reason): void => {
    reason ??= why;
  };

  const admit = (id: string, depth: number): boolean => {
    if (depthOf.has(id)) return true;
    if (order.length >= limits.maxNodes) {
      stop('max_nodes');
      return false;
    }
    depthOf.set(id, depth);
    order.push(id);
    hidden.set(id, { outgoing: 0, incoming: 0 });
    return true;
  };

  for (const seed of options.seeds) admit(seed, 0);

  const outOfBudget = (): boolean => {
    if (limits.signal?.aborted) {
      stop('aborted');
      return true;
    }
    if (now !== undefined && startedAt !== undefined && now() - startedAt > limits.timeBudgetMs) {
      stop('time_budget');
      return true;
    }
    return false;
  };

  for (let head = 0; head < order.length; head += 1) {
    if (outOfBudget()) break;
    const id = order[head] as string;
    const depth = depthOf.get(id) as number;
    const counts = hidden.get(id) as { outgoing: number; incoming: number };
    for (const direction of directions) {
      const steps = [...options.neighbours(id, direction)].sort(compareSteps);
      for (const step of steps) {
        if (seenEdges.has(step.edgeId)) continue;
        // An edge to a node already in the result closes a cycle: it needs only edge budget, not depth.
        const known = depthOf.has(step.to);
        const reveal = edges.length < limits.maxEdges && (known || (depth < limits.maxDepth && admit(step.to, depth + 1)));
        if (reveal) {
          seenEdges.add(step.edgeId);
          const [from, to] = direction === 'out' ? [id, step.to] : [step.to, id];
          edges.push({ id: step.edgeId, from, to, direction, ...(step.data === undefined ? {} : { data: step.data }) });
          continue;
        }
        if (edges.length >= limits.maxEdges) stop('max_edges');
        else if (depth >= limits.maxDepth) stop('max_depth');
        if (!depthOf.has(step.to)) rejected.add(step.to);
        if (direction === 'out') counts.outgoing += 1;
        else counts.incoming += 1;
      }
    }
  }

  const nodes = order.map((id): VisitedNode => ({ id, depth: depthOf.get(id) as number, hidden: hidden.get(id) as VisitedNode['hidden'] }));
  return {
    nodes,
    edges,
    truncation: reason === null ? null : { reason, hiddenNodeEstimate: rejected.size },
  };
}
