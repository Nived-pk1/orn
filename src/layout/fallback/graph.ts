/**
 * The graph the fallback layout works on (step 4.4): nodes numbered in id order (the request is sorted, so the numbering is the
 * input order), directed edges as unique (from, to) pairs without self-loops (parallel edges and loops do not change layering or
 * ordering; they are routed afterwards), and the undirected neighbours. Every list is sorted ascending, so every walk is
 * deterministic. O(V + E log E).
 */
import type { LayoutRequest } from '../contracts';

export interface Graph {
  readonly n: number;
  /** Node ids, in request (= id) order; the index in this list is the node's number everywhere below. */
  readonly ids: readonly string[];
  readonly indexOf: ReadonlyMap<string, number>;
  /** Directed neighbours, unique, sorted, no self-loops. */
  readonly out: readonly (readonly number[])[];
  /** Undirected neighbours, unique, sorted, no self-loops. */
  readonly adj: readonly (readonly number[])[];
}

export function buildGraph(request: LayoutRequest): Graph {
  const n = request.nodes.length;
  const ids = request.nodes.map((node) => node.id);
  const indexOf = new Map(ids.map((id, i) => [id, i] as const));
  const out: number[][] = Array.from({ length: n }, () => []);
  const adj: number[][] = Array.from({ length: n }, () => []);
  const seen = new Set<number>();
  for (const edge of request.edges) {
    const from = indexOf.get(edge.from);
    const to = indexOf.get(edge.to);
    if (from === undefined || to === undefined || from === to) continue;
    const key = from * n + to;
    if (seen.has(key)) continue;
    seen.add(key);
    (out[from] as number[]).push(to);
    if (!seen.has(to * n + from)) {
      (adj[from] as number[]).push(to);
      (adj[to] as number[]).push(from);
    }
  }
  for (const list of out) list.sort((a, b) => a - b);
  for (const list of adj) list.sort((a, b) => a - b);
  return { n, ids, indexOf, out, adj };
}
