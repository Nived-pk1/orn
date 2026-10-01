/**
 * ELK's radial layout accepts only a TREE (it throws "The given graph is not a tree!" otherwise, measured on elkjs 0.12.0), and
 * a forest or isolated nodes come out overlapping. So the adapter gives it a spanning tree of the request and routes everything
 * else itself (step 4.4): per connected component a breadth-first spanning tree (neighbours in id order, edges directed parent to
 * child); the root is the node with the lowest `layerHint` (a focus node), else the most connected one, ties by id. Components
 * are joined under ONE virtual centre node of size 0, which the result drops. Edges not in a tree (parallel edges, self-loops,
 * cross edges) are not given to ELK; the adapter draws them straight and says so in `notes`.
 */
import type { LayoutRequest } from '../contracts';
import { buildGraph } from '../fallback/graph';

export interface RadialPlan {
  /** Tree edges as (request edge id, parent node id, child node id). */
  readonly tree: readonly { readonly edgeId: string; readonly parent: string; readonly child: string }[];
  /** Roots of the components, in id order; joined under the virtual node when there is more than one. */
  readonly roots: readonly string[];
  readonly nonTreeEdgeIds: readonly string[];
}

export function radialPlan(request: LayoutRequest): RadialPlan {
  const graph = buildGraph(request);
  const { n, ids, adj } = graph;
  // the first request edge (by id) that joins a pair, either direction
  const edgeOf = new Map<number, string>();
  for (const edge of request.edges) {
    const a = graph.indexOf.get(edge.from) as number;
    const b = graph.indexOf.get(edge.to) as number;
    if (a === b) continue;
    const key = Math.min(a, b) * n + Math.max(a, b);
    if (!edgeOf.has(key)) edgeOf.set(key, edge.id);
  }
  const component = new Int32Array(n).fill(-1);
  const members: number[][] = [];
  for (let start = 0; start < n; start += 1) {
    if (component[start] !== -1) continue;
    const found = [start];
    component[start] = members.length;
    for (let head = 0; head < found.length; head += 1) {
      for (const w of adj[found[head] as number] as readonly number[]) {
        if (component[w] === -1) {
          component[w] = members.length;
          found.push(w);
        }
      }
    }
    members.push(found);
  }
  const hintOf = (v: number): number => request.nodes[v]?.layerHint ?? Number.POSITIVE_INFINITY;
  const roots = members.map((found) => [...found].sort((a, b) => hintOf(a) - hintOf(b) || (adj[b] as readonly number[]).length - (adj[a] as readonly number[]).length || a - b)[0] as number);
  const tree: { edgeId: string; parent: string; child: string }[] = [];
  const used = new Set<string>();
  const seen = new Uint8Array(n);
  for (const root of roots) {
    seen[root] = 1;
    const queue = [root];
    for (let head = 0; head < queue.length; head += 1) {
      const u = queue[head] as number;
      for (const w of adj[u] as readonly number[]) {
        if (seen[w] === 1) continue;
        seen[w] = 1;
        queue.push(w);
        const edgeId = edgeOf.get(Math.min(u, w) * n + Math.max(u, w)) as string;
        used.add(edgeId);
        tree.push({ edgeId, parent: ids[u] as string, child: ids[w] as string });
      }
    }
  }
  return {
    tree,
    roots: roots.map((v) => ids[v] as string).sort(),
    nonTreeEdgeIds: request.edges.filter((edge) => !used.has(edge.id)).map((edge) => edge.id),
  };
}
