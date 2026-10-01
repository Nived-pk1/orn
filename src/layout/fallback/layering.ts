/**
 * Layering for the fallback layout (step 4.4), deterministic and O(V + E):
 *   1. Cycle breaking: an iterative depth-first search that starts its roots in id order and follows each node's edges in target
 *      order; an edge into a node that is still on the DFS stack is a back edge and is REVERSED. What is left is a DAG.
 *   2. Longest-path layering over that DAG in Kahn order (zero-in-degree nodes in id order, FIFO): a node's layer is one more
 *      than the deepest of its predecessors. A node with a `layerHint` is placed exactly on that layer instead (an edge between
 *      two hinted nodes may then point backwards; that is allowed, it is only drawn straight).
 *   3. Layers nobody occupies are squeezed out (the order of layers is kept), so a hint of 7 does not leave six empty columns.
 */
import type { LayoutNodeInput } from '../contracts';
import type { Graph } from './graph';

/** The DAG left after reversing the back edges found by a DFS in id order. Duplicates are possible and harmless. */
export function breakCycles(graph: Graph): number[][] {
  const { n, out } = graph;
  const dag: number[][] = Array.from({ length: n }, () => []);
  const state = new Uint8Array(n); // 0 unseen, 1 on the stack, 2 done
  const next = new Int32Array(n);
  for (let root = 0; root < n; root += 1) {
    if (state[root] !== 0) continue;
    const stack = [root];
    state[root] = 1;
    while (stack.length > 0) {
      const u = stack[stack.length - 1] as number;
      const edges = out[u] as readonly number[];
      if (next[u] === edges.length) {
        state[u] = 2;
        stack.pop();
        continue;
      }
      const v = edges[next[u] as number] as number;
      next[u] = (next[u] as number) + 1;
      if (state[v] === 1) (dag[v] as number[]).push(u); // back edge: reversed
      else {
        (dag[u] as number[]).push(v);
        if (state[v] === 0) {
          state[v] = 1;
          stack.push(v);
        }
      }
    }
  }
  return dag;
}

/** Layer index per node (compressed to 0..k-1) for a DAG, honouring `layerHint` exactly. */
export function layerNodes(dag: readonly (readonly number[])[], nodes: readonly LayoutNodeInput[]): number[] {
  const n = dag.length;
  const indegree = new Int32Array(n);
  for (const targets of dag) for (const v of targets) indegree[v] = (indegree[v] as number) + 1;
  const deepest = new Int32Array(n); // longest path reaching the node from a predecessor, in edges
  const layer = new Array<number>(n).fill(0);
  const queue: number[] = [];
  for (let v = 0; v < n; v += 1) if (indegree[v] === 0) queue.push(v);
  for (let head = 0; head < queue.length; head += 1) {
    const u = queue[head] as number;
    const hint = nodes[u]?.layerHint;
    layer[u] = hint ?? (deepest[u] as number);
    for (const v of dag[u] as readonly number[]) {
      deepest[v] = Math.max(deepest[v] as number, (layer[u] as number) + 1);
      indegree[v] = (indegree[v] as number) - 1;
      if (indegree[v] === 0) queue.push(v);
    }
  }
  const used = [...new Set(layer)].sort((a, b) => a - b);
  const squeezed = new Map(used.map((value, i) => [value, i] as const));
  return layer.map((value) => squeezed.get(value) as number);
}
