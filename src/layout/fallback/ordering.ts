/**
 * Ordering inside the layers for the fallback layout (step 4.4): barycentric sweeps, a FIXED number of them (`SWEEPS` = 8, four
 * downward and four upward, alternating, starting downward). One sweep visits every node once and every adjacency once to compute
 * the barycentres (O(V + E)); sorting a layer adds O(m log m) for m nodes in it, so a sweep is O(V + E + V log V) in all, bounded
 * by the request caps. A node's barycentre is the mean position of its neighbours in the adjacent layer in the direction of the
 * sweep; a node with no such neighbour keeps its current position. Ties keep the current order (a stable sort), so the result is
 * a pure function of the input. `orderHint`: after every sort the nodes that carry a hint are put back into the slots that hinted
 * nodes occupy, in (orderHint, id) order, so among hinted nodes of one layer the hint always decides; the others move around them.
 */
import type { LayoutNodeInput } from '../contracts';
import type { Graph } from './graph';

export const SWEEPS = 8;

export function orderLayers(graph: Graph, layer: readonly number[], nodes: readonly LayoutNodeInput[]): number[][] {
  const { n, adj } = graph;
  const count = n === 0 ? 0 : Math.max(...layer) + 1;
  const layers: number[][] = Array.from({ length: count }, () => []);
  for (let v = 0; v < n; v += 1) (layers[layer[v] as number] as number[]).push(v);
  const position = new Float64Array(n);
  const refresh = (members: readonly number[]): void => members.forEach((v, i) => void (position[v] = i));
  const hinted = (v: number): boolean => nodes[v]?.orderHint !== undefined;
  const byHint = (a: number, b: number): number => (nodes[a]?.orderHint as number) - (nodes[b]?.orderHint as number) || a - b;

  const settleHints = (members: number[]): void => {
    const slots: number[] = [];
    members.forEach((v, i) => hinted(v) && slots.push(i));
    if (slots.length < 2) return;
    const ordered = slots.map((i) => members[i] as number).sort(byHint);
    slots.forEach((slot, i) => void (members[slot] = ordered[i] as number));
  };

  for (const members of layers) {
    settleHints(members);
    refresh(members);
  }
  for (let sweep = 0; sweep < SWEEPS; sweep += 1) {
    const downward = sweep % 2 === 0;
    const from = downward ? 1 : count - 2;
    const step = downward ? 1 : -1;
    for (let l = from; l >= 0 && l < count; l += step) {
      const members = layers[l] as number[];
      const reference = l - step; // the layer the barycentres are taken from
      const keyed = members.map((v) => {
        let sum = 0;
        let seen = 0;
        for (const w of adj[v] as readonly number[]) {
          if (layer[w] === reference) {
            sum += position[w] as number;
            seen += 1;
          }
        }
        return { v, key: seen === 0 ? (position[v] as number) : sum / seen, current: position[v] as number };
      });
      keyed.sort((a, b) => a.key - b.key || a.current - b.current);
      keyed.forEach((entry, i) => void (members[i] = entry.v));
      settleHints(members);
      refresh(members);
    }
  }
  return layers;
}
